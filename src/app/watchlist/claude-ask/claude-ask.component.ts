import {Component, Input, OnDestroy, OnInit} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";
import {finalize, forkJoin, Observable, of, Subscription} from "rxjs";
import {Stock} from "../../api/microsoft-money.service";
import {
  ASK_BUSY, ASK_BUTTON, ASK_TIP, ASKING, COMPARING, factsFor, GroupRequest, shortDay, viewFailureText, ViewRequest, ViewsState,
} from "../claude-view";
import {ClaudeViewService, isRefusal, ViewRefusal} from "../claude-view.service";
import {biggestDropSinceHigh, isoDay} from "../drop-news";
import {ReadingAbout, ReadingState} from "../reading";
import {ReadingService} from "../reading.service";
import {NO_GROUPS, TiedGroups} from "../tied-groups";
import {TipOnFocusDirective} from "../tip-on-focus.directive";

/** As many stocks as the server takes in one list (tools/claude/claude-view.js). */
export const MOST_AT_ONCE = 10;
/** As many groups, and stocks a group, as the server takes to compare (tools/claude/claude-compare.js). */
export const MOST_GROUPS = 8;
export const MOST_MEMBERS = 10;

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
 * With the list go the groups its stocks are in (the letters of the "Group" column: stocks that moved closely
 * together), each with its stocks that are in any of the reader's own lists. After the stocks, Claude compares each
 * such group and names the one it would take first; the button then says "Comparing group A…".
 *
 * Without Claude Code this adds nothing and the page is as it was.
 */
@Component({
  selector: "app-claude-ask",
  standalone: true,
  imports: [NgIf, MatTooltipModule, TipOnFocusDirective],
  template: `
    <ng-container *ngIf="available && stocks.length">
      <button type="button" class="link-button ask-claude" [disabled]="mine || sending" appTipOnFocus [matTooltip]="tip"
              matTooltipClass="multiline-tooltip" (click)="ask()">{{ label }}</button>
      <span class="asked" *ngIf="asked">{{ asked }}</span>
      <span class="ask-note" role="status">{{ note }}</span>
    </ng-container>`,
  styles: [`
    :host { display: inline-flex; align-items: baseline; gap: 8px; white-space: nowrap; }
    /* A link like "Edit list" beside it (the page styles its link-buttons in each part's own stylesheet). */
    .link-button.ask-claude {
      min-height: 28px; margin: 0; padding: 0; border: 0; background: none; font: inherit; font-size: var(--text-data);
      color: var(--link); text-decoration: underline; text-underline-offset: 2px; cursor: pointer;
    }
    .link-button.ask-claude:disabled { color: var(--ink-3); text-decoration: none; cursor: default; }
    .asked, .ask-note { font-size: var(--text-meta); color: var(--ink-3); }
    .ask-note:empty { display: none; }
  `]
})
export class ClaudeAskComponent implements OnInit, OnDestroy {
  /** The stocks of the list, as the table shows them. */
  @Input() stocks: Stock[] = [];
  /** Which stocks of the page move together (the lettered groups of the "Group" column). */
  @Input() tied: TiedGroups = NO_GROUPS;

  readonly tip = ASK_TIP;
  available = false;
  /** Why the list was not taken, said beside the button until it is pressed again. */
  note = '';
  /** The list is on its way to the server: a second press before the answer would send it again. */
  sending = false;

  private state: ViewsState = {views: {}, history: {}, failed: {}};
  private watching = new Subscription();
  private work?: Subscription;

  constructor(private views: ClaudeViewService, private readings: ReadingService) {
  }

  ngOnInit(): void {
    this.views.register(this, () => this.stocks);
    this.views.start();
    this.watching.add(this.views.available().subscribe(available => this.available = available));
    this.watching.add(this.views.state$.subscribe(state => this.state = state));
  }

  ngOnDestroy(): void {
    this.views.unregister(this);
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
      const through = queue.done.length + Object.keys(queue.failed).length;
      return through >= queue.symbols.length && queue.comparing?.length ? COMPARING(queue.comparing[0]) : ASKING(through, queue.symbols.length);
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

  /**
   * The groups to compare after the list: each group a stock of the list is in, with its stocks that are in any of
   * the reader's own lists (the list's own first). A group with one such stock has nothing to be compared with.
   */
  private groupsOf(stocks: Stock[], list: ViewRequest[], now: Date): GroupRequest[] {
    const asked = new Map(list.map(it => [it.symbol, it]));
    const listed = new Map(this.views.listed().map(stock => [stock.quote!.symbol!, stock]));
    const mine = new Set(stocks.map(it => it.quote!.symbol!));
    return this.tied.groups.filter(group => group.symbols.some(symbol => mine.has(symbol)))
      .map((group): GroupRequest => ({
        letter: group.letter,
        members: [...group.symbols.filter(symbol => mine.has(symbol)), ...group.symbols.filter(symbol => !mine.has(symbol) && listed.has(symbol))]
          .slice(0, MOST_MEMBERS)
          .map(symbol => asked.get(symbol) ?? requestFor(listed.get(symbol)!, now)),
      }))
      .filter(group => group.members.length >= 2)
      .slice(0, MOST_GROUPS);
  }

  ask(): void {
    if (this.sending) {
      return;
    }
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
    this.sending = true;
    this.work?.unsubscribe();
    this.work = forkJoin(kept).subscribe(states => {
      const list: ViewRequest[] = stocks.map((stock, at) => requestFor(stock, now, aboutOf(states[at], stock)));
      // The service follows the list from here; this button only says why a list was not taken.
      this.work = this.views.askAbout(list, this.groupsOf(stocks, list, now)).pipe(finalize(() => this.sending = false)).subscribe(step => {
        this.sending = false;
        if (isRefusal(step)) {
          this.note = REFUSED[step.refused];
        }
      });
    });
  }
}

/** A stock as it is sent: its symbol, its name and its figures. */
function requestFor(stock: Stock, now: Date, about?: ReadingAbout): ViewRequest {
  return {symbol: stock.quote!.symbol!, name: stock.quote?.displayName || stock.quote!.symbol!, facts: factsFor(stock, now, about)};
}

/** What kind of news the kept reading found, when it is about the very day of the stock's biggest fall. */
function aboutOf(state: ReadingState, stock: Stock): ReadingAbout | undefined {
  const reading = state.state === 'done' ? state.reading : undefined, drop = biggestDropSinceHigh(stock);
  return reading && drop && reading.day === isoDay(drop.date) ? reading.about : undefined;
}
