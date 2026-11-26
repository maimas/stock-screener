import {discardPeriodicTasks, fakeAsync, TestBed, tick} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {ClaudeViewService, MAX_FAILED_POLLS, MAX_VIEW_POLLS, ViewStep} from "./claude-view.service";
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

// The column's cells and the buttons above the lists all show the same thing: what the server last said. The service
// keeps it for them, and follows a list by itself, so a row fills in for every part of the page at once and goes on
// filling in whatever becomes of the button that was pressed.
describe('ClaudeViewService: what the page knows, kept for all its parts', () => {
  let service: ClaudeViewService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(ClaudeViewService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const kept = (body: object) => http.expectOne('/claude/views').flush(server(body));
  const down = () => http.expectOne('/claude/views').flush('gateway down', {status: 504, statusText: 'Gateway Timeout'});
  const taken = () => http.expectOne('/claude/views').flush(server({state: 'asking', queue: queue([])}), {status: 202, statusText: 'Accepted'});

  it('knows nothing, and asks nothing, until a part of the page starts it', () => {
    expect(service.state$.value).toEqual({views: {}, history: {}, failed: {}});
    http.expectNone('/claude/views');
  });

  it('loads what is kept once, however many parts start it', () => {
    service.start();
    service.start();
    kept({views: {ABCD: {'2026-11-26': view('WAIT')}}, failed: {}});
    service.start();
    expect(service.state$.value.views['ABCD'].view).toBe('WAIT');
  });

  // Found by a review: with Claude Code out of reach when the page opened, the column was all dashes and its record
  // gone, as if nothing had ever been asked. What is kept is in the database and needs no Claude Code to be read.
  it('loads what is kept without asking first whether Claude Code can be reached', () => {
    service.start();
    http.expectNone('/claude/status');
    kept({views: {ABCD: {'2026-11-26': view('AVOID')}}, failed: {}});
    expect(service.state$.value.views['ABCD'].view).toBe('AVOID');
  });

  it('goes on following a list that was being asked about when the page was opened', fakeAsync(() => {
    service.start();
    kept({views: {}, queue: queue([]), failed: {}});
    expect(service.state$.value.queue).toEqual(queue([]));
    tick(POLL_MS);
    kept({views: {ABCD: {'2026-11-26': view('WAIT')}}, failed: {}});
    expect(service.state$.value.queue).toBeUndefined();
    expect(Object.keys(service.state$.value.views)).toEqual(['ABCD']);
    tick(POLL_MS * 3);                               // and asks no more
  }));

  it('keeps what it knows up to date while a list is asked about, and tells the one who asked once that it was taken', fakeAsync(() => {
    const steps: ViewStep[] = [];
    service.askAbout(list).subscribe(step => steps.push(step));
    taken();
    expect(service.state$.value.queue).toEqual(queue([]));
    expect(steps.length).toBe(1);
    tick(POLL_MS);
    kept({views: {ABCD: {'2026-11-26': view('WAIT')}}, failed: {EFGH: 'timeout'}});
    expect(service.state$.value.views['ABCD'].view).toBe('WAIT');
    expect(service.state$.value.failed).toEqual({EFGH: 'timeout'});
    expect(steps.length).withContext('the rows are told through what the service knows, not through the one who asked').toBe(1);
  }));

  it('does not blank the rows when a list is taken: the views it knew stay until the server says otherwise', fakeAsync(() => {
    service.start();
    kept({views: {ABCD: {'2026-11-20': view('AVOID')}}, failed: {}});
    service.askAbout(list).subscribe();
    taken();
    expect(service.state$.value.views['ABCD'].view).toBe('AVOID');
    expect(service.state$.value.queue).toEqual(queue([]));
    tick(POLL_MS);
    kept({views: {ABCD: {'2026-11-20': view('AVOID')}}, failed: {}});
  }));

  // Found by a review: the following belonged to the button that was pressed. A list deleted while it was asked
  // about, or a second click before the first answer, left "Asking Claude…" standing and the rows empty until a reload.
  it('follows the list by itself, whatever becomes of the one who asked', fakeAsync(() => {
    const asking = service.askAbout(list).subscribe();
    taken();
    asking.unsubscribe();
    tick(POLL_MS);
    kept({views: {ABCD: {'2026-11-26': view('WAIT')}}, queue: queue(['ABCD']), failed: {}});
    expect(service.state$.value.queue).toEqual(queue(['ABCD']));
    tick(POLL_MS);
    kept({views: {ABCD: {'2026-11-26': view('WAIT')}, EFGH: {'2026-11-26': view('AVOID')}}, failed: {}});
    expect(Object.keys(service.state$.value.views)).toEqual(['ABCD', 'EFGH']);
    expect(service.state$.value.queue).toBeUndefined();
  }));

  it('looks where things stand when told "busy", and follows the list that is being asked about', fakeAsync(() => {
    const steps: ViewStep[] = [];
    service.askAbout(list).subscribe(step => steps.push(step));
    http.expectOne('/claude/views').flush(server({state: 'busy'}), {status: 429, statusText: 'Too Many Requests'});
    expect(steps).toEqual([{refused: 'busy'}]);
    kept({views: {}, queue: {symbols: ['WXYZ'], done: [], failed: {}}, failed: {}});
    expect(service.state$.value.queue).toEqual({symbols: ['WXYZ'], done: [], failed: {}});
    tick(POLL_MS);
    kept({views: {WXYZ: {'2026-11-26': view('WAIT')}}, failed: {}});
    expect(service.state$.value.views['WXYZ'].view).toBe('WAIT');
  }));

  // Found by a review: one poll that failed (the app restarting, the database not answering for a moment) read as
  // "nothing kept, nothing going on": every row of every list went to a dash and stayed there until a reload.
  it('keeps what it knows, and goes on following, when the server does not answer for a moment', fakeAsync(() => {
    service.start();
    kept({views: {ABCD: {'2026-11-20': view('AVOID')}}, queue: queue([]), failed: {}});
    tick(POLL_MS);
    down();
    expect(service.state$.value.views['ABCD'].view).withContext('nothing is blanked').toBe('AVOID');
    expect(service.state$.value.queue).withContext('and the list is still being asked about').toEqual(queue([]));
    tick(POLL_MS);
    kept({views: {ABCD: {'2026-11-26': view('WAIT')}}, failed: {}});
    expect(service.state$.value.views['ABCD'].view).toBe('WAIT');
    expect(service.state$.value.queue).toBeUndefined();
  }));

  it('keeps nothing wrong when the first look fails: no views, and the page as it was', () => {
    service.start();
    down();
    expect(service.state$.value).toEqual({views: {}, history: {}, failed: {}});
  });

  it('stops following a server that stays silent, and frees the buttons: the views it knew stay', fakeAsync(() => {
    service.start();
    kept({views: {ABCD: {'2026-11-20': view('AVOID')}}, queue: queue([]), failed: {}});
    for (let i = 0; i < MAX_FAILED_POLLS; i++) {
      tick(POLL_MS);
      down();
    }
    tick(POLL_MS * 3);
    http.expectNone('/claude/views');
    expect(service.state$.value.queue).withContext('nobody is told "Asking Claude…" for ever').toBeUndefined();
    expect(service.state$.value.views['ABCD'].view).toBe('AVOID');
  }));

  it('frees the buttons when a list never ends, after twenty minutes of asking', fakeAsync(() => {
    service.start();
    kept({views: {}, queue: queue([]), failed: {}});
    for (let i = 0; i < MAX_VIEW_POLLS; i++) {
      tick(POLL_MS);
      kept({views: {}, queue: queue([]), failed: {}});
    }
    tick(POLL_MS * 3);
    http.expectNone('/claude/views');
    expect(service.state$.value.queue).toBeUndefined();
  }));
});
