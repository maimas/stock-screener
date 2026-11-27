import {MoreComponent} from "../more/more.component";
import {MoreService} from "../more/more.service";
import {BusinessFactsComponent} from "../business-facts/business-facts.component";
import {ClaudeViewDetailComponent} from "../claude-view-detail/claude-view-detail.component";
import {resultsSoonLine} from "../results-soon";

// The sentence lives in a file without a component (results-soon.ts), so that code which is not part of the page
// can say it too; it is still found here by what imported it from this file before.
export {resultsSoonLine} from "../results-soon";
import {MoreRestDirective} from "../more/more-rest.directive";
import {Component, EventEmitter, HostListener, Input, OnChanges, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {Stock} from "../../api/microsoft-money.service";
import {DIP_PERCENT, revenueConsensusMillions, signalFor, SignalResult} from "../signal";
import {AFTER_BUYING_NOTES, DIP_BUY_TEST_NOTES, EVIDENCE, inTen, VOLATILITY_GROUPS_NOTE, volatilityNote} from "../evidence";
import {BIG_DROP_PERCENT, DropNews, Headline} from "../drop-news";
import {dipBuySince, SnapshotLog, valueBefore} from "../snapshot-log";
import {NoVerdict} from "../cells/signal/signal-cell.component";
import {DropReadingComponent} from "../drop-reading/drop-reading.component";

type ContextLine = { mark: 'plus' | 'minus' | 'neutral', text: string };

/**
 * One thing a mark rests on, as a row of the details: its name, its figure, what the mark needs of it (where that
 * is a number), and whether it is enough. `ok` is left out where there is nothing to judge.
 */
export type MarkFact = { label: string, value: string, needs?: string, ok?: boolean };

const NO_VERDICT_TEXT: Record<NoVerdict, string> = {
  'fund': "A fund has no profit of its own, so the mark, which rests on a company's growth, does not apply.",
  'too-new': 'This company is too young for the tested rule, which needs 8 reported quarters and a year of prices. ' +
    'It gets no mark rather than an untested one; the growth figures in the table are context only.',
  'no-data': "The history of the company's results is missing or incomplete at the data source, so there is no mark.",
};

/** An analyst figure is compared with its reading from at least this many days ago. */
const REVISION_DAYS = 20;

/**
 * Everything behind one row's verdict, in plain text: the inputs, what the tests found (limits included),
 * the validated risk notes, the untested context, and the headlines from the week of the biggest fall
 * (or, once it was asked to read them, what the Claude Code on this computer found in the news).
 * Opens under the row, so it can be read, copied and followed up, which a hover tooltip could not offer.
 */
@Component({
  selector: "app-signal-detail",
  // A click on the text of the details leaves the keyboard on them, not on the page: Esc then closes them, as it
  // does for a reader who came by the keyboard. Not a stop for the Tab key.
  host: {tabindex: '-1'},
  standalone: true,
  imports: [NgIf, NgForOf, DropReadingComponent, MoreComponent, MoreRestDirective, BusinessFactsComponent, ClaudeViewDetailComponent],
  templateUrl: "./signal-detail.component.html",
  styleUrls: ["./signal-detail.component.scss"]
})
export class SignalDetailComponent implements OnChanges {
  @Input() stock!: Stock;
  @Input() noVerdict: NoVerdict = 'no-data';
  @Input() news?: DropNews;
  @Input() log?: SnapshotLog;
  /** Today's key in the log (YYYY-MM-DD). */
  @Input() today = '';
  /**
   * The words of a way back ("Back to your plan"), when these details were opened from another view of the page;
   * empty when they were opened where they stand. The details show it first, as a link.
   */
  @Input() back = '';
  @Output() goBack = new EventEmitter<void>();
  /**
   * Asked for at the foot of the details: close them. The row's own button is at the top, which can be a screen
   * and a half above where the reading ends.
   */
  @Output() closeDetails = new EventEmitter<void>();

  /**
   * The Esc key while the keyboard is inside the details: the same as "Close these details" at their foot. A form
   * inside them that is open takes the key for itself first (its Cancel), so this is the second press then.
   */
  @HostListener("keydown.escape")
  onEscape(): void {
    this.closeDetails.emit();
  }

  /** What the one control at the head of the details opens, here and in the panels handed in: the sentences. */
  static readonly WORDS = 'details.words';

  constructor(private readonly more: MoreService) {
  }

  /** The sentences that say the figures in words are shown (asked for once, they stay open under every stock). */
  get wordsOpen(): boolean {
    return this.more.isOpen(SignalDetailComponent.WORDS);
  }

  toggleWords(): void {
    this.more.toggle(SignalDetailComponent.WORDS);
  }

  title = '';
  lead = '';
  /** What the mark rests on, a row a fact; then, for a DIP BUY, since when it has the mark. */
  facts: MarkFact[] = [];
  tests: readonly string[] = [];
  risks: string[] = [];
  /** The risk of this one stock as figures: how much its price swings, and how often such stocks fell further in the tests. */
  riskFacts: MarkFact[] = [];
  /** There is something to say under "Risk of this stock": a figure or a line. */
  hasRisk = false;
  /** The sentence that says those two figures in words: behind "more" while the figures are shown. */
  swings = '';
  /** The other lines about its risk (unlike most tested stocks; results due): each shows its first sentence. */
  otherRisks: string[] = [];
  afterBuying: readonly string[] = [];
  context: ContextLine[] = [];
  symbol = '';
  /** The company's name, for a search of the news about it. */
  name = '';
  /**
   * Which company this is, as the first line of its details: its name, its sector and its industry, as far as each
   * is known. Until now the name was only in the tooltip of the symbol.
   */
  company: string[] = [];
  /** Whether that line starts with the name (set stronger), or the name is not known and it starts with the sector. */
  named = false;
  /** What the chart shows: the biggest one-day fall since the high, or that there was none. */
  fall = '';
  /**
   * The stock's page at the data source (its chart, the company's figures). A stock's name on the page opens these
   * details; this is the one way out of the app, and it says so.
   */
  moreUrl = '';
  /** Leads into the headlines of that week; they are shown until the news was read. */
  headlinesIntro = '';
  headlines: Headline[] = [];

  ngOnChanges(): void {
    const stock = this.stock;
    const signal = signalFor(stock);
    const symbol = stock.quote?.symbol ?? '';
    this.symbol = symbol;
    this.name = stock.quote?.displayName || stock.quote?.shortName || symbol;
    this.named = !!this.name && this.name !== symbol;
    this.company = [this.named ? this.name : '', stock.equity?.company?.sector, stock.equity?.company?.industry]
      .filter((part): part is string => !!part);
    this.moreUrl = stock.instrumentId ? `https://www.msn.com/en-us/money/stockdetails/fi-${stock.instrumentId}` : '';
    this.title = signal ? `Why ${signal.verdict}` : 'No mark';
    this.lead = signal ? signal.headline : NO_VERDICT_TEXT[this.noVerdict];

    const isDipBuy = signal?.verdict === 'DIP BUY';
    const since = isDipBuy ? this.sinceFact(symbol, stock.quote?.price) : undefined;
    this.facts = signal ? [...verdictFacts(signal), ...(since ? [since] : [])] : [];
    this.tests = isDipBuy ? DIP_BUY_TEST_NOTES : [];
    this.afterBuying = isDipBuy ? AFTER_BUYING_NOTES : [];
    // Every stock marked DIP BUY gets the two figures, also one that is neither calm nor volatile: a review found
    // "Risk of this stock" under one DIP BUY and not under the next.
    const swings = isDipBuy && signal?.volatility !== undefined;
    this.swings = !swings ? '' : signal!.volatilityTier ? volatilityNote(signal!.volatilityTier, signal!.volatility!) : VOLATILITY_GROUPS_NOTE;
    this.riskFacts = swings ? swingFacts(signal!.volatilityTier, signal!.volatility!)
      // Not marked DIP BUY: how much its price swings is a fact about it all the same (the list shows it in its row,
      // and a review found the details silent on it). How often such stocks fell further was tested for marked
      // stocks only, so that figure is left out here.
      : signal?.volatility !== undefined ? [{label: 'Swings', value: `${signal.volatility.toFixed(0)}% a year`, needs: 'tested for stocks marked DIP BUY only'}] : [];
    this.otherRisks = [
      signal?.rareInTests ?? '',
      signal?.earningsInDays !== undefined ? resultsSoonLine(signal.earningsInDays) : '',
    ].filter(it => !!it);
    this.risks = [this.swings, ...this.otherRisks].filter(it => !!it);
    this.hasRisk = this.risks.length > 0 || this.riskFacts.length > 0;

    this.context = [
      ...(signal?.factors ?? []).map(it => ({mark: it.points > 0 ? 'plus' : it.points < 0 ? 'minus' : 'neutral', text: it.reason} as ContextLine)),
      ...this.revisions(symbol),
      ...(signal?.notes ?? []).map(text => ({mark: 'neutral', text} as ContextLine)),
    ];

    this.headlines = this.news?.headlines ?? [];
    this.fall = dropFacts(this.news);
    this.headlinesIntro = headlinesLine(this.news);
  }

  day(date?: Date): string {
    return date ? date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '';
  }

  trackByText(_: number, text: string): string {
    return text;
  }

  trackByLabel(_: number, fact: MarkFact): string {
    return fact.label;
  }

  /**
   * Since when the daily log has this stock as a DIP BUY, and what its price and the market did since: one row
   * with the mark's two facts. It was two sentences ("First recorded as a DIP BUY today. From tomorrow this line
   * shows what has happened since.").
   */
  private sinceFact(symbol: string, price?: number): MarkFact | undefined {
    const since = this.log && dipBuySince(this.log, symbol, this.today);
    if (!since || !price) {
      return undefined;
    }
    if (since.day === this.today) {
      return {label: 'Marked', value: 'today, for the first time'};
    }
    const days = Math.round((Date.parse(this.today) - Date.parse(since.day)) / 86_400_000);
    const spyNow = this.log!.days[this.today]?.spy;
    const index = since.spy && spyNow ? `, the market ${signed((spyNow / since.spy - 1) * 100)}%` : '';
    return {
      label: 'Marked',
      value: `${logDay(since.day)}, ${days} day${days === 1 ? '' : 's'} ago at ${since.price.toFixed(2)}: ` +
        `${signed((price / since.price - 1) * 100)}% since${index}`,
    };
  }

  /** How the analysts' target and EPS estimate have moved since the log's reading from three weeks ago or more. */
  private revisions(symbol: string): ContextLine[] {
    const estimate = this.stock.equity?.analysis?.estimate;
    if (!this.log || !estimate) {
      return [];
    }
    const lines: ContextLine[] = [];
    const plain = (value: number) => value.toFixed(2);
    const compare = (field: 't' | 'f' | 'y', label: string, now: number | undefined, format = plain) => {
      const before = valueBefore(this.log!, symbol, field, this.today, REVISION_DAYS);
      if (!before || typeof now !== 'number' || !Number.isFinite(now) || before.value <= 0 || Math.abs(now / before.value - 1) < 0.005) {
        return;
      }
      const change = (now / before.value - 1) * 100;
      lines.push({
        mark: change > 0 ? 'plus' : 'minus',
        text: `${label} ${change > 0 ? 'raised' : 'cut'} to ${format(now)} from ${format(before.value)} on ${logDay(before.day)} (${signed(change)}%)`,
      });
    };
    compare('t', 'Median analyst target', estimate.medianPriceTarget);
    compare('f', "Analysts' EPS estimate", estimate.meanEpsTarget);
    compare('y', "Analysts' revenue estimate for the next fiscal year", revenueConsensusMillions(this.stock), millions);
    return lines;
  }

}

/** What the chart shows about the fall: its biggest single day since the high, or that no day stands out. Empty until the news was looked up. */
export function dropFacts(news: DropNews | undefined): string {
  if (!news) {
    return '';
  }
  if (!news.drop) {
    return `No single day fell ${BIG_DROP_PERCENT}%+ since the high: a gradual slide rather than one news event.`;
  }
  // Daily bars are stamped at midnight US Eastern (as UTC), so show the drop's calendar day in UTC.
  const when = news.drop.date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'});
  return `Biggest one-day fall since the high: ${news.drop.changePercent.toFixed(1)}% on ${when}.`;
}

/** What leads into the headlines from the week of that fall, or says that there are none. A slide has no such week. */
export function headlinesLine(news: DropNews | undefined): string {
  if (!news?.drop) {
    return '';
  }
  return news.headlines.length ? 'Headlines from that week:' : 'No headlines found for that week.';
}

/** The two facts a mark rests on: how the business is growing, and how far the price is below its highest of the past year. */
export function verdictInputs(signal: SignalResult): string[] {
  return [
    `${signal.growing ? 'Growing' : 'Not growing'}: ${signal.growthText}.`,
    signal.belowHigh === undefined ? 'Its highest price of the past year is not known.'
      : `${signal.belowHigh.toFixed(1)}% below its highest price of the past year (DIP BUY needs ${DIP_PERCENT}% or more).`,
  ];
}

/**
 * The same two facts as rows: the name of each, its figure, what DIP BUY needs of it, and whether it is enough.
 * A reader sees at a glance which of the two a WATCH or a PASS is short of.
 */
export function verdictFacts(signal: SignalResult): MarkFact[] {
  return [
    {label: signal.growing ? 'Growing' : 'Not growing', value: signal.growthText, ok: signal.growing},
    signal.belowHigh === undefined
      ? {label: 'Dropped', value: 'its highest price of the past year is not known'}
      : {
        label: 'Dropped', value: `${signal.belowHigh.toFixed(1)}% below its highest price of the past year`,
        needs: `needs ${DIP_PERCENT}%`, ok: signal.belowHigh >= DIP_PERCENT,
      },
  ];
}

/**
 * How much the price swings and what that meant in the tests, as two rows: the stock's own figure with the group
 * it puts the stock in, then how many stocks of that group fell a further 20% within 13 weeks of the mark, with
 * the other group's figure beside it. The same figures as `volatilityNote`, which says them in a sentence.
 */
export function swingFacts(tier: 'high' | 'low' | undefined, volatility: number): MarkFact[] {
  const fell = EVIDENCE.fresh.fellPercent;
  if (!tier) {
    // Neither calm nor volatile: the tests have a figure for each of those groups and none for the stocks between.
    return [
      {label: 'Swings', value: `${volatility.toFixed(0)}% a year`, needs: 'between calm and volatile'},
      {label: 'Fell a further 20%', value: `${inTen(fell.calm)} calm stocks, within 13 weeks of the mark`, needs: `volatile ones: ${inTen(fell.volatile)}`},
    ];
  }
  const own = tier === 'high' ? fell.volatile : fell.calm, other = tier === 'high' ? fell.calm : fell.volatile;
  return [
    {label: 'Swings', value: `${volatility.toFixed(0)}% a year`, needs: tier === 'high' ? 'volatile' : 'calm'},
    {
      label: 'Fell a further 20%', value: `${inTen(own)} such stocks, within 13 weeks of the mark`,
      needs: `${tier === 'high' ? 'calm' : 'volatile'} ones: ${inTen(other)}`,
    },
  ];
}

/** $ millions as "$5.00B" or "$640M". */
function millions(value: number): string {
  return value >= 1000 ? `$${(value / 1000).toFixed(2)}B` : `$${value.toFixed(0)}M`;
}

function logDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
}

function signed(value: number): string {
  const fixed = value.toFixed(1);
  // A change that rounds to nothing is "0.0", never "-0.0".
  return Number(fixed) === 0 ? '0.0' : `${Number(fixed) > 0 ? '+' : ''}${fixed}`;
}
