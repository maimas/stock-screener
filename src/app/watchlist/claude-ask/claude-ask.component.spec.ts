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

// The one button above a list: "Ask Claude about these 5". It sends each stock's figures, nothing about what is
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
    expect(button().textContent!.trim()).toBe('Ask Claude about these 2');
    expect(button().type).toBe('button');
    create([stock('ABCD')]);
    expect(button().textContent!.trim()).toBe('Ask Claude about this one');
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
    expect(button().textContent!.trim()).toBe('Asking Claude… 1 of 2');
    expect(button().disabled).toBeTrue();
    views.knows({views: {}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {EFGH: 'timeout'}}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).withContext('a stock that got no answer is through too').toBe('Asking Claude… 2 of 2');
    views.knows({views: {}, failed: {EFGH: 'timeout'}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Ask Claude about these 2');
    expect(button().disabled).toBeFalse();
  });

  it('keeps its own words while another list is asked about, and says "busy" when pressed then', () => {
    create();
    views.knows({views: {}, queue: {symbols: ['WXYZ'], done: [], failed: {}}});
    fixture.detectChanges();
    expect(button().textContent!.trim()).toBe('Ask Claude about these 2');
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
    expect(say('.ask-note')).toBe('Claude could not be asked. Try again.');
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
    expect(button().textContent!.trim()).toBe('Ask Claude about 10 of these 12');
    button().click();
    expect(views.asked[0].map(it => it.symbol)).toEqual(['DDDD', 'EEEE', 'FFFF', 'GGGG', 'HHHH', 'IIII', 'JJJJ', 'KKKK', 'LLLL', 'BBBB']);
  });
});
