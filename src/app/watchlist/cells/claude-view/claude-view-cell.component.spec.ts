import {ComponentFixture, TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {MatTooltip} from "@angular/material/tooltip";
import {By} from "@angular/platform-browser";
import {ClaudeViewCellComponent} from "./claude-view-cell.component";
import {ClaudeViewService} from "../../claude-view.service";
import {HELD_NOTE} from "../../claude-view";
import {FakeClaudeViews, keptView} from "../../testing/fake-claude-views";

// One cell of the column "AI · not tested": Claude's word for the stock, a few words of why, and the sentence
// where the pointer rests or the Tab key stops.
describe('ClaudeViewCellComponent (Claude\'s view of a stock, in its row)', () => {
  let views: FakeClaudeViews;
  let fixture: ComponentFixture<ClaudeViewCellComponent>;

  beforeEach(() => {
    views = new FakeClaudeViews();
    TestBed.configureTestingModule({
      imports: [ClaudeViewCellComponent, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: views}],
    });
    fixture = TestBed.createComponent(ClaudeViewCellComponent);
    fixture.componentRef.setInput('symbol', 'ABCD');
    fixture.componentRef.setInput('today', '2026-11-20');
    fixture.detectChanges();
  });

  const el = (): HTMLElement => fixture.nativeElement;
  const say = (): string => (el().textContent ?? '').replace(/\s+/g, ' ').trim();
  const tip = (): string => fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip).message;

  it('asks for what is kept as soon as it is on the page', () => {
    expect(views.started).toBe(1);
  });

  it('shows a dash for a stock that was never asked about', () => {
    expect(say()).toBe('—');
    expect(el().querySelector('[tabindex]')).withContext('nothing to stop at').toBeNull();
  });

  it('shows the word and the short reason, and the sentence under the pointer', () => {
    views.knows({views: {ABCD: {'2026-11-14': keptView('WAIT')}}});
    fixture.detectChanges();
    expect(el().querySelector('.word')!.textContent).toBe('Wait');
    expect(say()).toBe('Wait Results due next week');
    expect(tip()).toBe('It reports its results next week. Asked Nov 14.');
  });

  it('shows the word alone in the short view of the table, the reason still under the pointer', () => {
    views.knows({views: {ABCD: {'2026-11-14': keptView('BUY SOME')}}});
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(say()).toBe('Buy some');
    expect(tip()).toContain('It reports its results next week.');
  });

  it('can be reached with the Tab key, and shows the sentence then', () => {
    views.knows({views: {ABCD: {'2026-11-14': keptView('WAIT')}}});
    fixture.detectChanges();
    const stop = el().querySelector<HTMLElement>('.view')!;
    expect(stop.tabIndex).toBe(0);
    const shown = spyOn(fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip), 'show');
    stop.dispatchEvent(new FocusEvent('focusin', {bubbles: true}));
    expect(shown).toHaveBeenCalled();
  });

  it('is quieter and says its day once the view is more than a week old', () => {
    views.knows({views: {ABCD: {'2026-11-10': keptView('WAIT')}}});
    fixture.detectChanges();
    expect(el().querySelector('.view')!.classList.contains('stale')).toBeTrue();
    expect(say()).toBe('Wait Results due next week from Nov 10');
  });

  it('says on a held stock that The AI was not told so', () => {
    views.knows({views: {ABCD: {'2026-11-14': keptView('BUY SOME')}}});
    fixture.componentRef.setInput('held', true);
    fixture.detectChanges();
    expect(tip().endsWith(HELD_NOTE)).toBeTrue();
  });

  it('says "asking…" while the stock waits for its answer, and its word as soon as it is there', () => {
    views.knows({views: {}, queue: {symbols: ['ABCD', 'EFGH'], done: [], failed: {}}});
    fixture.detectChanges();
    expect(say()).toBe('asking…');
    views.knows({views: {ABCD: {'2026-11-20': keptView('AVOID')}}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {}}});
    fixture.detectChanges();
    expect(say()).toBe('Avoid Results due next week');
  });

  it('says "no answer", with the reason under the pointer, when Claude gave none', () => {
    views.knows({views: {}, failed: {ABCD: 'timeout'}});
    fixture.detectChanges();
    expect(say()).toBe('No answer');
    expect(tip()).toBe('The AI took too long and was stopped. Ask again.');
  });

  // Found by a review of the page: in capitals, at 14px and weight 600, the word was louder than the tested mark
  // beside it ("PASS … BUY SOME"), and read as the page's verdict. It is said like the table's other quiet text.
  it('is not dressed as the tested mark, nor louder than it: a quiet word in small letters, no colour for buy or avoid', () => {
    document.documentElement.style.setProperty('--text-meta', '12px');
    views.knows({views: {ABCD: {'2026-11-14': keptView('BUY SOME')}}});
    fixture.detectChanges();
    const word = el().querySelector<HTMLElement>('.word')!, look = getComputedStyle(word);
    expect(word.textContent).withContext('capitals are the tested mark\'s').toBe('Buy some');
    expect(look.textTransform).toBe('none');
    expect(look.fontSize).toBe('12px');
    expect(Number(look.fontWeight)).toBeLessThanOrEqual(500);
    expect(look.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(look.color).toBe(getComputedStyle(el().querySelector<HTMLElement>('.view')!).color);
    document.documentElement.style.removeProperty('--text-meta');
  });

  it('says "No answer" in the same quiet way', () => {
    views.knows({views: {}, failed: {ABCD: 'timeout'}});
    fixture.detectChanges();
    expect(el().querySelector('.word')!.textContent).toBe('No answer');
  });
});

// The key columns of a list have fixed shares of its width: there the cell is one short word and nothing else.
describe('ClaudeViewCellComponent in the short view of the table', () => {
  it('shows an old view as its word alone, quieter; its day is under the pointer', () => {
    const views = new FakeClaudeViews();
    TestBed.configureTestingModule({
      imports: [ClaudeViewCellComponent, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: views}],
    });
    const fixture = TestBed.createComponent(ClaudeViewCellComponent);
    fixture.componentRef.setInput('symbol', 'ABCD');
    fixture.componentRef.setInput('today', '2026-11-20');
    fixture.componentRef.setInput('compact', true);
    views.knows({views: {ABCD: {'2026-11-10': keptView('WAIT')}}});
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect((el.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe('Wait');
    expect(el.querySelector('.view')!.classList.contains('stale')).toBeTrue();
    expect(fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip).message).toContain('Asked Nov 10.');
  });
});

// The owner of the page: "claude needs to factor also the same group stocks so compare". The stock Claude would take
// first among those of its group wears a star; every compared stock says under the pointer which one that is.
describe('ClaudeViewCellComponent: Claude\'s pick among stocks that move together', () => {
  let views: FakeClaudeViews;
  let fixture: ComponentFixture<ClaudeViewCellComponent>;
  const pick = {first: 'ABCD', why: 'It makes a profit and swings less.', members: ['ABCD', 'EFGH']};

  function create(symbol: string, compact = false): void {
    views = new FakeClaudeViews();
    TestBed.configureTestingModule({
      imports: [ClaudeViewCellComponent, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: views}],
    });
    fixture = TestBed.createComponent(ClaudeViewCellComponent);
    fixture.componentRef.setInput('symbol', symbol);
    fixture.componentRef.setInput('today', '2026-11-20');
    fixture.componentRef.setInput('compact', compact);
    views.knows({views: {ABCD: {'2026-11-18': keptView('BUY SOME')}, EFGH: {'2026-11-18': keptView('WAIT')}}, picks: {'2026-11-18': {A: pick}}});
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement;
  const say = (): string => (el().textContent ?? '').replace(/\s+/g, ' ').trim();
  const tip = (): string => fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip).message;

  it('marks the pick with a star and "first of A" after its word, before the short reason', () => {
    create('ABCD');
    expect(say()).toBe('Buy some ★ first of A Results due next week');
    expect(el().querySelector('.first')!.getAttribute('aria-label')).withContext('read aloud as words, not as "black star"').toBe('first of A');
    expect(tip()).toContain('Of the 2 stocks of group A that the AI compared (ABCD, EFGH), it would take this one first: It makes a profit and swings less.');
  });

  it('marks no other stock of the group, and says under the pointer which one Claude would take first', () => {
    create('EFGH');
    expect(say()).toBe('Wait Results due next week');
    expect(el().querySelector('.first')).toBeNull();
    expect(tip()).toContain('it would take ABCD first: It makes a profit and swings less.');
  });

  it('shows the star alone after the word in the short view of the table, the group and the reason under the pointer', () => {
    create('ABCD', true);
    expect(say()).toBe('Buy some ★');
    expect(el().querySelector('.first')!.getAttribute('aria-label')).toBe('first of A');
    expect(tip()).toContain('it would take this one first');
  });

  it('wears no colour and no shape of its own: a plain star in the row\'s ink', () => {
    create('ABCD');
    const star = el().querySelector<HTMLElement>('.first')!;
    expect(getComputedStyle(star).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(star).borderTopWidth).toBe('0px');
  });

  it('forgets a comparison that is more than a week old', () => {
    create('ABCD');
    fixture.componentRef.setInput('today', '2026-11-26');
    fixture.detectChanges();
    expect(el().querySelector('.first')).toBeNull();
    expect(tip()).not.toContain('compared');
  });
});
