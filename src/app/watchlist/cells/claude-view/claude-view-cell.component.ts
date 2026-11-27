import {Component, Input, OnDestroy, OnInit} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";
import {Subscription} from "rxjs";
import {cellOf, pickOf, ViewCell, ViewsState} from "../../claude-view";
import {ClaudeViewService} from "../../claude-view.service";
import {TipOnFocusDirective} from "../../tip-on-focus.directive";

/**
 * Claude's view of a stock, in its row: one of three words (BUY SOME, WAIT, AVOID) and a few words of why; the
 * sentence shows where the pointer rests or the Tab key stops.
 *
 * It is Claude's opinion, not a tested mark, and it is not dressed as one, nor louder than one: a quiet word in small
 * letters ("Buy some"), the size of the table's other secondary text, no filled shape, no green or red. The short
 * view of the table ("Key columns") shows the word alone, so its rows stay one line tall.
 *
 * The stock Claude would take first among those of its group that it compared (the stocks that move together) wears
 * a plain star, and under "All columns" the words "first of A"; every compared stock says under the pointer which
 * one that is and why.
 */
@Component({
  selector: "app-claude-view-cell",
  standalone: true,
  imports: [NgIf, MatTooltipModule, TipOnFocusDirective],
  template: `
    <span class="view" *ngIf="cell.word; else none" [class.stale]="cell.stale" [class.failed]="cell.word === 'no answer'"
          tabindex="0" appTipOnFocus [matTooltip]="cell.tip" matTooltipClass="multiline-tooltip">
      <span class="word">{{ word }}</span>
      <!-- The space before each is for what reads the row aloud or copies it: the gap on the screen is the layout's. -->
      <!-- Claude's pick among the stocks of its group that it compared. Read aloud as its words, not as "black star". -->
      <span class="first" *ngIf="cell.first" role="img" [attr.aria-label]="cell.first"> ★<ng-container *ngIf="!compact"> {{ cell.first }}</ng-container></span>
      <span class="short" *ngIf="!compact && cell.short"> {{ cell.short }}</span>
      <span class="from" *ngIf="!compact && cell.from"> {{ cell.from }}</span>
    </span>
    <ng-template #none><span class="none">{{ waiting ? 'asking…' : '—' }}</span></ng-template>`,
  styles: [`
    /* The word, then its few words of why beside it: one line a cell. */
    .view { display: inline-flex; align-items: baseline; gap: 2px; white-space: pre; border-radius: 3px; }
    .view:focus-visible { outline: 2px solid var(--accent, currentColor); outline-offset: 2px; }
    /* Quiet, in small letters: capitals, weight and size are the tested mark's, and this is not one. */
    .view { color: var(--ink-2); }
    .word { font-size: var(--text-meta); font-weight: 500; }
    .first { font-size: var(--text-meta); }
    .short, .from { font-size: var(--text-meta); color: var(--ink-3); }
    .view.stale .word, .view.failed .word { font-weight: 400; color: var(--ink-3); }
    .none { color: var(--ink-3); }
  `]
})
export class ClaudeViewCellComponent implements OnInit, OnDestroy {
  @Input() symbol = '';
  /** The stock is in one of the reader's portfolios, which Claude was not told. */
  @Input() held = false;
  /** YYYY-MM-DD */
  @Input() today = '';
  /** The short view of the table: the word alone. */
  @Input() compact = false;

  private state: ViewsState = {views: {}, history: {}, failed: {}};
  private watching?: Subscription;

  constructor(private views: ClaudeViewService) {
  }

  ngOnInit(): void {
    this.views.start();
    this.watching = this.views.state$.subscribe(state => this.state = state);
  }

  ngOnDestroy(): void {
    this.watching?.unsubscribe();
  }

  /** Claude's word as the row says it: "Buy some", "Wait", "Avoid", "No answer". */
  get word(): string {
    const said = this.cell.word;
    return said.charAt(0).toUpperCase() + said.slice(1).toLowerCase();
  }

  get cell(): ViewCell {
    return cellOf(this.state.views[this.symbol], this.today, this.held, this.state.failed[this.symbol],
      pickOf(this.symbol, this.state.picks, this.today));
  }

  /** The stock is in the list being asked about and its answer is not there yet. */
  get waiting(): boolean {
    const queue = this.state.queue;
    return !!queue && queue.symbols.includes(this.symbol) && !queue.done.includes(this.symbol) && !(this.symbol in queue.failed);
  }
}
