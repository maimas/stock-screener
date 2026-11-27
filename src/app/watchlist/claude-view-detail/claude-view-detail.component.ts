import {Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {MatButtonModule} from "@angular/material/button";
import {MatTooltipModule} from "@angular/material/tooltip";
import {finalize, forkJoin, Subscription} from "rxjs";
import {Stock} from "../../api/microsoft-money.service";
import {
  ASK_BUSY, ASK_ONE, ASK_ONE_AGAIN, ASK_ONE_TIP, askedLine, ASKING_ONE, compareFailureText, COMPARING, DETAIL_TITLE, localDay, NOT_IN_A_LIST,
  PickFor, pickOf, pickReason, pickRow, View, viewFailureText, ViewSource, ViewsState, wordSaid,
} from "../claude-view";
import {groupsFor, requestFor} from "../claude-groups";
import {ClaudeViewService, isRefusal, ViewRefusal} from "../claude-view.service";
import {biggestDropSinceHigh, isoDay} from "../drop-news";
import {siteOf, sourceTitle} from "../reading";
import {MoreRestDirective} from "../more/more-rest.directive";
import {ReadingService} from "../reading.service";
import {TipOnFocusDirective} from "../tip-on-focus.directive";

const REFUSED: Record<ViewRefusal['refused'], string> = {
  'busy': ASK_BUSY,
  'not-installed': viewFailureText('not-installed'),
  'failed': 'The AI could not be asked. Try again.',
};

/**
 * The AI's view of a stock, in its details. The owner of the page asked for it: "add the claude response details in
 * the expanded section where it would do the same - take stock infor and compare it by the same strategy but for one
 * from the expando".
 *
 * What is kept for the stock, in full: the AI's word, its sentence, when it was asked and the pages
 * it rests on (a row of the table has no room for links), and which stock of its group the AI would take first. One
 * button asks about this stock alone and then has it compared with the stocks that move together with it, exactly
 * as a list's button does for a list (the same request, of one stock).
 *
 * Its own opinion, not tested, and said so beside the title; nothing here changes the mark or the plan. The button
 * is not offered for a stock that is in none of the reader's lists: such a stock is on the page only because it is
 * held, and nothing about what is held is sent. Without Claude Code, and with nothing kept, this adds nothing.
 */
@Component({
  selector: "app-claude-view-detail",
  standalone: true,
  imports: [NgIf, NgForOf, MatButtonModule, MatTooltipModule, TipOnFocusDirective, MoreRestDirective],
  template: `
    <section *ngIf="shown">
      <h4>{{ title }}<span class="note"> · not tested</span></h4>
      <ng-container *ngIf="view as said">
        <!-- In sight, a named row each, as the details' other facts: the verdict, why, and which stock of its group
             the AI would take first with its reason. The owner, 2026-11-26: "I want the AI details to be added in to
             the stock details after the AI verdict", then "make it cleaner", then "verdict and details need to be
             separate but clear at the same time along with the preference between few as comparison". The short
             reason is not said again (it is in the row these details open under), nor "not tested" (the title says
             it). The pages open with the details' one control ("Read these details in sentences"). -->
        <dl class="fact-rows ai-rows">
          <div class="verdict"><dt>Verdict</dt><dd><span class="word">{{ word }}</span></dd></div>
          <div class="why"><dt>Why</dt><dd>{{ said.why }}</dd></div>
          <div class="pick" *ngIf="pick as chosen">
            <dt>{{ pickRowOf(chosen).label }}</dt>
            <dd><span class="first"><span aria-hidden="true">★ </span>{{ pickRowOf(chosen).first }}</span>&ngsp;
              <span class="pick-why">{{ reasonOf(chosen) }}</span></dd>
          </div>
        </dl>
        <ul *ngIf="said.sources.length" appMoreRest="details.words">
          <li *ngFor="let source of said.sources; trackBy: trackByUrl">
            <a [href]="source.url" target="_blank" rel="noopener noreferrer">{{ titleOf(source) }}</a>
            <span class="source"> {{ siteOf(source) }}</span>
          </li>
        </ul>
        <p class="by">
          <span class="line">{{ by }}</span>&ngsp;
          <button type="button" class="again" *ngIf="canAsk" [disabled]="sending" appTipOnFocus [matTooltip]="tip"
                  matTooltipClass="multiline-tooltip" (click)="ask()">{{ againLabel }}</button>
        </p>
      </ng-container>
      <p class="busy" *ngIf="busy" role="status" aria-busy="true">{{ busy }}</p>
      <p class="failed" *ngIf="failure" role="alert">{{ failure }}</p>
      <button mat-stroked-button type="button" class="ask" *ngIf="canAsk && !view" [disabled]="sending" appTipOnFocus [matTooltip]="tip"
              matTooltipClass="multiline-tooltip" (click)="ask()">{{ askLabel }}</button>
      <p class="none" *ngIf="notListed">{{ notListed }}</p>
    </section>`,
  styles: [`
    /* A section of a stock's details, set like the others there (their rules are scoped to the details' own
       component, so the few that make a section are said again here). */
    :host { display: block; }
    section { break-inside: avoid; padding-top: 16px; }
    h4 { margin: 0 0 6px; font-size: var(--text-body); font-weight: 600; line-height: 1.4; color: var(--ink); }
    /* That this is no part of the mark: beside the title, quieter than it. */
    h4 .note { font-weight: 400; color: var(--ink-2); }
    p { margin: 6px 0 0; max-width: 70ch; }
    /* Its rows are the page's "dl.fact-rows" (styles.scss), a little apart: each says a different thing. */
    .ai-rows { row-gap: 6px; }
    /* The word in small letters and without colour: capitals and colour are the tested mark's. */
    .word { font-weight: 600; }
    /* The comparison: the stock first in the full ink, its reason under it, quieter. */
    .first { font-weight: 600; }
    .pick-why { display: block; color: var(--ink-2); }
    /* A link as the details set theirs (their rule is scoped to their own component, so it is said again here). */
    a { color: var(--link); text-decoration: underline; text-underline-offset: 2px; text-decoration-color: rgba(21, 101, 192, 0.35); }
    a:hover { text-decoration-color: currentColor; }
    ul { margin: 6px 0 0; padding-left: 18px; max-width: 70ch; }
    .source, .by, .none, .busy { font-size: var(--text-meta); color: var(--ink-3); }
    .failed { color: var(--warn); }
    .again {
      min-height: 28px; margin: 0; padding: 0; border: 0; background: none; font: inherit; color: var(--link);
      text-decoration: underline; text-underline-offset: 2px; cursor: pointer;
    }
    .again:disabled { color: var(--ink-3); text-decoration: none; cursor: default; }
    .ask { margin-top: 8px; }
  `]
})
export class ClaudeViewDetailComponent implements OnChanges, OnInit, OnDestroy {
  @Input() stock?: Stock;
  /** YYYY-MM-DD */
  @Input() today = '';

  readonly title = DETAIL_TITLE;
  readonly askLabel = ASK_ONE;
  readonly againLabel = ASK_ONE_AGAIN;
  readonly tip = ASK_ONE_TIP;
  available = false;
  /** The stock is on its way to the server: a second press before the answer would send it again. */
  sending = false;
  /** Why the stock was not taken, said until it is pressed again. */
  private note = '';

  private state: ViewsState = {views: {}, history: {}, failed: {}};
  private watching = new Subscription();
  private work?: Subscription;

  constructor(private views: ClaudeViewService, private readings: ReadingService) {
  }

  /** The details are another stock's: what was said about the one before (a refusal, a request on its way) is not this one's. */
  ngOnChanges(changes: SimpleChanges): void {
    const stock = changes['stock'];
    if (stock && stock.previousValue?.quote?.symbol !== stock.currentValue?.quote?.symbol) {
      this.note = '';
      this.sending = false;
    }
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

  private get symbol(): string {
    return this.stock?.quote?.symbol ?? '';
  }

  get view(): View | undefined {
    return this.state.views[this.symbol];
  }

  get word(): string {
    return this.view ? wordSaid(this.view.view) : '';
  }

  get by(): string {
    return this.view ? askedLine(this.view) : '';
  }

  /** The day as the page names it; the day of this computer when the part was not told one. */
  private get day(): string {
    return this.today || localDay(new Date());
  }

  /** The letter this stock's group has on the page today; '' when it is in none. */
  private get letter(): string {
    return this.views.letterOf(this.symbol);
  }

  /** Which stock of its group the AI would take first, when this stock was compared in the past week. */
  get pick(): PickFor | undefined {
    return pickOf(this.symbol, this.state.picks, this.day, this.state.views, this.letter);
  }

  /** "Group A" and "EFGH first, ahead of this one and IJKL". */
  pickRowOf(pick: PickFor): { label: string, first: string } {
    return pickRow(pick, this.symbol);
  }

  /** Why, and when it was compared. */
  reasonOf(pick: PickFor): string {
    return pickReason(pick);
  }

  get shown(): boolean {
    return !!this.symbol && (this.available || !!this.view);
  }

  /** The stock is in one of the reader's own lists: only such a stock is ever sent. */
  private get listed(): boolean {
    return this.views.listed().some(it => it.quote?.symbol === this.symbol);
  }

  get notListed(): string {
    return this.available && !this.listed ? NOT_IN_A_LIST : '';
  }

  /** This stock is being asked about (alone or with its list) or its group is being compared after it. */
  private get inQueue(): boolean {
    return !!this.state.queue?.symbols.includes(this.symbol);
  }

  /** What the AI is doing about this stock right now, in words; nothing when it is doing nothing about it. */
  get busy(): string {
    const queue = this.state.queue;
    if (!queue || !this.inQueue) {
      return '';
    }
    const through = queue.done.includes(this.symbol) || this.symbol in queue.failed;
    if (!through) {
      return ASKING_ONE;
    }
    // Only under a stock of a group that is still to be compared: "Comparing group A…" under a stock of no group says nothing true.
    const letter = this.letter;
    return queue.done.length + Object.keys(queue.failed).length >= queue.symbols.length && !!letter && queue.comparing?.includes(letter)
      ? COMPARING(letter) : '';
  }

  get canAsk(): boolean {
    return this.available && this.listed && !this.inQueue;
  }

  /**
   * Why there is no answer: the stock was not taken just now, it got none the last time it was asked about, or its
   * group could not be compared.
   */
  get failure(): string {
    if (this.note) {
      return this.note;
    }
    if (this.inQueue) {
      return '';
    }
    const reason = this.state.failed[this.symbol], letter = this.letter, group = letter ? this.state.failedGroups?.[letter] : undefined;
    return reason ? viewFailureText(reason) : group ? compareFailureText(letter, group) : '';
  }

  titleOf(source: ViewSource): string {
    return sourceTitle(source.title);
  }

  siteOf(source: ViewSource): string {
    return siteOf(source.url);
  }

  trackByUrl(_: number, source: ViewSource): string {
    return source.url;
  }

  ask(): void {
    const stock = this.stock;
    if (this.sending || !stock || !this.canAsk) {
      return;
    }
    this.note = '';
    if (this.state.queue) {
      this.note = ASK_BUSY;
      return;
    }
    const now = new Date(), drop = biggestDropSinceHigh(stock);
    this.sending = true;
    this.work?.unsubscribe();
    // What a reading of the stock's biggest fall found is looked up first, as a list's button does.
    this.work = forkJoin([this.readings.state(this.symbol), this.views.context()]).subscribe(([kept, context]) => {
      const reading = kept.state === 'done' ? kept.reading : undefined;
      const about = reading && drop && reading.day === isoDay(drop.date) ? reading.about : undefined;
      const list = [requestFor(stock, now, about, context)];
      this.work = this.views.askAbout(list, groupsFor(list, this.views.tied(), this.views.listed(), now, context))
        .pipe(finalize(() => this.sending = false))
        .subscribe(step => {
          this.sending = false;
          if (isRefusal(step)) {
            this.note = REFUSED[step.refused];
          }
        });
    });
  }
}
