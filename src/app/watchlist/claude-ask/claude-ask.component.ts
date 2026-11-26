import {Component, Input, OnDestroy, OnInit} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";
import {forkJoin, Observable, of, Subscription} from "rxjs";
import {Stock} from "../../api/microsoft-money.service";
import {ASK_BUSY, ASK_BUTTON, ASK_TIP, ASKING, factsFor, shortDay, viewFailureText, ViewRequest, ViewsState} from "../claude-view";
import {ClaudeViewService, isRefusal, ViewRefusal} from "../claude-view.service";
import {biggestDropSinceHigh, isoDay} from "../drop-news";
import {ReadingAbout, ReadingState} from "../reading";
import {ReadingService} from "../reading.service";
import {TipOnFocusDirective} from "../tip-on-focus.directive";

/** As many stocks as the server takes in one list (tools/claude/claude-view.js). */
export const MOST_AT_ONCE = 10;

const REFUSED: Record<ViewRefusal['refused'], string> = {
  'busy': ASK_BUSY,
  'not-installed': viewFailureText('not-installed'),
  'failed': 'Claude could not be asked. Try again.',
};

/**
 * The one button above a list of the Watchlist: "Ask Claude about these 5". It has the Claude Code on this computer
 * give its view of every stock of the list (the column "Claude · not tested"), one stock after the other, and says
 * how far it is while the rows fill in.
 *
 * What is sent about a stock is its figures as its details show them, and what kind of news a reading of its biggest
 * fall found if one is kept. Nothing about what is owned. A list of more than ten stocks is asked about ten at a
 * time: those never asked about first, then those asked longest ago, so a second press does the rest.
 *
 * Without Claude Code this adds nothing and the page is as it was.
 */
@Component({
  selector: "app-claude-ask",
  standalone: true,
  imports: [NgIf, MatTooltipModule, TipOnFocusDirective],
  template: `
    <ng-container *ngIf="available && stocks.length">
      <button type="button" class="link-button ask-claude" [disabled]="mine" appTipOnFocus [matTooltip]="tip"
              matTooltipClass="multiline-tooltip" (click)="ask()">{{ label }}</button>
      <span class="asked" *ngIf="asked">{{ asked }}</span>
      <span class="ask-note" role="status">{{ note }}</span>
    </ng-container>`,
  styles: [`
    :host { display: inline-flex; align-items: baseline; gap: 8px; white-space: nowrap; }
    .link-button.ask-claude { min-height: 28px; margin-left: 0; font-size: var(--text-data); }
    .asked, .ask-note { font-size: var(--text-meta); color: var(--ink-3); }
    .ask-note:empty { display: none; }
  `]
})
export class ClaudeAskComponent implements OnInit, OnDestroy {
  /** The stocks of the list, as the table shows them. */
  @Input() stocks: Stock[] = [];

  readonly tip = ASK_TIP;
  available = false;
  /** Why the list was not taken, said beside the button until it is pressed again. */
  note = '';

  private state: ViewsState = {views: {}, history: {}, failed: {}};
  private watching = new Subscription();
  private work?: Subscription;

  constructor(private views: ClaudeViewService, private readings: ReadingService) {
  }

  ngOnInit(): void {
    this.views.start();
    this.watching.add(this.views.available().subscribe(available => this.available = available));
    this.watching.add(this.views.state$.subscribe(state => this.state = state));
  }

  ngOnDestroy(): void {
    this.watching.unsubscribe();
    this.work?.unsubscribe();
  }

  private get symbols(): string[] {
    return this.stocks.map(it => it.quote?.symbol ?? '').filter(Boolean);
  }

  /** The list being asked about is this one. */
  get mine(): boolean {
    const queue = this.state.queue, symbols = this.symbols;
    return !!queue && queue.symbols.length > 0 && queue.symbols.every(it => symbols.includes(it));
  }

  get label(): string {
    const queue = this.state.queue;
    if (queue && this.mine) {
      return ASKING(queue.done.length + Object.keys(queue.failed).length, queue.symbols.length);
    }
    const count = this.symbols.length;
    return count > MOST_AT_ONCE ? `Ask Claude about ${MOST_AT_ONCE} of these ${count}` : ASK_BUTTON(count);
  }

  /** "asked Nov 20": the newest view among the stocks of this list. */
  get asked(): string {
    const days = this.symbols.map(it => this.state.views[it]?.day).filter((day): day is string => !!day).sort();
    return days.length ? `asked ${shortDay(days[days.length - 1])}` : '';
  }

  /** The stocks to ask about: all of a list of up to ten; of a longer one, those never asked about, then those asked longest ago. */
  private chosen(): Stock[] {
    const known = this.stocks.filter(it => !!it.quote?.symbol);
    if (known.length <= MOST_AT_ONCE) {
      return known;
    }
    const dayOf = (it: Stock): string => this.state.views[it.quote!.symbol!]?.day ?? '';
    return known.map((stock, at) => ({stock, at})).sort((a, b) => dayOf(a.stock).localeCompare(dayOf(b.stock)) || a.at - b.at)
      .slice(0, MOST_AT_ONCE).map(it => it.stock);
  }

  ask(): void {
    this.note = '';
    if (this.state.queue) {
      this.note = this.mine ? '' : ASK_BUSY;
      return;
    }
    const stocks = this.chosen(), now = new Date();
    if (!stocks.length) {
      return;
    }
    // What a reading of the stock's biggest fall found is looked up first: only for a stock that had such a day.
    const kept: Observable<ReadingState>[] = stocks.map(it =>
      biggestDropSinceHigh(it) ? this.readings.state(it.quote!.symbol!) : of<ReadingState>({state: 'none'}));
    this.work?.unsubscribe();
    this.work = forkJoin(kept).subscribe(states => {
      const list: ViewRequest[] = stocks.map((stock, at) => ({
        symbol: stock.quote!.symbol!, name: stock.quote?.displayName || stock.quote!.symbol!,
        facts: factsFor(stock, now, aboutOf(states[at], stock)),
      }));
      this.work = this.views.askAbout(list).subscribe(step => {
        if (isRefusal(step)) {
          this.note = REFUSED[step.refused];
        }
      });
    });
  }
}

/** What kind of news the kept reading found, when it is about the very day of the stock's biggest fall. */
function aboutOf(state: ReadingState, stock: Stock): ReadingAbout | undefined {
  const reading = state.state === 'done' ? state.reading : undefined, drop = biggestDropSinceHigh(stock);
  return reading && drop && reading.day === isoDay(drop.date) ? reading.about : undefined;
}
