import {discardPeriodicTasks, fakeAsync, TestBed, tick} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {ClaudeViewService, MAX_VIEW_POLLS, ViewStep} from "./claude-view.service";
import {ViewRequest} from "./claude-view";
import {POLL_MS} from "./reading.service";

const list: ViewRequest[] = [
  {symbol: 'ABCD', name: 'Example Corp', facts: {mark: 'DIP BUY', belowHigh: 41.7}},
  {symbol: 'EFGH', name: 'Other Corp', facts: {mark: 'none'}},
];
const view = (word: string) => ({view: word, short: 'Results due next week', why: 'It reports its results next week.', sources: [], asked: '2026-11-26T15:00:00.000Z'});
const server = (body: object) => ({store: 'watchlist', ...body});
const queue = (done: string[]) => ({symbols: ['ABCD', 'EFGH'], done, failed: {}});

describe("ClaudeViewService (asks Claude Code about the stocks of a list, through the app's own server)", () => {
  let service: ClaudeViewService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(ClaudeViewService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('can be asked where the readings can: one look-up for the whole page', () => {
    const seen: boolean[] = [];
    service.available().subscribe(it => seen.push(it));
    service.available().subscribe(it => seen.push(it));
    http.expectOne('/claude/status').flush(server({claude: true}));
    expect(seen).toEqual([true, true]);
  });

  it('gives the views that are kept', () => {
    let words: string[] = [];
    service.views().subscribe(state => words = Object.values(state.views).map(it => it.view));
    http.expectOne('/claude/views').flush(server({views: {ABCD: {'2026-11-26': view('WAIT')}}, failed: {}}));
    expect(words).toEqual(['WAIT']);
  });

  it('has no views, and no error, when the server fails or something else answers', () => {
    const seen: object[] = [];
    service.views().subscribe(state => seen.push(state));
    http.expectOne('/claude/views').flush('gateway down', {status: 504, statusText: 'Gateway Timeout'});
    service.views().subscribe(state => seen.push(state));
    http.expectOne('/claude/views').flush('<!doctype html><html></html>');
    expect(seen).toEqual([{views: {}, history: {}, failed: {}}, {views: {}, history: {}, failed: {}}]);
  });

  it('sends the stocks with their figures and nothing else', () => {
    service.ask(list).subscribe();
    const call = http.expectOne('/claude/views');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({list});
    call.flush(server({state: 'busy'}), {status: 429, statusText: 'Too Many Requests'});
  });

  it('follows the list as its rows fill in, and ends when the last stock is through', fakeAsync(() => {
    const steps: ViewStep[] = [];
    let ended = false;
    service.ask(list).subscribe({next: step => steps.push(step), complete: () => ended = true});
    http.expectOne('/claude/views').flush(server({state: 'asking', queue: queue([])}), {status: 202, statusText: 'Accepted'});
    expect(steps).toEqual([{views: {}, history: {}, failed: {}, queue: queue([])}]);

    tick(POLL_MS);
    http.expectOne('/claude/views').flush(server({views: {ABCD: {'2026-11-26': view('WAIT')}}, queue: queue(['ABCD']), failed: {}}));
    expect(steps.length).toBe(2);
    expect((steps[1] as any).queue.done).toEqual(['ABCD']);
    expect((steps[1] as any).views.ABCD.view).toBe('WAIT');
    expect(ended).toBeFalse();

    tick(POLL_MS);
    http.expectOne('/claude/views').flush(server({views: {ABCD: {'2026-11-26': view('WAIT')}, EFGH: {'2026-11-26': view('AVOID')}}, failed: {}}));
    expect(steps.length).toBe(3);
    expect((steps[2] as any).queue).toBeUndefined();
    expect(Object.keys((steps[2] as any).views)).toEqual(['ABCD', 'EFGH']);
    expect(ended).toBeTrue();
    tick(POLL_MS * 3);                               // and asks no more
  }));

  it('says the list has to wait when Claude is busy with another list', () => {
    const steps: ViewStep[] = [];
    let ended = false;
    service.ask(list).subscribe({next: step => steps.push(step), complete: () => ended = true});
    http.expectOne('/claude/views').flush(server({state: 'busy'}), {status: 429, statusText: 'Too Many Requests'});
    expect(steps).toEqual([{refused: 'busy'}]);
    expect(ended).toBeTrue();
  });

  it('says why when Claude Code cannot be reached, or the list was not taken', () => {
    const refusals = (flush: (call: ReturnType<HttpTestingController['expectOne']>) => void): ViewStep[] => {
      const steps: ViewStep[] = [];
      service.ask(list).subscribe(step => steps.push(step));
      flush(http.expectOne('/claude/views'));
      return steps;
    };
    expect(refusals(call => call.flush(server({state: 'failed', reason: 'not-installed'}), {status: 503, statusText: 'Service Unavailable'})))
      .toEqual([{refused: 'not-installed'}]);
    expect(refusals(call => call.flush(server({error: 'That is not a stock symbol.'}), {status: 400, statusText: 'Bad Request'})))
      .toEqual([{refused: 'failed'}]);
    expect(refusals(call => call.flush('<!doctype html><html></html>'))).toEqual([{refused: 'failed'}]);
    expect(refusals(call => call.error(new ProgressEvent('error')))).toEqual([{refused: 'failed'}]);
  });

  it('picks up a list that is already being asked about (the page was opened again meanwhile)', fakeAsync(() => {
    const steps: ViewStep[] = [];
    let ended = false;
    service.follow().subscribe({next: step => steps.push(step), complete: () => ended = true});
    tick(POLL_MS);
    http.expectOne('/claude/views').flush(server({views: {}, queue: queue(['ABCD']), failed: {}}));
    tick(POLL_MS);
    http.expectOne('/claude/views').flush(server({views: {}, failed: {EFGH: 'timeout'}}));
    expect(steps.length).toBe(2);
    expect((steps[1] as any).failed).toEqual({EFGH: 'timeout'});
    expect(ended).toBeTrue();
  }));

  it('stops following a list that never ends', fakeAsync(() => {
    let ended = false;
    service.follow().subscribe({complete: () => ended = true});
    for (let i = 0; i < MAX_VIEW_POLLS; i++) {
      tick(POLL_MS);
      http.expectOne('/claude/views').flush(server({views: {}, queue: queue([]), failed: {}}));
    }
    expect(ended).toBeTrue();
    discardPeriodicTasks();
  }));
});
