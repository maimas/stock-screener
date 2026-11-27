import {ComponentFixture, TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {ClaudeViewDetailComponent} from "./claude-view-detail.component";
import {ClaudeViewService} from "../claude-view.service";
import {ASK_BUSY, ASK_ONE, ASK_ONE_AGAIN, ASKING_ONE, HELD_NOTE, NOT_IN_A_LIST} from "../claude-view";
import {ReadingService} from "../reading.service";
import {FakeClaudeViews, keptView} from "../testing/fake-claude-views";
import {FakeReadings} from "../testing/fake-readings";
import {makeStock, reportedQuarters} from "../testing/fixtures";

// The owner of the page: "also add the claude response details in the expanded section where it would do the same -
// take stock infor and compare it by the same strategy but for one from the expando". In a stock's details: what the
// AI said of it, in full, with the pages it rests on, which stock of its group it would take first, and one button
// that asks about this one stock and compares it with its group, as a list's button does for a list.
describe("ClaudeViewDetailComponent (the AI's view of a stock, in its details)", () => {
  let views: FakeClaudeViews;
  let fixture: ComponentFixture<ClaudeViewDetailComponent>;

  const stock = (symbol: string) => makeStock({symbol, price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120})});
  const page = {title: 'example Corp lowers its sales forecast', url: 'https://www.news.example.com/forecast'};
  const withSources = {...keptView('WAIT') as object, sources: [page, {title: 'Chip makers slide', url: 'https://example.net/chips'}]};
  const tied = (symbols: string[]) => ({groups: [{letter: 'A', index: 0, symbols, level: 0.7, sector: ''}], alone: [], unknown: []});

  /** The details of ABCD, which is in one of the reader's lists unless the test says otherwise. */
  function create(o: { listed?: boolean, installed?: boolean, known?: object } = {}): void {
    views.installed = o.installed ?? true;
    if (o.listed ?? true) {
      views.elsewhere = [stock('ABCD'), stock('EFGH'), stock('IJKL')];
    }
    if (o.known) {
      views.knows(o.known);
    }
    fixture = TestBed.createComponent(ClaudeViewDetailComponent);
    fixture.componentRef.setInput('stock', stock('ABCD'));
    fixture.componentRef.setInput('today', '2026-11-20');
    fixture.detectChanges();
  }

  beforeEach(() => {
    views = new FakeClaudeViews();
    TestBed.configureTestingModule({
      imports: [ClaudeViewDetailComponent, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: views}, {provide: ReadingService, useValue: new FakeReadings()}],
    });
  });

  const el = (): HTMLElement => fixture.nativeElement;
  const say = (selector: string): string => (el().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const buttons = (): string[] => Array.from(el().querySelectorAll('button')).map(it => it.textContent!.trim());
  const press = (label: string): void => {
    Array.from(el().querySelectorAll('button')).find(it => it.textContent!.trim() === label)!.click();
    fixture.detectChanges();
  };

  it('is headed "AI view", and says beside the title that it is not tested', () => {
    create();
    expect(say('h4')).toBe('AI view · not tested');
    expect(views.started).toBe(1);
  });

  it('offers to ask about this one stock when nothing was asked yet', () => {
    create();
    expect(buttons()).toEqual([ASK_ONE]);
    expect(ASK_ONE).toBe('Ask AI about this stock');
    expect(el().querySelector('.said')).toBeNull();
  });

  it('shows what the AI said: its word and short reason, its sentence, when it was asked and on how many pages it rests', () => {
    create({known: {views: {ABCD: {'2026-11-18': withSources}}}});
    expect(say('.said')).toBe('Wait · Results due next week');
    expect(say('.why')).toBe('It reports its results next week.');
    expect(say('.by .line')).toBe('Asked Nov 18 · not tested · 2 sources');
    expect(buttons()).withContext('it can be asked again').toEqual([ASK_ONE_AGAIN]);
  });

  it('lists the pages the view rests on as links that open apart, each with its site', () => {
    create({known: {views: {ABCD: {'2026-11-18': withSources}}}});
    const links = Array.from(el().querySelectorAll<HTMLAnchorElement>('ul a'));
    expect(links.map(it => it.textContent!.trim())).toEqual(['Example Corp lowers its sales forecast', 'Chip makers slide']);
    expect(links[0].href).toBe('https://www.news.example.com/forecast');
    expect(links[0].target).toBe('_blank');
    expect(links[0].rel).toBe('noopener noreferrer');
    expect(Array.from(el().querySelectorAll('ul .source')).map(it => it.textContent!.trim())).toEqual(['news.example.com', 'example.net']);
  });

  it('has no list of pages for a view that rests on the figures alone', () => {
    create({known: {views: {ABCD: {'2026-11-18': keptView('AVOID')}}}});
    expect(el().querySelector('ul')).toBeNull();
    expect(say('.by .line')).toBe('Asked Nov 18 · not tested');
  });

  it('says which stock of its group the AI would take first, and why', () => {
    views.setTied(tied(['ABCD', 'EFGH', 'IJKL']));
    create({known: {
      views: {ABCD: {'2026-11-18': keptView('WAIT')}},
      picks: {'2026-11-18': {A: {first: 'EFGH', why: 'It makes a profit and swings less.', members: ['ABCD', 'EFGH', 'IJKL']}}},
    }});
    expect(say('.pick')).toBe('Of the 3 stocks of group A that the AI compared (ABCD, EFGH, IJKL), it would take EFGH first: ' +
      'It makes a profit and swings less. Compared Nov 18.');
  });

  it('asks about this one stock, and sends the group it is in with the stocks of that group in the reader\'s lists', () => {
    views.setTied(tied(['ABCD', 'EFGH', 'HELD']));
    create();
    press(ASK_ONE);
    expect(views.asked.length).toBe(1);
    expect(views.asked[0].map(it => it.symbol)).toEqual(['ABCD']);
    expect(Object.keys(views.asked[0][0])).toEqual(['symbol', 'name', 'facts']);
    expect(views.groups[0].map(group => [group.letter, group.members.map(it => it.symbol)])).toEqual([['A', ['ABCD', 'EFGH']]]);
  });

  it('sends the stock once however fast the button is pressed again', () => {
    create();
    press(ASK_ONE);
    expect(el().querySelector<HTMLButtonElement>('button')?.disabled ?? true).toBeTrue();
    el().querySelector<HTMLButtonElement>('button')?.click();
    expect(views.asked.length).toBe(1);
  });

  it('says that the AI is reading while this stock is asked about, then which group it compares, and offers nothing meanwhile', () => {
    views.setTied(tied(['ABCD', 'EFGH']));
    create();
    views.knows({views: {}, queue: {symbols: ['ABCD'], done: [], failed: {}, comparing: ['A']}});
    fixture.detectChanges();
    expect(say('.busy')).toBe(ASKING_ONE);
    expect(el().querySelector('.busy')!.getAttribute('role')).toBe('status');
    expect(buttons()).toEqual([]);
    views.knows({views: {ABCD: {'2026-11-20': keptView('WAIT')}}, queue: {symbols: ['ABCD'], done: ['ABCD'], failed: {}, comparing: ['A']}});
    fixture.detectChanges();
    expect(say('.busy')).toBe('Comparing group A…');
    expect(say('.said')).withContext('its own view is there already').toBe('Wait · Results due next week');
    views.knows({views: {ABCD: {'2026-11-20': keptView('WAIT')}}});
    fixture.detectChanges();
    expect(el().querySelector('.busy')).toBeNull();
    expect(buttons()).toEqual([ASK_ONE_AGAIN]);
  });

  it('says so while its whole list is being asked about, and offers nothing until this stock is through', () => {
    create();
    views.knows({views: {}, queue: {symbols: ['WXYZ', 'ABCD'], done: ['WXYZ'], failed: {}}});
    fixture.detectChanges();
    expect(say('.busy')).toBe(ASKING_ONE);
    expect(buttons()).toEqual([]);
  });

  it('says "busy" when it is pressed while the AI is asked about something else, and sends nothing', () => {
    create();
    views.knows({views: {}, queue: {symbols: ['WXYZ'], done: [], failed: {}}});
    fixture.detectChanges();
    press(ASK_ONE);
    expect(views.asked.length).toBe(0);
    expect(say('.failed')).toBe(ASK_BUSY);
  });

  it('says why when the stock got no answer, and when the server did not take it', () => {
    create({known: {views: {}, failed: {ABCD: 'timeout'}}});
    expect(say('.failed')).toBe('The AI took too long and was stopped. Ask again.');
    press(ASK_ONE);
    views.steps.next({refused: 'failed'});
    fixture.detectChanges();
    expect(say('.failed')).toBe('The AI could not be asked. Try again.');
    expect(el().querySelector('.failed')!.getAttribute('role')).toBe('alert');
  });

  it('offers no button for a stock that is in none of the reader\'s lists: asking about it would send out a holding', () => {
    create({listed: false});
    expect(buttons()).toEqual([]);
    expect(say('.none')).toBe(NOT_IN_A_LIST);
  });

  it('is not there where the AI cannot be asked and nothing is kept; a kept view shows without a button', () => {
    create({installed: false});
    expect(el().querySelector('section')).toBeNull();
    create({installed: false, known: {views: {ABCD: {'2026-11-18': keptView('WAIT')}}}});
    expect(say('.said')).toBe('Wait · Results due next week');
    expect(buttons()).toEqual([]);
  });

  // Found by a review: in the details the AI's word stands in full, and nothing said that it does not know what is
  // held. That is where it most reads as advice against the plan.
  it('says under every view that the AI was not told what is held, and that the plan and its limit still apply', () => {
    create();
    expect(fixture.nativeElement.querySelector('.held')).withContext('nothing was said yet').toBeNull();
    views.knows({views: {ABCD: {'2026-11-18': keptView('BUY SOME')}}});
    fixture.detectChanges();
    expect(say('.held')).toBe(HELD_NOTE);
  });

  it('says "Comparing group A…" only under a stock of that group', () => {
    views.setTied(tied(['EFGH', 'IJKL']));
    create();
    views.knows({views: {ABCD: {'2026-11-20': keptView('WAIT')}}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD', 'EFGH'], failed: {}, comparing: ['A']}});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.busy')).withContext('ABCD is in no group').toBeNull();
    fixture.componentRef.setInput('stock', stock('EFGH'));
    fixture.detectChanges();
    expect(say('.busy')).toBe('Comparing group A…');
  });

  it('says when its group could not be compared, and why', () => {
    views.setTied(tied(['ABCD', 'EFGH']));
    create({known: {views: {ABCD: {'2026-11-20': keptView('WAIT')}}, failedGroups: {A: 'timeout', B: 'failed'}}});
    expect(say('.failed')).toBe('Group A could not be compared: The AI took too long and was stopped. Ask again.');
  });

  it('drops what was said about one stock when the details are another stock\'s', () => {
    create();
    views.knows({views: {}, queue: {symbols: ['WXYZ'], done: [], failed: {}}});
    fixture.detectChanges();
    press(ASK_ONE);
    expect(say('.failed')).toBe(ASK_BUSY);
    fixture.componentRef.setInput('stock', stock('EFGH'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.failed')).toBeNull();
  });

  it('shows the pick also when it was not told the day', () => {
    views.setTied(tied(['ABCD', 'EFGH']));
    views.knows({
      views: {ABCD: {'2026-11-18': keptView('WAIT')}},
      picks: {[new Date().toISOString().slice(0, 10)]: {A: {first: 'EFGH', why: 'It makes a profit.', members: ['ABCD', 'EFGH']}}},
    });
    views.elsewhere = [stock('ABCD')];
    fixture = TestBed.createComponent(ClaudeViewDetailComponent);
    fixture.componentRef.setInput('stock', stock('ABCD'));
    fixture.detectChanges();
    expect(say('.pick')).toContain('it would take EFGH first');
  });

  it('follows the stock whose details it is in', () => {
    create({known: {views: {ABCD: {'2026-11-18': keptView('WAIT')}, EFGH: {'2026-11-18': keptView('AVOID', 'Sales shrinking, heavy debt')}}}});
    fixture.componentRef.setInput('stock', stock('EFGH'));
    fixture.detectChanges();
    expect(say('.said')).toBe('Avoid · Sales shrinking, heavy debt');
  });
});
