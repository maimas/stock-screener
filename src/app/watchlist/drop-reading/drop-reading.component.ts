import {Component, Input, OnChanges, OnDestroy} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {MatButtonModule} from "@angular/material/button";
import {MatTooltipModule} from "@angular/material/tooltip";
import {concat, filter, of, Subscription, switchMap, tap} from "rxjs";
import {BiggestDrop, isoDay} from "../drop-news";
import {
  failureText, NOT_TESTED_NOTE, READ_AGAIN, READ_BUTTON, READ_TIP, readByLine, Reading, READING_NOW, ReadingSource, readingSentences, ReadingState, shownFor,
  siteOf, sourceTitle
} from "../reading";
import {ClaudeViewService} from "../claude-view.service";
import {ReadingService} from "../reading.service";

/**
 * "Read it for me", under "Why it dropped": has the Claude Code on this computer search the news about a stock's
 * biggest one-day fall, and shows what it found: what happened, what kind of news it was, the pages it rests on,
 * and that it is not tested. Context only: it changes neither the mark nor the plan.
 *
 * What the page lists itself (the headlines of that week) is handed in between the tags and shown until there is
 * a reading, so the same news is not on the page twice. Without Claude Code, or for a slide with no single big
 * day, this adds nothing and the page is as it was.
 */
@Component({
  selector: "app-drop-reading",
  standalone: true,
  imports: [NgIf, NgForOf, MatButtonModule, MatTooltipModule],
  templateUrl: "./drop-reading.component.html",
  styleUrls: ["./drop-reading.component.scss"]
})
export class DropReadingComponent implements OnChanges, OnDestroy {
  @Input() symbol = '';
  @Input() name = '';
  /** The fall to read about; missing for a gradual slide. */
  @Input() drop?: BiggestDrop;

  readonly readLabel = READ_BUTTON;
  readonly readTip = READ_TIP;
  readonly againLabel = READ_AGAIN;
  readonly readingNow = READING_NOW;
  readonly note = NOT_TESTED_NOTE;

  available = false;
  busy = false;
  failure = '';
  reading?: Reading;
  sentences = '';
  byLine = '';

  private work?: Subscription;
  /** The AI's view of this stock, as it was last known: a new one may have brought a reading of the fall. */
  private viewAsked?: string;
  private readonly watching: Subscription;

  constructor(private readings: ReadingService, private views: ClaudeViewService) {
    // The AI's view of a stock also says why it fell, and the server keeps that as the stock's reading: when a view
    // of this stock arrives while its details are open, what is kept is asked for once more.
    this.watching = this.views.state$.subscribe(state => {
      const asked = state.views[this.symbol]?.asked;
      if (asked !== this.viewAsked) {
        const first = this.viewAsked === undefined && asked === undefined;
        this.viewAsked = asked;
        if (!first && asked && this.available && !this.busy && this.drop) {
          this.readings.state(this.symbol).subscribe(kept => this.show(kept));
        }
      }
    });
  }

  /**
   * The AI's view of this stock can be asked for (its button stands a few lines below, for every stock of the
   * reader's lists): that one question reads the fall too, so this part offers no reading of its own then. The owner
   * asked for the two to be one.
   */
  get viaView(): boolean {
    return this.views.listed().some(it => it.quote?.symbol === this.symbol);
  }

  ngOnChanges(): void {
    this.viewAsked = this.views.state$.value.views[this.symbol]?.asked;
    this.work?.unsubscribe();
    this.available = false;
    this.show({state: 'none'});
    if (!this.symbol || !this.drop) {
      return;
    }
    const symbol = this.symbol;
    this.work = this.readings.available().pipe(
      tap(available => this.available = available),
      filter(available => available),
      switchMap(() => this.readings.state(symbol)),
      // A run that was started before the details were opened (or before the page was reloaded) is picked up.
      switchMap(state => state.state === 'reading' ? concat(of(state), this.readings.follow(symbol)) : of(state)),
    ).subscribe(state => this.show(state));
  }

  ngOnDestroy(): void {
    this.work?.unsubscribe();
    this.watching.unsubscribe();
  }

  get canAsk(): boolean {
    return this.available && !this.busy && !!this.drop;
  }

  read(): void {
    if (!this.canAsk || !this.drop) {
      return;
    }
    this.work?.unsubscribe();
    this.show({state: 'reading'});
    this.work = this.readings.read({symbol: this.symbol, name: this.name, day: this.day, percent: Math.abs(this.drop.changePercent)})
      .subscribe(state => this.show(state));
  }

  title(source: ReadingSource): string {
    return sourceTitle(source.title);
  }

  site(source: ReadingSource): string {
    return siteOf(source.url);
  }

  /** Daily prices are stamped at midnight in New York, kept as UTC: the day is read in UTC, as the page shows it. */
  private get day(): string {
    return this.drop ? isoDay(this.drop.date) : '';
  }

  private show(state: ReadingState): void {
    this.busy = state.state === 'reading';
    this.failure = state.state === 'failed' ? failureText(state.reason) : '';
    const reading = shownFor(state, this.day);
    // While a run is going on, and after one that failed, what was on show stays on show.
    if (reading || state.state === 'none' || state.state === 'done') {
      this.reading = reading;
      this.sentences = reading ? readingSentences(reading) : '';
      this.byLine = reading ? readByLine(reading) : '';
    }
  }
}
