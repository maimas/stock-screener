import {Component, Input, OnDestroy, OnInit} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";
import {Subscription} from "rxjs";
import {cellOf, ViewCell, ViewsState} from "../../claude-view";
import {ClaudeViewService} from "../../claude-view.service";
import {TipOnFocusDirective} from "../../tip-on-focus.directive";

/**
 * Claude's view of a stock, in its row: one of three words (BUY SOME, WAIT, AVOID) and a few words of why; the
 * sentence shows where the pointer rests or the Tab key stops.
 *
 * It is Claude's opinion, not a tested mark, and it is not dressed as one: a plain word in the row's own colour, no
 * filled shape, no green or red. The short view of the table ("Key columns") shows the word alone, so its rows stay
 * one line tall.
 */
@Component({
  selector: "app-claude-view-cell",
  standalone: true,
  imports: [NgIf, MatTooltipModule, TipOnFocusDirective],
  template: `
    <span class="view" *ngIf="cell.word; else none" [class.stale]="cell.stale" [class.failed]="cell.word === 'no answer'"
          tabindex="0" appTipOnFocus [matTooltip]="cell.tip" matTooltipClass="multiline-tooltip">
      <span class="word">{{ cell.word }}</span>
      <!-- The space before each is for what reads the row aloud or copies it: the gap on the screen is the layout's. -->
      <span class="short" *ngIf="!compact && cell.short"> {{ cell.short }}</span>
      <span class="from" *ngIf="!compact && cell.from"> {{ cell.from }}</span>
    </span>
    <ng-template #none><span class="none">{{ waiting ? 'asking…' : '—' }}</span></ng-template>`,
  styles: [`
    /* The word, then its few words of why beside it: one line a cell. */
    .view { display: inline-flex; align-items: baseline; gap: 2px; white-space: pre; border-radius: 3px; }
    .view:focus-visible { outline: 2px solid var(--accent, currentColor); outline-offset: 2px; }
    .word { font-weight: 600; }
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

  get cell(): ViewCell {
    return cellOf(this.state.views[this.symbol], this.today, this.held, this.state.failed[this.symbol]);
  }

  /** The stock is in the list being asked about and its answer is not there yet. */
  get waiting(): boolean {
    const queue = this.state.queue;
    return !!queue && queue.symbols.includes(this.symbol) && !queue.done.includes(this.symbol) && !(this.symbol in queue.failed);
  }
}
