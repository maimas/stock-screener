import {ComponentFixture, TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {MatTooltip} from "@angular/material/tooltip";
import {By} from "@angular/platform-browser";
import {ClaudeViewCellComponent} from "./claude-view-cell.component";
import {ClaudeViewService} from "../../claude-view.service";
import {HELD_NOTE} from "../../claude-view";
import {FakeClaudeViews, keptView} from "../../testing/fake-claude-views";

// One cell of the column "Claude · not tested": Claude's word for the stock, a few words of why, and the sentence
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
    expect(el().querySelector('.word')!.textContent).toBe('WAIT');
    expect(say()).toBe('WAIT Results due next week');
    expect(tip()).toBe('It reports its results next week. Asked Nov 14.');
  });

  it('shows the word alone in the short view of the table, the reason still under the pointer', () => {
    views.knows({views: {ABCD: {'2026-11-14': keptView('BUY SOME')}}});
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(say()).toBe('BUY SOME');
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
    expect(say()).toBe('WAIT Results due next week from Nov 10');
  });

  it('says on a held stock that Claude was not told so', () => {
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
    expect(say()).toBe('AVOID Results due next week');
  });

  it('says "no answer", with the reason under the pointer, when Claude gave none', () => {
    views.knows({views: {}, failed: {ABCD: 'timeout'}});
    fixture.detectChanges();
    expect(say()).toBe('no answer');
    expect(tip()).toBe('Claude took too long and was stopped. Ask again.');
  });

  it('is not dressed as the tested mark: a plain word, no colour of its own for buy or avoid', () => {
    views.knows({views: {ABCD: {'2026-11-14': keptView('BUY SOME')}}});
    fixture.detectChanges();
    const word = el().querySelector<HTMLElement>('.word')!;
    expect(getComputedStyle(word).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(word).color).toBe(getComputedStyle(el().querySelector<HTMLElement>('.view')!).color);
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
    expect((el.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe('WAIT');
    expect(el.querySelector('.view')!.classList.contains('stale')).toBeTrue();
    expect(fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip).message).toContain('Asked Nov 10.');
  });
});
