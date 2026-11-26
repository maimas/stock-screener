import {ORDER_NOTE} from "../recommendations";
import {ariaSort, inOrder, numberIn, orderAfterClick, RowOrder} from "../row-order";
import {byGroup, GROUP_HELP, groupBrief, groupBySymbol, groupTip, NO_GROUPS, TIED_NOTE, TIED_TITLE, TiedGroup, TiedGroups} from "../tied-groups";
import {MoreComponent} from "../more/more.component";
import {AboutComponent} from "../more/about.component";
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {MatCardModule} from "@angular/material/card";
import {MatTooltipModule} from "@angular/material/tooltip";
import {DIP_PERCENT, MarketFear} from "../signal";
import {CARD_NOTE, EVIDENCE, FEAR_HIGH_SHORT, oneIn} from "../evidence";

/** A stock marked DIP BUY, as this box shows it. */
export type DipCandidate = {
  symbol: string
  /** The company's name, when it is known: shown when the symbol is pointed at, in front of why it is marked. */
  name?: string
  /** How far the price is below its highest of the past year, in %. A DIP BUY is one because it dropped, so it is known. */
  belowHigh: number
  /** The growth figure the stock is marked on: "profit +21%" or "sales +27%". */
  growthText: string
  /** Became a DIP BUY today, on a stock the daily log already knew. */
  isNew: boolean
  /** Reports its results within 2 weeks. */
  earningsSoon: boolean
  /** In any of the user's portfolios. */
  held: boolean
  /** In which, as a sentence ("You hold this in Savings."): the tag's name and a line of the stock's mouse-over. */
  heldIn?: string
  /** Why it is marked, in one sentence: shown when its name is pointed at or reached with the keyboard. */
  headline: string
};

/** From this width the box has room for two tables of stocks and what is said about them, side by side. */
const WIDE_BOX = 1250;
/** With fewer stocks than this, one table is short enough. */
const SPLIT_FROM = 10;

/** How many stocks on the page carry each mark, and how many have none (funds, companies too new to judge). */
export type MarkCounts = { dipBuy: number, watch: number, pass: number, none: number };

/**
 * "Dip candidates": the stocks on the page that are marked DIP BUY, a row each, with the two things the mark rests
 * on under headings that say what they are (how far the price dropped, the growth figure). A table rather than a
 * cloud of chips: the numbers line up to be compared, and nothing has to be guessed or hovered to know what a
 * number is.
 *
 * Beside the table: where the market stands, what the three marks mean, and how stocks like these did in tests.
 * The amounts the plan gives for each stock stay in the plan, in the box "Your plan today".
 */
/** The columns of the candidates' table that its rows can be ordered by. */
export type DipColumn = 'symbol' | 'dropped' | 'growing' | 'group' | 'soon';
/** The columns that read from the top on the first click (A first, group A first, the soonest first). */
const FROM_THE_TOP = new Set<DipColumn>(['symbol', 'group', 'soon']);

/** A gain in the tests as the sentences about them write it: a sign, one decimal, the true minus. */
function gained(percent: number): string {
  return `${percent > 0 ? '+' : percent < 0 ? '\u2212' : ''}${Math.abs(percent).toFixed(1)}%`;
}

@Component({
  selector: "app-dip-candidates",
  standalone: true,
  imports: [NgIf, NgForOf, MatCardModule, MatTooltipModule, MoreComponent, AboutComponent],
  templateUrl: "./dip-candidates.component.html",
  styleUrls: ["./dip-candidates.component.scss"]
})
export class DipCandidatesComponent implements AfterViewInit, OnDestroy {
  /** The stocks marked DIP BUY, in the order to show them (the page gives them A to Z). */
  @Input() candidates: DipCandidate[] = [];
  @Input() marks: MarkCounts = {dipBuy: 0, watch: 0, pass: 0, none: 0};
  /** What is said in place of the loading bars when no price arrived at all; empty otherwise. */
  @Input() instead = '';
  /** "Try again" under that sentence. */
  @Output() retry = new EventEmitter<void>();
  /** The first prices are in: until then the box only says that it is loading. */
  @Input() loaded = false;
  /** Where the market stands against its highest of the past year, as a sentence without its full stop. */
  @Input() indexLine = '';
  /** How fearful the market is, from the VIX. */
  @Input() fear?: MarketFear;
  /** How much the candidates are one bet: shared sector and how closely they have moved together. */
  @Input() oneBet = '';
  /**
   * Which of the candidates moved together over the past year, as groups under a letter. The sentence above says
   * that they are nearer to one bet; the owner asked which of them are tied, to be able to use it.
   */
  @Input() set tied(tied: TiedGroups) {
    this.groups = tied;
    this.groupOf = groupBySymbol(tied);
  }

  groups: TiedGroups = NO_GROUPS;
  private groupOf = new Map<string, TiedGroup>();
  readonly tiedTitle = TIED_TITLE;

  /** What the count of stocks without a mark stands for: on that count, and in the page for a screen reader. */
  get unmarkedText(): string {
    const none = this.marks.none;
    return `${none} more ${none === 1 ? 'has' : 'have'} no mark: funds, and companies with too little history to judge.`;
  }
  /** Under the table: that an order by a column is the reader's own view, and that the page ranks nothing. */
  readonly orderNote = ORDER_NOTE;
  readonly tiedNote = TIED_NOTE;
  readonly groupHelp = GROUP_HELP;

  /** The group a stock is in, or nothing for a stock that moved on its own. */
  group(symbol: string): TiedGroup | undefined {
    return this.groupOf.get(symbol);
  }

  /** What a stock's group cell says where the pointer rests on it. */
  groupTipOf(symbol: string): string {
    return groupTip(symbol, this.groups);
  }

  /** "3 stocks, all Technology". */
  briefOf(group: TiedGroup): string {
    return groupBrief(group);
  }

  trackByLetter(_: number, group: TiedGroup): string {
    return group.letter;
  }
  /** The live record of the mark since the daily log began, and what the daily recorder last did. */
  @Input() trackText = '';
  @Input() recorderText = '';
  /** Set when the last re-run of the backtests needs a look. */
  @Input() evidenceText = '';

  /**
   * Folded to the least that is still useful day to day: the three marks with how many stocks carry each, how
   * fearful the market is, and the stocks with how far each dropped. What the marks mean, the sentences about the
   * tests and the other columns are left out, and the box is narrow, so the lists beside it get the room. The
   * page keeps the choice and hands it in.
   */
  @Input() folded = false;
  @Output() foldedChange = new EventEmitter<boolean>();

  /** Open this stock's details. */
  @Output() open = new EventEmitter<string>();
  /** Save the daily log as a file. */
  @Output() exportLog = new EventEmitter<void>();

  /**
   * The box is as wide as a whole window (it is not the pane beside the lists): the stocks then stand in two
   * tables side by side, half in each, read down the first and then down the second. In a laptop window twenty
   * stocks in one table ran off the first screen; in two, all of them and what is said about them are on it.
   * Set from the box's own width as it changes.
   */
  wide = false;
  private widths?: ResizeObserver;

  constructor(private readonly host: ElementRef<HTMLElement>, private readonly zone: NgZone) {
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.widths = new ResizeObserver(entries => {
      const wide = entries[entries.length - 1].contentRect.width >= WIDE_BOX;
      if (wide !== this.wide) {
        this.zone.run(() => this.wide = wide);
      }
    });
    this.widths.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.widths?.disconnect();
  }

  /**
   * The stocks as the tables that show them: one table, or two halves side by side (the first takes the odd one)
   * when the box is wide and there are enough stocks for two columns to be worth it.
   */
  get tables(): DipCandidate[][] {
    const rows = this.shownRows;
    const split = !this.folded && this.wide && rows.length >= SPLIT_FROM;
    // The same halves for as long as the rows and the layout are the same. They used to be cut anew on every check
    // of the page, and the page then built both tables anew each time: a symbol that was pressed, or a heading
    // that had the keyboard, was gone before the click or the next key arrived.
    if (this.halves?.rows !== rows || this.halves.split !== split) {
      const first = Math.ceil(rows.length / 2);
      this.halves = {rows, split, tables: split ? [rows.slice(0, first), rows.slice(first)] : [rows]};
    }
    return this.halves.tables;
  }

  private halves?: { rows: DipCandidate[], split: boolean, tables: DipCandidate[][] };

  /** A table keeps its place when its rows change (another order, a reload): the first stays the first. */
  trackByPlace(index: number): number {
    return index;
  }

  /**
   * The column the rows follow, once the reader clicked a heading; until then they stand as given, A to Z. The
   * page ranks nothing by itself: the order is the reader's.
   */
  order?: RowOrder<DipColumn>;
  private ordered?: { from: DipCandidate[], tied: TiedGroups, order: RowOrder<DipColumn>, rows: DipCandidate[] };

  /** A click on a heading: the rows follow that column, and a second click turns them round. */
  sortBy(column: DipColumn): void {
    this.order = orderAfterClick(this.order, column, FROM_THE_TOP.has(column));
  }

  sortedAs(column: DipColumn): 'ascending' | 'descending' | null {
    return ariaSort(this.order, column);
  }

  /** The candidates as given (A to Z), or in the order of the column that was clicked. */
  private get shownRows(): DipCandidate[] {
    const order = this.order;
    if (!order) {
      return this.candidates;
    }
    if (this.ordered?.from !== this.candidates || this.ordered.tied !== this.groups || this.ordered.order !== order) {
      const rows = order.column === 'group' ? byGroup(this.candidates, row => row.symbol, this.groups, order.direction)
        : inOrder(this.candidates, row => this.keyOf(row, order.column), order.direction, row => row.symbol);
      this.ordered = {from: this.candidates, tied: this.groups, order, rows};
    }
    return this.ordered.rows;
  }

  /** What a row is ordered by in a column, as its cell shows it. */
  private keyOf(row: DipCandidate, column: DipColumn): number | string | undefined {
    switch (column) {
      case 'symbol':
        return row.symbol;
      case 'dropped':
        return row.belowHigh;
      case 'growing':
        return numberIn(row.growthText);
      case 'soon':
        return row.earningsSoon ? 0 : undefined;   // the stocks that report within 2 weeks first; the others after
      default:
        return undefined;
    }
  }

  readonly dipPercent = DIP_PERCENT;
  /** What each of the three marks means, a sentence each: beside the mark, or on it while the box is folded. */
  readonly meanings = {
    dipBuy: `The price dropped ${DIP_PERCENT}% or more from its highest of the past year while the business keeps growing.`,
    watch: 'Growing, but no such drop yet.',
    pass: 'Not growing enough.',
  } as const;
  /** How stocks marked DIP BUY did in tests, in one paragraph. */
  readonly cardNote = CARD_NOTE;
  /**
   * The tested result as numbers: what a stock with the mark gained, on average and typically (the typical one
   * gained less than the average, and is shown beside it so that the average does not stand alone), then what any
   * stock that dropped and the market gained. The same figures as the sentence (`cardNote`), which keeps the limits.
   */
  readonly tested = {
    title: `In tests on ${EVIDENCE.stocks} stocks, over 6 months`,
    figures: [
      {label: 'DIP BUY, on average', value: gained(EVIDENCE.dipBuy.mean)},
      {label: 'DIP BUY, the typical one', value: gained(EVIDENCE.dipBuy.median)},
      {label: 'Any stock that dropped', value: gained(EVIDENCE.everyDip.mean)},
      {label: 'The market', value: gained(EVIDENCE.sp500.mean)},
      // The risk stands with the gains: shown alone, the gains were the upside in sight and the downside a click away.
      {label: 'DIP BUYs that fell a further 20% first', value: oneIn(EVIDENCE.dipBuy.fellPercent), risk: true},
    ] as { label: string, value: string, risk?: boolean }[],
    limits: `The typical one is the middle stock: half did better, half worse. Tested ${EVIDENCE.firstBuy.slice(0, 4)}–${EVIDENCE.lastBuy.slice(0, 4)} only.`,
  };

  /** Asked for by the link that skips the box: the keyboard goes on to the lists. */
  @Output() skipToLists = new EventEmitter<void>();

  skip(event: Event): void {
    event.preventDefault();
    this.skipToLists.emit();
  }
  readonly fearHighShort = FEAR_HIGH_SHORT;
  /** Rows drawn while the first prices are arriving. */
  readonly placeholders = [1, 2, 3, 4, 5];

  /**
   * Whether any candidate reports its results within 2 weeks. The column for that is shown only then: otherwise it
   * would be empty from top to bottom.
   */
  get anyReportsSoon(): boolean {
    return this.candidates.some(it => it.earningsSoon);
  }

  /** "−37%": how far the price is below its highest of the past year. */
  dropText(candidate: DipCandidate): string {
    return `−${candidate.belowHigh.toFixed(0)}%`;
  }

  /**
   * What shows when a stock's symbol is pointed at or reached with the keyboard: the company's name on a line of
   * its own, where it is known, then why the stock is marked.
   */
  tipOf(candidate: DipCandidate): string {
    const name = candidate.name && candidate.name !== candidate.symbol ? candidate.name : '';
    return [name, candidate.headline, candidate.held ? candidate.heldIn : ''].filter(it => !!it).join('\n');
  }

  trackBySymbol(_: number, candidate: DipCandidate): string {
    return candidate.symbol;
  }
}
