import {fakeAsync, TestBed, tick} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {MAX_POLLS, POLL_MS, ReadingService} from "./reading.service";
import {Reading, ReadingRequest, ReadingState} from "./reading";

const request: ReadingRequest = {symbol: 'ABCD', name: 'Example Corp', day: '2026-11-03', percent: 12};
const reading: Reading = {
  day: '2026-11-03', what: 'The company lowered its sales forecast.', about: 'company', readAt: '2026-11-22T12:00:00.000Z',
  sources: [{title: 'Example Corp lowers its sales forecast', url: 'https://news.example.com/forecast'}],
};
const server = (body: object) => ({store: 'watchlist', ...body});

describe('ReadingService (asks the Claude Code on this computer, through the dev server)', () => {
  let service: ReadingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(ReadingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('available', () => {
    const answered = (answer: (call: ReturnType<HttpTestingController['expectOne']>) => void): boolean | undefined => {
      let result: boolean | undefined;
      service.available().subscribe(it => result = it);
      answer(http.expectOne('/claude/status'));
      return result;
    };

    it('is true when Claude Code is installed on this computer', () => {
      expect(answered(call => call.flush(server({claude: true})))).toBeTrue();
    });

    it('is false when it is not installed', () => {
      expect(answered(call => call.flush(server({claude: false})))).toBeFalse();
    });

    it('is false when the app was started before this feature existed, or does not answer', () => {
      expect(answered(call => call.flush('<!doctype html><html></html>'))).toBeFalse();
    });

    it('is false when the server fails', () => {
      expect(answered(call => call.flush('gateway down', {status: 504, statusText: 'Gateway Timeout'}))).toBeFalse();
    });

    it('asks once, however many parts of the page want to know', () => {
      const seen: boolean[] = [];
      service.available().subscribe(it => seen.push(it));
      service.available().subscribe(it => seen.push(it));
      http.expectOne('/claude/status').flush(server({claude: true}));
      service.available().subscribe(it => seen.push(it));
      expect(seen).toEqual([true, true, true]);
    });
  });

  describe('state', () => {
    it('gives what is kept for a stock, asked for by its symbol', () => {
      let state: ReadingState | undefined;
      service.state('BRK.B').subscribe(it => state = it);
      http.expectOne('/claude/readings/BRK.B').flush(server({state: 'done', reading}));
      expect(state).toEqual({state: 'done', reading});
    });

    it('is "none" when the server does not answer: opening a stock\'s details must not show an error', () => {
      let state: ReadingState | undefined;
      service.state('ABCD').subscribe(it => state = it);
      http.expectOne('/claude/readings/ABCD').flush('gateway down', {status: 504, statusText: 'Gateway Timeout'});
      expect(state).toEqual({state: 'none'});
    });
  });

  describe('read', () => {
    let seen: ReadingState[];
    let done: boolean;
    const ask = () => {
      seen = [];
      done = false;
      service.read(request).subscribe({next: it => seen.push(it), complete: () => done = true});
      const call = http.expectOne('/claude/readings');
      expect(call.request.method).toBe('POST');
      expect(call.request.body).toEqual(request);
      return call;
    };
    const poll = (body: object) => {
      tick(POLL_MS);
      http.expectOne('/claude/readings/ABCD').flush(body);
    };

    it('asks for the reading, says it is being read, and follows it until it is there', fakeAsync(() => {
      ask().flush(server({state: 'reading'}), {status: 202, statusText: 'Accepted'});
      expect(seen).toEqual([{state: 'reading'}]);

      poll(server({state: 'reading'}));
      poll(server({state: 'reading'}));
      expect(seen).toEqual([{state: 'reading'}]);

      poll(server({state: 'done', reading}));
      expect(seen).toEqual([{state: 'reading'}, {state: 'done', reading}]);
      expect(done).toBeTrue();
      tick(POLL_MS * 5);
      http.expectNone('/claude/readings/ABCD');
    }));

    it('says why when the run did not work', fakeAsync(() => {
      ask().flush(server({state: 'reading'}), {status: 202, statusText: 'Accepted'});
      poll(server({state: 'failed', reason: 'no-source'}));
      expect(seen).toEqual([{state: 'reading'}, {state: 'failed', reason: 'no-source'}]);
      expect(done).toBeTrue();
    }));

    it('says so when another stock is being read, and does not wait for it', fakeAsync(() => {
      ask().flush(server({state: 'busy'}), {status: 429, statusText: 'Too Many Requests'});
      expect(seen).toEqual([{state: 'failed', reason: 'busy'}]);
      expect(done).toBeTrue();
      tick(POLL_MS * 3);
      http.expectNone('/claude/readings/ABCD');
    }));

    it('says so when Claude Code is not installed', fakeAsync(() => {
      ask().flush(server({state: 'failed', reason: 'not-installed'}), {status: 503, statusText: 'Service Unavailable'});
      expect(seen).toEqual([{state: 'failed', reason: 'not-installed'}]);
    }));

    it('says the page could not reach Claude Code when the app was started before this feature existed', fakeAsync(() => {
      ask().flush('<!doctype html><html></html>', {status: 404, statusText: 'Not Found'});
      expect(seen).toEqual([{state: 'failed', reason: 'no-server'}]);
    }));

    it('treats a run that was lost (the app was restarted meanwhile) as failed', fakeAsync(() => {
      ask().flush(server({state: 'reading'}), {status: 202, statusText: 'Accepted'});
      poll(server({state: 'none'}));
      expect(seen).toEqual([{state: 'reading'}, {state: 'failed', reason: 'failed'}]);
    }));

    it('stops asking after three minutes', fakeAsync(() => {
      expect(POLL_MS * MAX_POLLS).toBe(180_000);
      ask().flush(server({state: 'reading'}), {status: 202, statusText: 'Accepted'});
      for (let i = 0; i < MAX_POLLS; i++) {
        poll(server({state: 'reading'}));
      }
      expect(seen).toEqual([{state: 'reading'}, {state: 'failed', reason: 'timeout'}]);
      expect(done).toBeTrue();
      tick(POLL_MS * 3);
      http.expectNone('/claude/readings/ABCD');
    }));
  });

  describe('follow', () => {
    it('picks up a run that was already going when the page was opened', fakeAsync(() => {
      const seen: ReadingState[] = [];
      service.follow('ABCD').subscribe(it => seen.push(it));
      tick(POLL_MS);
      http.expectOne('/claude/readings/ABCD').flush(server({state: 'reading'}));
      tick(POLL_MS);
      http.expectOne('/claude/readings/ABCD').flush(server({state: 'done', reading}));
      expect(seen).toEqual([{state: 'done', reading}]);
    }));
  });
});
