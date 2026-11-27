import {ComponentFixture, TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {By} from "@angular/platform-browser";
import {MatTooltip} from "@angular/material/tooltip";
import {ClaudeAskComponent} from "./claude-ask.component";
import {ClaudeViewService} from "../claude-view.service";
import {ASK_BUSY, ASK_TIP} from "../claude-view";
import {ReadingService} from "../reading.service";
import {FakeClaudeViews, keptView} from "../testing/fake-claude-views";
import {FakeReadings} from "../testing/fake-readings";
import {flatCloses, makeStock, reportedQuarters} from "../testing/fixtures";

// The one button above a list: "Ask AI about these 5". It sends each stock's figures, nothing about what is
// owned, and says how far Claude is while the rows fill in.
describe('ClaudeAskComponent (the button that asks Claude about a list)', () => {
  let views: FakeClaudeViews;
  let readings: FakeReadings;
  let fixture: ComponentFixture<ClaudeAskComponent>;

  const stock = (symbol: string) => makeStock({symbol, price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120})});
  /** A stock with one bad day: 100 for 200 days, then 80. */
  const fell = makeStock({symbol: 'FELL', price: 80, high52: 100, closes: [...flatCloses(200, 100), ...flatCloses(50, 80)]});

  function create(stocks = [stock('ABCD'), stock('EFGH')]): void {
    fixture = TestBed.createComponent(ClaudeAskComponent);
    fixture.componentRef.setInput('stocks', stocks);
    fixture.detectChanges();
  }

  beforeEach(() => {
    views = new FakeClaudeViews();
    readings = new FakeReadings();
    TestBed.configureTestingModule({
      imports: [ClaudeAskComponent, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: views}, {provide: ReadingService, useValue: readings}],
    });
  });

  const el = (): HTMLElement => fixture.nativeElement;
  const button = (): HTMLButtonElement => el().querySelector('button')!;
  const say = (selector: string): string => (el().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('offers to ask about the stocks of the list, by their number', () => {
    create();
    expect(button().textContent!.trim()).toBe('Ask AI about these 2');
    expect(button().type).toBe('button');
    create([stock('ABCD')]);
    expect(button().textContent!.trim()).toBe('Ask AI about this one');
  });

  // Seen on the page: it stood beside "Edit list" as a grey box of the browser's own. It is a link like its neighbour.
  it('looks like the link beside it, not like a box of the browser', () => {
    create();
    const look = getComputedStyle(button());
    expect(look.borderTopWidth).toBe('0px');
    expect(look.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(look.textDecorationLine).toBe('underline');
    expect(look.cursor).toBe('pointer');
    expect(look.paddingLeft).toBe('0px');
  });

  it('is not there where Claude Code cannot be asked, or for a list with no stock', () => {
    views.installed = false;
    create();
    expect(el().querySelector('button')).toBeNull();
    views.installed = true;
    create([]);
    expect(el().querySelector('button')).toBeNull();
  });

  it('says under the pointer, and to the Tab key, who is asked what and that nothing owned is sent', () => {
    create();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.message).toBe(ASK_TIP);
    expect(ASK_TIP).toContain('Nothing about what you hold is sent.');
    const shown = spyOn(tip, 'show');
    button().dispatchEvent(new FocusEvent('focusin', {bubbles: true}));
    expect(shown).toHaveBeenCalled();
  });

  it('sends each stock with its name and its figures, and nothing else', () => {
    create();
    button().click();
    expect(views.asked.length).toBe(1);
    expect(views.asked[0].map(it => it.symbol)).toEqual(['ABCD', 'EFGH']);
    expect(views.asked[0][0].name).toBe('ABCD Inc');
    expect(Object.keys(views.asked[0][0])).toEqual(['symbol', 'name', 'facts']);
    expect(views.asked[0][0].facts.belowHigh).toBe(20);
  });

  it('adds what kind of news a kept reading of the stock\'s biggest fall found, when it is about that same day', () => {
    const day = (factsDay => factsDay)(new Date(fell.chart!.timeStamps[200]).toISOString().slice(0, 10));
    readings.kept['FELL'] = {state: 'done', reading: {day, what: 'x', about: 'market', sources: [], readAt: '2026-11-20T10:00:00.000Z'}};
    create([fell, stock('ABCD')]);
    button().click();
    expect(views.asked[0][0].facts.dropAbout).toBe('market');
    expect(views.asked[0][1].facts.dropAbout).toBeUndefined();

    views.steps.next({refused: 'failed'});                // the first press was answered: the button can be pressed again
    readings.kept['FELL'] = {state: 'done', reading: {day: '2026-01-05', what: 'x', about: 'company', sources: [], readAt: '2026-11-20T10:00:00.000Z'}};
    button().click();
    expect(views.asked[1][0].facts.dropAbout).withContext('a reading of another day says nothing of this fall').toBeUndefined();
  });

  it('says how far Claude is while its list is asked about, and cannot be pressed twice', () => {
    create();
    views.knows({views: {}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {}}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Asking AI… 1 of 2');
    expect(button().disabled).toBeTrue();
    views.knows({views: {}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {EFGH: 'timeout'}}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).withContext('a stock that got no answer is through too').toBe('Asking AI… 2 of 2');
    views.knows({views: {}, failed: {EFGH: 'timeout'}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Ask AI about these 2');
    expect(button().disabled).toBeFalse();
  });

  it('keeps its own words while another list is asked about, and says "busy" when pressed then', () => {
    create();
    views.knows({views: {}, queue: {symbols: ['WXYZ'], done: [], failed: {}}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Ask AI about these 2');
    button().click();
    expect(views.asked.length).withContext('nothing is sent while Claude is busy').toBe(0);
    fixture.detectChanges();
    expect(say('.ask-note')).toBe(ASK_BUSY);
    expect(el().querySelector('.ask-note')!.getAttribute('role')).toBe('status');
  });

  it('says so when the server did not take the list', () => {
    create();
    button().click();
    views.steps.next({refused: 'busy'});
    fixture.detectChanges();
    expect(say('.ask-note')).toBe(ASK_BUSY);
    button().click();
    fixture.detectChanges();
    expect(say('.ask-note')).withContext('a new press clears the old words').toBe('');
    views.steps.next({refused: 'failed'});
    fixture.detectChanges();
    expect(say('.ask-note')).toBe('The AI could not be asked. Try again.');
  });

  // Found by a review: a second click before the first answer cancelled the first request and sent the list again;
  // the server said "busy" about the list's own run, and its rows were not followed.
  it('sends a list once, however fast the button is pressed again, and can be pressed anew after the answer', () => {
    create();
    button().click();
    button().click();
    button().click();
    expect(views.asked.length).toBe(1);
    fixture.detectChanges();
    expect(button().disabled).withContext('while the list is on its way').toBeTrue();
    views.steps.next({refused: 'failed'});
    fixture.detectChanges();
    expect(button().disabled).toBeFalse();
    button().click();
    expect(views.asked.length).toBe(2);
  });

  it('says when the list was last asked about', () => {
    create();
    expect(say('.asked')).toBe('');
    views.knows({views: {ABCD: {'2026-11-14': keptView('WAIT')}, EFGH: {'2026-11-20': keptView('AVOID')}, WXYZ: {'2026-11-25': keptView('WAIT')}}});
    fixture.detectChanges();
    expect(say('.asked')).withContext('the newest view of its own stocks').toBe('asked Nov 20');
  });

  it('asks about ten stocks at a time in a longer list: those never asked about first, then those asked longest ago', () => {
    const symbols = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF', 'GGGG', 'HHHH', 'IIII', 'JJJJ', 'KKKK', 'LLLL'];
    create(symbols.map(stock));
    views.knows({views: {AAAA: {'2026-11-20': keptView('WAIT')}, BBBB: {'2026-11-10': keptView('WAIT')}, CCCC: {'2026-11-15': keptView('WAIT')}}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Ask AI about 10 of these 12');
    button().click();
    expect(views.asked[0].map(it => it.symbol)).toEqual(['DDDD', 'EEEE', 'FFFF', 'GGGG', 'HHHH', 'IIII', 'JJJJ', 'KKKK', 'LLLL', 'BBBB']);
  });
});

// The owner of the page: "claude needs to factor also the same group stocks so compare". With the list, the button
// sends the groups its stocks are in, so that Claude can compare the stocks that move together after it.
describe('ClaudeAskComponent: the groups that go with a list', () => {
  let views: FakeClaudeViews;
  let fixture: ComponentFixture<ClaudeAskComponent>;

  const stock = (symbol: string) => makeStock({symbol, price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120})});
  const tiedGroup = (letter: string, index: number, symbols: string[]) => ({letter, index, symbols, level: 0.7, sector: ''});
  const tied = (groups: ReturnType<typeof tiedGroup>[]) => ({groups, alone: [], unknown: []});

  function create(stocks: ReturnType<typeof stock>[], groups: ReturnType<typeof tiedGroup>[]): void {
    fixture = TestBed.createComponent(ClaudeAskComponent);
    fixture.componentRef.setInput('stocks', stocks);
    fixture.componentRef.setInput('tied', tied(groups));
    fixture.detectChanges();
  }

  beforeEach(() => {
    views = new FakeClaudeViews();
    TestBed.configureTestingModule({
      imports: [ClaudeAskComponent, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: views}, {provide: ReadingService, useValue: new FakeReadings()}],
    });
  });

  const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('button')!;
  const sent = () => views.groups[views.groups.length - 1].map(group => [group.letter, group.members.map(it => it.symbol)]);

  it('says which stocks its list has for as long as it is on the page', () => {
    create([stock('ABCD'), stock('EFGH')], []);
    expect(views.registered).toBe(1);
    expect(views.listed().map(it => it.quote!.symbol)).toEqual(['ABCD', 'EFGH']);
    fixture.destroy();
    expect(views.registered).toBe(0);
  });

  it('sends each group a stock of the list is in, with the stocks of that group in any of the reader\'s lists: its own first', () => {
    views.elsewhere = [stock('MNOP'), stock('QRST'), stock('UVWX')];
    create([stock('ABCD'), stock('EFGH'), stock('IJKL')], [
      tiedGroup('A', 0, ['ABCD', 'HELD', 'MNOP', 'QRST']),      // HELD is in no list: held outside every list, or not on the page's lists
      tiedGroup('B', 1, ['EFGH', 'IJKL']),
      tiedGroup('C', 2, ['UVWX', 'ZZZZ']),                      // no stock of this list
    ]);
    button().click();
    expect(views.asked[0].map(it => it.symbol)).toEqual(['ABCD', 'EFGH', 'IJKL']);
    expect(sent()).toEqual([['A', ['ABCD', 'MNOP', 'QRST']], ['B', ['EFGH', 'IJKL']]]);
    const first = views.groups[0][0].members[0], other = views.groups[0][0].members[1];
    expect(first).withContext('a stock of the list is sent as it is asked about').toBe(views.asked[0][0]);
    expect(Object.keys(other)).toEqual(['symbol', 'name', 'facts']);
    expect(other.facts.belowHigh).toBe(20);
  });

  it('sends no group of which one stock only is in the reader\'s lists: there is nothing to compare it with', () => {
    create([stock('ABCD'), stock('EFGH')], [tiedGroup('A', 0, ['ABCD', 'HELD', 'GONE'])]);
    button().click();
    expect(sent()).toEqual([]);
  });

  it('sends no group when the page has none', () => {
    create([stock('ABCD'), stock('EFGH')], []);
    button().click();
    expect(views.groups).toEqual([[]]);
  });

  it('sends at most ten stocks of a group, the list\'s own first', () => {
    const others = Array.from({length: 12}, (_, i) => `OT${String.fromCharCode(65 + i)}`);
    views.elsewhere = others.map(stock);
    create([stock('ABCD'), stock('EFGH')], [tiedGroup('A', 0, [...others.slice(0, 6), 'ABCD', ...others.slice(6), 'EFGH'])]);
    button().click();
    const members = views.groups[0][0].members.map(it => it.symbol);
    expect(members.length).toBe(10);
    expect(members.slice(0, 2)).toEqual(['ABCD', 'EFGH']);
  });

  it('says which group Claude is comparing once the stocks of its list are through', () => {
    create([stock('ABCD'), stock('EFGH')], [tiedGroup('A', 0, ['ABCD', 'EFGH'])]);
    views.knows({views: {}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {}, comparing: ['A', 'B']}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).withContext('a stock is still to come').toBe('Asking AI… 1 of 2');
    views.knows({views: {}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {EFGH: 'timeout'}, comparing: ['A', 'B']}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Comparing group A…');
    expect(button().disabled).toBeTrue();
    views.knows({views: {}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {EFGH: 'timeout'}, comparing: ['B']}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Comparing group B…');
    views.knows({views: {}, failed: {EFGH: 'timeout'}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Ask AI about these 2');
  });
});
