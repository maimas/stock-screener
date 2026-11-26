import {Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges} from "@angular/core";
import {NgForOf, NgIf, NgTemplateOutlet} from "@angular/common";
import {MatCardModule} from "@angular/material/card";
import {MatTooltipModule} from "@angular/material/tooltip";
import {CashSplit, cashSplit} from "../cash-split";
import {money, signedWholeMoney} from "../format";
import {ADD_TEXT} from "../plan";
import {Trade} from "../position-panel/position-panel.component";
import {Position} from "../positions";
import {ADD_TIP, PurchaseDraft, PurchaseFormComponent} from "../purchase-form/purchase-form.component";
import {PurchaseLine, PurchasesFormComponent} from "../purchases-form/purchases-form.component";
import {
  Addition, afterSelling, badCaseTip, badHalfYearLine, COLUMN_HELP, COLUMNS, COULD_ADD, couldAddHeadline, couldAddLead, COUNT_SOLD, Fact, FIT_NOTE, fitBrief,
  goodCaseTip, NO_SIZE_NOTE, nothingToAdd, ORDER_NOTE, ownedFit, OWNED_ROWS, readingTitleOf, Recommendation, RowReading, sellFact, sellNote, shareText,
  SIZE_RULES, sizeTip, SizingInput, splitCell, splitFacts, splitLines, tickHint, tiedFact, toSell, ToSell, typicalCaseTip, CENT
} from "../recommendations";
import {TestedCases} from "../sizing";
import {SaysComponent} from "../says/says.component";
import {byGroup, GROUP_HELP, groupBySymbol, groupTip, NO_GROUPS, tickedTogether, TIED_NOTE, TiedGroup, TiedGroups} from "../tied-groups";
import {ariaSort, inOrder, numberIn, orderAfterClick, RowOrder} from "../row-order";
import {AboutComponent} from "../more/about.component";
import {FACT_COLUMNS, FACT_HELP, FACTS_NOTE, StockFacts} from "../stock-facts";
import {CASES_LIMIT} from "../evidence";

/** One row, as it is shown: every cell worked out once, when what the box is given changes. */
type Row = {
  symbol: string
  isNew: boolean
  /** Already in the portfolio: the row says what could be added to it. */
  owned: boolean
  /** What the tests found for stocks of its kind: the split of the cash is worked out from it. */
  cases: TestedCases
  /** "20.1%" and "$2,013", or "add 4.0%" and "$400" for a stock that is owned; nothing while the portfolio is worth nothing. */
  share: string
  dollars: string
  /** Those dollars as a number: the lines under the table compare what the split gives a stock with them. */
  alone?: number
  capped: boolean
  sizeTip: string
  bad: string
  badTip: string
  /** What the size would have made in the typical half-year: between the two cases. */
  typical: string
  typicalTip: string
  good: string
  goodTip: string
  /**
   * What the portfolio holds that is like it, as two short cells: its sector with how many are owned in it, and
   * "closely" when its price moves with theirs. The figures behind "closely" show where the pointer rests.
   */
  sector: string
  moves: string
  movesTip: string
  /** For a stock that is owned: what is held of it, said across those two cells. */
  ownedNote: string
  /** What the page knows of the stock itself (how far it dropped, how it grows, two pieces of context). */
  facts?: StockFacts
};

/**
 * A ticked row's cell under "With your cash": what the money would buy of the stock, two words beside it only for
 * a stock that gets nothing, and what the amount is measured against where the pointer rests.
 */
type CashCell = { amount: string, note: string, tip: string };

/**
 * The three cases a row shows, each with what it says at the pointer: for the row's size, or (`forCash`) in a ticked
 * row that gets an amount, for that amount.
 */
type ShownCases = { bad: string, badTip: string, typical: string, typicalTip: string, good: string, goodTip: string, forCash: boolean };

/**
 * "Could add", on the portfolio's view: the stocks the Watchlist marks DIP BUY that the portfolio being shown does
 * not hold, a row each, with the size it would take in this portfolio (a share of it first, dollars second), what
 * a bad and a good half-year could mean at that size, and what the portfolio already holds that is like it. The
 * stocks it does hold that are marked and under their share come after them, as rows of the same table: what
 * could be added to each.
 *
 * It lists every such stock in the order it is given (A to Z): the tests found no way to tell which will do
 * best, so nothing here ranks, hides or picks. Nothing opens or expands; a click on a row leads to the stock.
 *
 * A row also says four things about the stock itself, which the owner of the page asked to see here instead of
 * looking each stock up on the Watchlist: how far it dropped and how it grows (what its mark rests on), and, set
 * quieter and after the plan's numbers, analysts' price target and how many of its owners are in profit (context
 * no test could use; the note under the table says so). The columns cannot be sorted: an order by any of them
 * would be a ranking, and none passed a test.
 *
 * Which stocks to buy is the user's choice, and the box helps with how much: each row has a tick box, none ticked
 * to begin with, and the portfolio's cash is split between the ticked ones (cash-split.ts). A ticked row shows what
 * the cash gives it, and lines under the table say what the purchase would do. The ticks are for looking, not kept:
 * they are gone when another portfolio is shown or the page is loaded again, and nothing else on the page depends
 * on them.
 *
 * The other side of a rebalance is selling, and the plan has one reason for it: a stock that could lose more than
 * the user's limit (SELL SOME). The box says which stocks that names and what selling them down to the limit
 * would free, with one more box to tick: that money is then split together with the cash, as if those sales were
 * made. When the plan asks to sell nothing the box says so, quietly, among the sentences about the table. No other
 * reason to sell is offered here: selling early tested worse than keeping, and the app does not pick.
 *
 * Under the table the first row is worked out in words, a line under the name of each of its three columns, so
 * that what the numbers are can be read without a pointer; then what holds for every row.
 *
 * A purchase that was made is recorded here too, which the owner of the page asked for: "Add" at the end of a row
 * opens a form under that row, filled in with the row's amount at today's price (purchase-form). One form at a
 * time; it records what the reader did and picks nothing. With two or more rows ticked, the foot of the table
 * offers to record them all in one form (purchases-form): the ticked stocks are the ones the reader said they
 * were thinking of buying, so they are the ones bought together.
 */
/** The columns of the table that its rows can be ordered by. */
export type AddColumn = 'symbol' | 'group' | 'dropped' | 'growing' | 'size' | 'bad' | 'typical' | 'good' | 'cash' | 'target' | 'holders' | 'sector' | 'moves';
/** The columns that read from the top on the first click (A first, group A first). */
const FROM_THE_TOP = new Set<AddColumn>(['symbol', 'group', 'sector', 'moves']);

@Component({
  selector: "app-could-add",
  standalone: true,
  imports: [NgIf, NgForOf, NgTemplateOutlet, MatCardModule, MatTooltipModule, SaysComponent, PurchaseFormComponent,
    PurchasesFormComponent, AboutComponent],
  templateUrl: "./could-add.component.html",
  styleUrls: ["./could-add.component.scss"]
})
export class CouldAddComponent implements OnChanges {
  /** The stocks marked DIP BUY that the portfolio does not hold, sized for it. */
  @Input() recommendations: Recommendation[] = [];
  /** The name of the portfolio being shown. */
  @Input() portfolio = '';
  /**
   * Which portfolio that is. The ticks belong to it: they are forgotten when another one is shown, and kept when
   * this one is only given a new name. (Two portfolios may have the same name.)
   */
  @Input() portfolioId = '';
  /** How many of its holdings have no price today: they are not among the sizes' holdings, but they are held. */
  @Input() unpriced = 0;
  /** How many stocks on the page are marked DIP BUY, held or not: an empty box says from it why it is empty. */
  @Input() marked = 0;
  /** The stocks that got their mark today. */
  @Input() fresh: ReadonlySet<string> = new Set<string>();
  /** The first row worked out in words, shown under the table; none while there is no size to work out. */
  @Input() reading?: RowReading;
  /** The stocks the portfolio holds that are marked DIP BUY and are under their share: what could be added to each. */
  @Input() additions: Addition[] = [];
  /** What the sizes were worked out from: the cash is split between the ticked stocks from the same figures. */
  @Input() sizing?: SizingInput;
  /** The portfolio's cash, which is what a split has to work with. */
  @Input() cash?: number;
  /**
   * The dollars the user keeps outside stocks: a share of the portfolio they set themself ("Keep outside stocks").
   * Only the money above it is split. None unless they set a share (the page's template hands in null then).
   */
  @Input() keep?: number | null;
  /**
   * The companies' names by symbol: a symbol alone says nothing to who does not know it. A name shows when the
   * pointer rests on its symbol or the keyboard reaches it, as in the page's other tables; the rows stay one line tall.
   */
  @Input() names: Record<string, string> = {};
  /** What the page knows of each stock itself, by symbol: the row's four cells about the stock. */
  @Input() facts: Record<string, StockFacts> = {};
  /** Today's price of each stock, by symbol: a row can record a purchase once its price is known. */
  @Input() prices: Record<string, number> = {};
  /** What the portfolio being shown holds, by symbol: a purchase of a stock that is held is added to it. */
  @Input() positions: Record<string, Position> = {};
  /** Today, as YYYY-MM-DD: the day a purchase starts from. */
  @Input() today = '';
  /** Prices are still arriving. Until every list has loaded nothing is shown: half the prices give wrong sizes. */
  @Input() loading = false;
  /**
   * Which of the stocks marked DIP BUY moved together over the past year, as groups under a letter (the same
   * letters as in "Dip candidates"). The owner asked for them here, where the stocks to buy are ticked.
   */
  @Input() set tied(tied: TiedGroups) {
    this.groups = tied;
    this.groupOf = groupBySymbol(tied);
  }

  groups: TiedGroups = NO_GROUPS;
  private groupOf = new Map<string, TiedGroup>();
  readonly groupHelp = GROUP_HELP;

  /** The column of the groups is there when a stock of the table is in one. */
  get hasGroups(): boolean {
    return this.rows.some(row => this.groupOf.has(row.symbol));
  }

  group(symbol: string): TiedGroup | undefined {
    return this.groupOf.get(symbol);
  }

  groupTipOf(symbol: string): string {
    return groupTip(symbol, this.groups);
  }

  /**
   * The column the rows follow, once the reader clicked a heading; until then they stand as given, A to Z. The
   * page orders nothing by itself and ranks no stock: an order is the reader's own view (the note under the table
   * says so).
   */
  order?: RowOrder<AddColumn>;
  private orderedRows?: { from: Row[], tied: TiedGroups, order: RowOrder<AddColumn>, cells: unknown, rows: Row[] }[];
  /** Under the table: what the "Group" letters are, and that an order by a column is the reader's own view. */
  readonly groupNote = TIED_NOTE;
  readonly orderNote = ORDER_NOTE;

  /**
   * The title of the worked example. It says "the first row" while its stock stands first; once the reader's own
   * order puts another stock there, it names the row and no place.
   */
  get exampleTitle(): string {
    const example = this.reading;
    if (!example) {
      return '';
    }
    const first = this.ordered(this.newRows)[0]?.symbol;
    return !this.order || !example.symbol || first === example.symbol ? example.title : readingTitleOf(example.symbol);
  }

  /** A click on a heading: the rows follow that column, and a second click turns them round. */
  sortBy(column: AddColumn): void {
    this.order = orderAfterClick(this.order, column, FROM_THE_TOP.has(column));
  }

  sortedAs(column: AddColumn): 'ascending' | 'descending' | null {
    return ariaSort(this.order, column);
  }

  /** A part of the table in the order it is shown: as given (A to Z), or by the column that was clicked. */
  ordered(rows: Row[]): Row[] {
    const order = this.order;
    if (!order) {
      return rows;
    }
    const kept = (this.orderedRows ?? []).find(it => it.from === rows && it.tied === this.groups && it.order === order && it.cells === this.cells);
    if (kept) {
      return kept.rows;
    }
    const made = {
      from: rows, tied: this.groups, order, cells: this.cells as unknown,
      rows: order.column === 'group' ? byGroup(rows, row => row.symbol, this.groups, order.direction)
        : inOrder(rows, row => this.keyOf(row, order.column), order.direction, row => row.symbol),
    };
    this.orderedRows = [...(this.orderedRows ?? []).filter(it => it.from !== rows).slice(-1), made];
    return made.rows;
  }

  /**
   * What a row is ordered by in a column, as its cell shows it. A drop and a bad case are ordered by how big they
   * are (the furthest drop, the biggest loss first), not by their minus sign.
   */
  private keyOf(row: Row, column: AddColumn): number | string | undefined {
    const size = (value: number | undefined) => value === undefined ? undefined : Math.abs(value);
    switch (column) {
      case 'symbol':
        return row.symbol;
      case 'dropped':
        return size(numberIn(row.facts?.dropped));
      case 'growing':
        return numberIn(row.facts?.growing);
      case 'size':
        return numberIn(row.share);
      // By what the cells show: in a ticked row the cases of the amount the money would buy.
      case 'bad':
        return size(numberIn(this.casesOf(row).bad));
      case 'typical':
        return numberIn(this.casesOf(row).typical);
      case 'good':
        return numberIn(this.casesOf(row).good);
      case 'cash':
        return numberIn(this.cashOf(row.symbol)?.amount);
      case 'target':
        return numberIn(row.facts?.target);
      case 'holders':
        return numberIn(row.facts?.holders);
      case 'sector':
        return row.sector || row.ownedNote || undefined;
      case 'moves':
        return row.moves || undefined;
      default:
        return undefined;
    }
  }

  /**
   * What the ticked stocks have to do with one another, in a sentence, once two or more are ticked: which of them
   * are in one group, or that none moved closely with another. A fact about the past year; it picks nothing.
   */
  get tiedSays(): string {
    return tickedTogether(this.rows.map(row => row.symbol).filter(symbol => this.isTicked(symbol)), this.groups);
  }

  /** What is said in place of "working" when no price arrived at all. Empty otherwise. */
  @Input() instead = '';
  /** Open a stock's details. */
  @Output() open = new EventEmitter<string>();
  /** A purchase recorded in a row: the holding that results and what it does to the cash. */
  @Output() trade = new EventEmitter<Trade>();
  /** The purchases of the ticked stocks, recorded together: saved in one step and taken back in one step. */
  @Output() trades = new EventEmitter<Trade[]>();

  readonly title = COULD_ADD;
  readonly fitNote = FIT_NOTE;
  /** The headings of the columns of numbers: the example under the table names its lines after the first three. */
  readonly columns = COLUMNS;
  /** What "Size", the two cases and the amount of a ticked row are, for their headings. */
  readonly columnHelp = COLUMN_HELP;
  /** Over the rows of the stocks that are owned, when new stocks stand above them. */
  readonly ownedTitle = OWNED_ROWS;
  /** Beside the box that counts what selling would free. */
  readonly countSoldLabel = COUNT_SOLD;
  /** The four columns about the stock itself: their headings, what each is, and the note under the table. */
  readonly factColumns = FACT_COLUMNS;
  readonly factHelp = FACT_HELP;
  readonly factsNote = FACTS_NOTE;
  /** Under the table, in sight: when the three cases were tested, and that it can be worse. */
  readonly casesLimit = CASES_LIMIT;
  /** Under the lines about what is ticked: that ticks are not kept. */
  readonly ticksNote = 'Ticks are not saved: a reload of the page clears them.';
  /** Where the pointer rests on "Add": that it records a purchase and buys nothing. */
  readonly addTip = ADD_TIP;

  /** Every row: the new stocks, then the ones that are owned and could be added to. The table shows the two apart. */
  rows: Row[] = [];
  newRows: Row[] = [];
  ownedRows: Row[] = [];
  /** Which stocks these are, that the page ranks none and that each size stands alone: the first of the explanations. */
  lead = '';
  /** Beside the title: the same in a count and a few words. */
  headline = '';
  /** The one sentence in sight: that ticking is the way to a split of the cash. Nothing while there are no sizes to split by. */
  hint = '';
  /** Under the example: what holds for every row, or how to get sizes while there are none. */
  sizeNote = SIZE_RULES;
  /** The portfolio is worth something, so the rows have sizes: their columns and the tick boxes are shown. */
  hasSizes = false;
  /** The portfolio holds something to be like: the table then has the two columns that say so. */
  hasFit = false;
  /** The page knows the stocks themselves (their prices have loaded): the table then has the four columns about them. */
  hasFacts = false;
  /** The prices are known, so a purchase can be recorded: each row then ends in "Add". */
  canRecord = false;
  /** The stock whose purchase is being entered: its form stands under its row. One at a time. */
  buying?: string;
  /**
   * The ticked stocks a purchase can be recorded for, as the form for several is handed them. Two or more: the foot
   * of the table then offers that form. Worked out again whenever the ticks or the split change.
   */
  batchLines: PurchaseLine[] = [];
  /** The form for the ticked stocks is open, at the foot of the table. Not together with a row's own form. */
  batching = false;

  constructor(private readonly host: ElementRef<HTMLElement>) {
  }
  /**
   * A new stock's row says something in those two columns, so the note about them is shown. Not when they only say
   * what is held of the stocks that are owned: the note would describe what the table does not show.
   */
  showFitNote = false;
  emptyText = '';

  /**
   * The stocks the user ticked, by symbol. Looked at, not saved: the owner chose that when the ticks were designed
   * (nothing is ticked when the page opens, so that it never looks as if the page had picked stocks).
   */
  private readonly ticked = new Set<string>();
  /** The cash split between them; none while nothing is ticked. */
  split?: CashSplit;
  /** What that gives each ticked row, by symbol, and what it means for the portfolio, a line a thought. */
  private cells = new Map<string, CashCell>();
  /**
   * The three cases of a ticked row that gets an amount, worked out for that amount: a row said "With your cash
   * $1,000" beside a bad and a good case still worked out for its whole size (a review; the owner's word).
   */
  private cashCases = new Map<string, ShownCases>();

  /** The three cases a row shows: for its size, or, once it is ticked and gets an amount, for that amount. */
  casesOf(row: Row): ShownCases {
    return this.cashCases.get(row.symbol) ?? this.sizeCases(row);
  }

  private sizeCasesKept = new WeakMap<Row, ShownCases>();

  private sizeCases(row: Row): ShownCases {
    let cases = this.sizeCasesKept.get(row);
    if (!cases) {
      cases = {bad: row.bad, badTip: row.badTip, typical: row.typical, typicalTip: row.typicalTip, good: row.good, goodTip: row.goodTip, forCash: false};
      this.sizeCasesKept.set(row, cases);
    }
    return cases;
  }
  splitSays: string[] = [];
  /**
   * The line about a bad half-year, of those lines, by itself. Empty while nothing is ticked or nothing would be
   * bought.
   */
  badCaseSays = '';
  /**
   * The answer to a tick as it stands beside the instruction: figures with their names, each with the sentence it
   * comes from, or the one sentence that says why nothing is split.
   */
  splitFigures: Fact[] = [];
  splitInstead = '';

  /** Those figures and, with two or more ticked, which of the ticked stocks moved together over the past year. */
  get answerFacts(): Fact[] {
    const tied = tiedFact(this.rows.map(row => row.symbol).filter(symbol => this.isTicked(symbol)), this.groups);
    if (!tied) {
      return this.splitFigures;
    }
    const kept = this.answerKept;
    if (kept && kept.figures === this.splitFigures && kept.tied.value === tied.value) {
      return kept.facts;
    }
    this.answerKept = {figures: this.splitFigures, tied, facts: [...this.splitFigures, tied]};
    return this.answerKept.facts;
  }

  private answerKept?: { figures: Fact[], tied: Fact, facts: Fact[] };

  trackByLabel(_: number, fact: Fact): string {
    return fact.label;
  }

  /** The stocks the plan says to sell some of (SELL SOME), each with what that would free. */
  private sell: ToSell[] = [];
  /** The sell side in a sentence, with the explanations; nothing while the portfolio is worth nothing. */
  sellSays = '';
  /** The plan asks to sell something: what that would free then stands above the table, with a box to count the money. */
  hasSale = false;
  /** What those sales would free, as a figure with its name; none while the plan asks to sell nothing. */
  saleFact?: Fact;
  /** The user asked for what those sales would free to be split with the cash. Looked at, not saved, like the ticks. */
  countSold = false;
  /** The stocks the plan named when that was ticked: the tick is for that sale, and does not count another. */
  private countedFor = '';
  /**
   * The name of the column of the second amount and of the heading over the lines: by the cash, or by the money
   * once what selling would free is counted (it is not the cash alone then, and there may be no cash at all).
   */
  cashTitle: string = COLUMNS.cash;

  ngOnChanges(changes: SimpleChanges): void {
    // By which portfolio it is, not by its name: two may have one name, and a portfolio may be given another.
    if (changes['portfolioId'] && !changes['portfolioId'].firstChange) {
      this.ticked.clear();   // they were ticked among another portfolio's rows
      this.countSold = false;
      this.buying = undefined;   // a purchase being entered was for the other portfolio
      this.drafts.clear();
      this.batching = false;
    }
    const fresh = this.recommendations.map((it): Row => ({
      symbol: it.symbol, isNew: this.fresh.has(it.symbol), owned: false, cases: it.cases, facts: this.facts[it.symbol],
      share: it.size ? shareText(it.size.sharePercent) : '', dollars: it.size ? money(it.size.dollars) : '', alone: it.size?.dollars,
      capped: !!it.size?.capped, sizeTip: it.size ? sizeTip(it.size) : '',
      bad: it.size ? signedWholeMoney(-it.size.loss) : '', badTip: it.size ? badCaseTip(it.cases) : '',
      typical: it.size ? signedWholeMoney(it.size.dollars * it.cases.typicalPercent / 100) : '', typicalTip: it.size ? typicalCaseTip(it.cases) : '',
      good: it.size ? signedWholeMoney(it.size.gain) : '', goodTip: it.size ? goodCaseTip(it.cases) : '',
      sector: fitBrief(it.fit).sector, moves: fitBrief(it.fit).moves, movesTip: fitBrief(it.fit).tip, ownedNote: '',
    }));
    // The stocks that are owned and could be added to. Each is among the holdings the sizes were worked out from,
    // which is where its tested cases and what is held of it are read.
    const more = this.additions.flatMap((it): Row[] => {
      const held = this.sizing?.holdings.find(holding => holding.symbol === it.symbol);
      return !held?.cases ? [] : [{
        symbol: it.symbol, isNew: this.fresh.has(it.symbol), owned: true, cases: held.cases, facts: this.facts[it.symbol],
        share: `add ${shareText(it.sharePercent)}`, dollars: money(it.dollars), alone: it.dollars, capped: it.capped, sizeTip: ADD_TEXT,
        bad: signedWholeMoney(-it.loss), badTip: badCaseTip(held.cases), good: signedWholeMoney(it.gain), goodTip: goodCaseTip(held.cases),
        typical: signedWholeMoney(it.dollars * held.cases.typicalPercent / 100), typicalTip: typicalCaseTip(held.cases),
        sector: '', moves: '', movesTip: '', ownedNote: ownedFit(held.value),
      }];
    });
    this.rows = [...fresh, ...more];
    this.newRows = fresh;
    this.ownedRows = more;
    this.hasSizes = !!this.sizing && this.rows.some(row => row.dollars !== '');
    this.hasFit = this.rows.some(row => row.sector !== '' || row.moves !== '' || row.ownedNote !== '');
    this.showFitNote = fresh.some(row => row.sector !== '' || row.moves !== '');
    this.hasFacts = this.rows.some(row => !!row.facts);
    this.canRecord = this.rows.some(row => this.prices[row.symbol] > 0);
    this.sizeNote = this.hasSizes ? SIZE_RULES : NO_SIZE_NOTE;
    this.lead = couldAddLead(fresh.length, this.portfolio, more.length);
    this.headline = couldAddHeadline(fresh.length, this.portfolio, more.length);
    this.emptyText = nothingToAdd(this.marked);

    // The sell side, from the same figures as the sizes. Once the plan asks to sell nothing there is no freed
    // money left to count, and when it names other stocks than the box was ticked for, the tick was not for them:
    // either way the box is unticked, and it never comes back ticked by itself.
    this.sell = this.hasSizes ? toSell(this.sizing) : [];
    this.sellSays = this.hasSizes ? sellNote(this.sell) : '';
    this.hasSale = this.sell.length > 0;
    this.saleFact = sellFact(this.sell);
    this.countSold = this.countSold && this.hasSale && this.namedToSell() === this.countedFor;

    // A stock that left the table (its mark changed, or all of its share was bought) takes its tick with it. One
    // that was bought in part comes back as a row of what is owned, and stays ticked.
    const listed = new Set(this.rows.map(row => row.symbol));
    [...this.ticked].filter(symbol => !listed.has(symbol) || !this.hasSizes).forEach(symbol => this.ticked.delete(symbol));
    if (this.buying && !listed.has(this.buying)) {
      this.buying = undefined;
    }
    this.splitTheCash();
  }

  /** How many columns the table has now: the heading over the owned rows spans them all. */
  get columnCount(): number {
    // With sizes: the tick box, "Size", and the bad, the typical and the good case.
    return 1 + (this.hasGroups ? 1 : 0) + (this.hasFacts ? 4 : 0) + (this.hasSizes ? 5 : 0) + (this.cashColumn ? 1 : 0) + (this.hasFit ? 2 : 0) + (this.canRecord ? 1 : 0);
  }

  /** The reader typed in the form for the ticked stocks since it was opened. */
  batchTyped = false;

  /**
   * What was typed into a row's purchase form, by symbol, while that form is closed because another row's was
   * opened: it comes back with the row. Forgotten once the purchase is recorded or the form is cancelled.
   */
  readonly drafts = new Map<string, PurchaseDraft>();

  /**
   * Whether the table has the column of the second amount. From the start wherever there is something to split
   * (cash, or a sale the plan names), empty until a row is ticked: it used to appear with the first tick, in the
   * middle of the table, and every column after it jumped up to 53px sideways under the pointer.
   */
  get cashColumn(): boolean {
    return this.hasSizes && (!!this.split || (this.cash ?? 0) > 0 || this.hasSale);
  }

  isTicked(symbol: string): boolean {
    return this.ticked.has(symbol);
  }

  /** A click on a row's tick box: the stock is counted in the split of the cash, or taken out of it again. */
  toggle(symbol: string): void {
    if (!this.ticked.delete(symbol)) {
      this.ticked.add(symbol);
    }
    this.splitTheCash();
  }

  /** "Untick all", beside the answer to the ticks: every tick off at once, and the keyboard stays in the box. */
  untickAll(): void {
    this.ticked.clear();
    this.batching = false;
    this.splitTheCash();
    this.host.nativeElement.focus({preventScroll: true});
  }

  /** A click on the box under the sell side: what selling would free is split with the cash, or left out again. */
  toggleSold(): void {
    this.countSold = !this.countSold;
    this.countedFor = this.namedToSell();
    this.splitTheCash();
  }

  /** The stocks the plan says to sell some of, as one string: what a tick of that box was given for. */
  private namedToSell(): string {
    return this.sell.map(it => it.symbol).join(' ');
  }

  /** What the cash gives the stock of a row; nothing for a row that is not ticked. */
  cashOf(symbol: string): CashCell | undefined {
    return this.cells.get(symbol);
  }

  trackBySymbol(_: number, row: Row): string {
    return row.symbol;
  }

  /** The row whose stock has the keyboard (not a click of the pointer). */
  private keyboardOn?: string;

  onStockFocus(symbol: string, event: FocusEvent): void {
    const button = event.target as HTMLElement | null;
    this.keyboardOn = button?.matches?.(':focus-visible') ? symbol : undefined;
  }

  onStockBlur(): void {
    this.keyboardOn = undefined;
  }

  /**
   * What shows on a row's stock. Under the pointer: the company's name. With the keyboard on it: the name, then
   * what the cells of the row say to a pointer, under the name of each column, for the cells that differ from row
   * to row. A cell cannot take the keyboard, and without this its explanation could only be pointed at.
   *
   * How a size, a bad case and a good case are worked out reads the same in every row and is said in words under
   * the table (the worked example), so it is left out here: with it the box was nine lines tall and covered the
   * next eight rows. It opens above the row, where it covers what was read already.
   */
  stockTip(row: Row): string {
    const name = this.names[row.symbol] || '';
    if (this.keyboardOn !== row.symbol) {
      return name;
    }
    const said = (label: string, text: string | undefined) => text ? [`${label}: ${text}`] : [];
    return [
      ...(name ? [name] : []),
      ...said(this.factColumns.dropped, row.facts?.droppedTip),
      ...said(this.factColumns.growing, row.facts?.growingTip),
      // A ticked row: what its amount is measured against. In the order of the columns, like the rest.
      ...said(this.cashTitle, this.cashOf(row.symbol)?.tip),
      ...said(this.factColumns.target, row.facts?.targetTip),
      ...said(this.factColumns.holders, row.facts?.holdersTip),
      ...said(this.columns.moves, row.movesTip),
    ].join('\n');
  }

  /** The link in front of the table that takes the keyboard past it, to what stands under it. */
  skipTable(event: Event): void {
    event.preventDefault();
    const after = this.host.nativeElement.querySelector<HTMLElement>('.about');
    if (after) {
      after.tabIndex = -1;
      after.focus({preventScroll: true});
      after.scrollIntoView({block: 'nearest'});
    }
  }

  /** "Add" in a row: opens the form for that stock, or closes it when it is the one that is open. */
  startBuying(symbol: string): void {
    this.buying = this.buying === symbol ? undefined : symbol;
    this.batching = false;
  }

  /** "Add the N ticked", at the foot of the table and beside the answer above it: opens the form for all of them, or closes it. */
  startBatch(): void {
    this.batching = !this.batching;
    this.batchTyped = false;
    this.buying = undefined;
    if (this.batching) {
      // The form opens at the foot of the table, which may be below the window: it is brought into view.
      setTimeout(() => this.host.nativeElement.querySelector('tfoot')?.scrollIntoView({block: 'nearest'}));
    }
  }

  /**
   * A row's form was cancelled (its button, or Esc): the keyboard goes back to the "Add" it was opened with, and
   * is not left on nothing.
   */
  cancelBuying(symbol: string): void {
    this.buying = undefined;
    this.drafts.delete(symbol);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`tr[data-row="${symbol}"] button.add`)?.focus());
  }

  /** The form for the ticked stocks was cancelled: the keyboard goes back to the button that opened it. */
  cancelBatch(): void {
    this.batching = false;
    // Back to the button the form was opened with, which stands with the answer to a tick. With one row left
    // ticked there is no such button: the keyboard then goes to that row's tick, and failing that to the box
    // itself. It is never left on nothing.
    setTimeout(() => {
      const box = this.host.nativeElement;
      const to = Array.from(box.querySelectorAll<HTMLElement>('button.batch')).find(button => button.offsetParent !== null)
        ?? box.querySelector<HTMLElement>('tbody input[type="checkbox"]:checked') ?? box;
      to.focus({preventScroll: to === box});
    });
  }

  /** The form for the ticked stocks was saved: the purchases go to the page together. */
  recordAll(trades: Trade[]): void {
    this.batching = false;
    this.trades.emit(trades);
    this.host.nativeElement.focus({preventScroll: true});
  }

  /**
   * The amount a row's form starts from: what the cash gives the stock once it is ticked (the amount the reader is
   * looking at beside it), otherwise the size the row gives it. Nothing while the row has no size.
   */
  startDollars(row: Row): number | undefined {
    const part = this.split?.parts.find(it => it.symbol === row.symbol);
    return part && part.dollars > 0 ? part.dollars : row.alone;
  }

  /** The form was saved: the purchase goes to the page, and the keyboard stays in this box. */
  record(trade: Trade): void {
    if (this.buying) {
      this.drafts.delete(this.buying);
    }
    this.buying = undefined;
    this.trade.emit(trade);
    this.host.nativeElement.focus({preventScroll: true});
  }

  /**
   * Works the split out again for what is ticked now: the hint, the amounts for the rows and the lines under the
   * table.
   *
   * With what selling would free counted, the split is worked out as if those sales were made: on the portfolio
   * with each such stock at what is kept, and with the freed money as cash beside the cash entered. The
   * calculation is the same one (cash-split.ts); only what it is handed differs.
   */
  private splitTheCash(): void {
    const sold = this.countSold ? this.sell : [];
    const freed = sold.reduce((sum, it) => sum + it.free, 0);
    const cash = this.cash !== undefined && this.cash > 0 ? this.cash : 0;
    // The money of a sale that is on offer and not counted: where there is no cash, the hint and the lines name it.
    const offered = this.hasSale && !this.countSold;
    // What the user keeps outside stocks is not split: only the money above it is.
    const keep = typeof this.keep === 'number' && this.keep > 0 ? this.keep : 0;
    // While a holding has no price the portfolio is worth more than could be counted, so the amount to keep is the
    // least it can be: nothing is split then, and the hint and the lines say why.
    const keepUnknown = keep > 0 && this.unpriced > 0;
    this.hint = this.hasSizes ? tickHint(cash, freed, offered, keep, keepUnknown) : '';
    this.cashTitle = freed > 0 ? COLUMNS.money : COLUMNS.cash;

    const ticked = this.rows.filter(row => this.ticked.has(row.symbol));
    const picked = ticked.map(row => ({symbol: row.symbol, cases: row.cases}));
    if (!this.sizing || picked.length === 0) {
      this.split = undefined;
      this.cells = new Map();
      this.cashCases = new Map();
      this.splitSays = [];
      this.badCaseSays = '';
      this.splitFigures = [];
      this.splitInstead = '';
      this.batchLines = [];
      this.batching = false;
      return;
    }
    // Under half a cent above what is kept is nothing to split, here as in the hint.
    const above = keepUnknown ? 0 : cash + freed - keep;
    const split = cashSplit(afterSelling(this.sizing, sold), above >= CENT ? above : 0, picked);
    this.split = {
      ...split,
      // "Today" is the portfolio as it is, before anything is sold.
      togetherLossBefore: sold.length > 0 ? cashSplit(this.sizing, cash, []).togetherLossBefore : split.togetherLossBefore,
      // A holding whose price did not load is not among the holdings the sizes are worked out from, and is held
      // all the same: "you would hold 5 stocks instead of 4" counts it.
      stocksBefore: split.stocksBefore + this.unpriced,
      stocksAfter: split.stocksAfter + this.unpriced,
    };
    this.cells = new Map(this.split.parts.map(part => [part.symbol, splitCell(part)] as const));
    // A ticked row that gets an amount shows its three cases for that amount (under half a cent it gets nothing).
    this.cashCases = new Map(this.split.parts.flatMap(part => {
      const row = ticked.find(it => it.symbol === part.symbol);
      if (!row || part.dollars < CENT) {
        return [];
      }
      const bought = money(part.dollars);
      return [[part.symbol, {
        bad: signedWholeMoney(-part.loss), badTip: badCaseTip(row.cases, bought),
        typical: signedWholeMoney(part.dollars * row.cases.typicalPercent / 100), typicalTip: typicalCaseTip(row.cases, bought),
        good: signedWholeMoney(part.gain), goodTip: goodCaseTip(row.cases, bought), forCash: true,
      }] as const];
    }));
    this.batchLines = ticked.filter(row => this.prices[row.symbol] > 0).map(row => ({
      symbol: row.symbol, held: this.positions[row.symbol], price: this.prices[row.symbol], dollars: this.startDollars(row),
    }));
    // With fewer than two ticked the form for several goes away, unless the reader typed in it: it then stays
    // while one line is left, with what it holds. Unticking down to one used to drop what was typed.
    this.batching = this.batching && (this.batchLines.length > 1 || (this.batchTyped && this.batchLines.length > 0));
    this.batchTyped = this.batchTyped && this.batching;
    // What each ticked row shows under "Size": the lines say why an amount is measured against less, where one is.
    const alone = Object.fromEntries(ticked.flatMap(row => row.alone === undefined ? [] : [[row.symbol, row.alone] as const]));
    this.splitSays = splitLines(this.split, {freed, offered, alone, keep, cash, keepUnknown});
    this.badCaseSays = badHalfYearLine(this.split, {freed, keep, keepUnknown});
    const answer = splitFacts(this.split, {freed, offered, alone, keep, cash, keepUnknown});
    this.splitFigures = answer.facts;
    this.splitInstead = answer.instead;
  }
}
