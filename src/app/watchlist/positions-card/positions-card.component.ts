import {Component, ElementRef, EventEmitter, Input, Optional, Output, ViewChild} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {MatButtonModule} from "@angular/material/button";
import {MatButtonToggleModule} from "@angular/material/button-toggle";
import {MatCardModule} from "@angular/material/card";
import {MatIconModule} from "@angular/material/icon";
import {MatTooltipModule} from "@angular/material/tooltip";
import {Portfolio} from "../positions";
import {NamedPortfolio, PortfolioBook} from "../portfolio-book";
import {PortfolioView, PositionRow} from "../portfolio-view";
import {asks, HoldingPlan, holdingPlans, PlanStep, saidInRows, StepKind} from "../plan";
import {CASES_CARD_NOTE, CASES_LIMIT, EVIDENCE, severalCardNote, takeProfitBrief, takeProfitFigures, takeProfitOffer} from "../evidence";
import {CASH_LABEL, DEFAULT_LIMIT_PERCENT, KEEP_OUT_LABEL, LIMIT_LABEL, NO_GAP_UNDER, OWN_TABLE, PLAN_BOX, TAKE_PROFIT_LABEL} from "../sizing";
import {COULD_ADD, Fact} from "../recommendations";
import {money, shareCount, shareText, signedMoney, signedPercent, signedWholeMoney} from "../format";
import {againstMarket, againstMarketFacts, againstMarketLines} from "../market-compare";
import {DEFAULT_SORT, nextSort, RowSort, SortColumn, sortedRows} from "../position-sort";
import {TipOnFocusDirective} from "../tip-on-focus.directive";
import {FocusWhenShownDirective} from "../focus-when-shown.directive";
import {SaysComponent} from "../says/says.component";
import {byGroup, GROUP_HELP, groupBySymbol, groupTip, NO_GROUPS, TIED_NOTE, TiedGroup, TiedGroups} from "../tied-groups";
import {AboutComponent} from "../more/about.component";

/**
 * The settings of a portfolio as the box hands them over: all of them each time, and one that is left out means
 * "none" (no cash, the starting limit, no share kept, no level for taking a profit).
 */
export type PortfolioSettings = { cash?: number, lossBudgetPercent?: number, reservePercent?: number, takeProfitPercent?: number };
/**
 * Where the portfolios are kept: the database, nothing at all on the development server (its store keeps nothing
 * past its own end), or this browser only while the database is not answering.
 */
export type SavedIn = 'checking' | 'database' | 'memory' | 'browser';
/** What the last change did, with the book as it was before when the change can be taken back. */
export type BookNotice = { text: string, undo?: PortfolioBook };
/** A word of the "Plan" column with the plan's sentence for it. */
export type PlanWord = { kind: StepKind, verb: string, text: string };

/**
 * The first box on the page, "Your plan today": everything about the portfolio being shown, read top to bottom.
 *  - Which portfolio (an account, say), with the names along the top, and the two numbers the plan works from:
 *    the account's cash and the limit for a loss on one stock.
 *  - The plan's lines for it, handed in by the page (`<app-plan-card>` between this component's tags): what is new
 *    and what asks for something.
 *  - "What you own", one table: what the plan says about each stock, its size, weight, result against the S&P 500,
 *    time held against the 6 months the tests followed, and what a tested bad case would cost and a good case
 *    would add. The plan's steps that only say where a stock stands (keep, no opinion) are said here alone, a word
 *    a row, with their sentences under the table.
 * It also says where it is all saved.
 */
@Component({
  selector: "app-positions-card",
  standalone: true,
  imports: [
    NgIf, NgForOf, FormsModule, MatButtonModule, MatButtonToggleModule, MatCardModule, MatIconModule, MatTooltipModule,
    TipOnFocusDirective, SaysComponent, FocusWhenShownDirective, AboutComponent,
  ],
  templateUrl: "./positions-card.component.html",
  styleUrls: ["./positions-card.component.scss"]
})
export class PositionsCardComponent {
  /** Every portfolio and which one is shown. */
  @Input() book!: PortfolioBook;
  /** The portfolio being shown. */
  @Input() portfolio!: Portfolio;
  @Input() view!: PortfolioView;
  /** How much the holdings move together (sector and correlation), as a sentence. */
  @Input() together = '';
  /** The same as figures with their names, for the place beside the headline (the owner had it put in sight). */
  @Input() bet: Fact[] = [];
  /**
   * Today's plan for the portfolio being shown, the same steps as in the lines above the table: each stock's row
   * says which step it is under. Empty while prices are still arriving, as a plan worked out from half of them
   * would be wrong.
   */
  @Input() set plan(steps: PlanStep[]) {
    this.plans = holdingPlans(steps);
    this.planWords = steps.filter(saidInRows).map(({kind, verb, text}) => ({kind, verb, text}));
  }
  /**
   * What the plan expects in each portfolio, by its id: the verbs of its steps that ask for something. Empty while
   * prices are still arriving.
   */
  @Input() toDo: Record<string, string[]> = {};
  /**
   * Prices are still arriving. Until they are in, no stock has a price and the portfolio looks as if it were worth
   * its cash alone, so nothing that is worked out from prices is said: not the limit in dollars, not the share
   * that is cash, and not that a quote "did not load" while it may still do so.
   */
  @Input() loading = false;
  /**
   * Not one price arrived (the first load failed). The holdings are then listed from what is recorded, and the
   * sentences under the fields say nothing: what the portfolio is worth, and so what the limit and the cash come
   * to, cannot be said without prices (the cash alone would be called the whole portfolio).
   */
  @Input() unvalued = false;
  /**
   * Which columns "What you own" shows: the ones a decision rests on (what the plan says, how the stock stands,
   * what a half-year could do to it), or every column: also how it was bought, its mark, and the button that
   * removes it. The same choice as the lists' "Key columns / All columns", so the page hands it in and is told
   * when it is changed here. When a column the rows followed is no longer shown, the rows go back to the biggest
   * holding first: an order without a heading that shows it could not be read or undone.
   */
  @Input() set allColumns(all: boolean) {
    this.every = all;
    if (!all && BOUGHT_COLUMNS.has(this.sort.column)) {
      this.sort = DEFAULT_SORT;
    }
  }

  get allColumns(): boolean {
    return this.every;
  }

  @Output() allColumnsChange = new EventEmitter<boolean>();
  /**
   * The companies' names by symbol: a symbol alone says nothing to who does not know it. A name shows when its
   * symbol is pointed at or reached with the keyboard, so that the rows stay one line tall.
   */
  @Input() names: Record<string, string> = {};
  /**
   * Which stocks of the page moved together over the past year, as groups under a letter: each holding shows the
   * letter of its group, the same letter as in the lists and in "Could add".
   */
  @Input() set tied(tied: TiedGroups) {
    this.groups = tied;
    this.groupOf = groupBySymbol(tied);
  }

  groups: TiedGroups = NO_GROUPS;
  private groupOf = new Map<string, TiedGroup>();
  readonly groupHelp = GROUP_HELP;
  /** What the letters are, beside the table: its first sentence stands alone, "more" opens the rest. */
  readonly groupNote = TIED_NOTE;

  /** The link in front of the table that takes the keyboard past it, to the notes under it. */
  skipTable(event: Event): void {
    event.preventDefault();
    const after = this.host?.nativeElement.querySelector<HTMLElement>('.note.how');
    if (after) {
      after.tabIndex = -1;
      after.focus({preventScroll: true});
      after.scrollIntoView({block: 'nearest'});
    }
  }

  /** The column is there when a holding is in a group. */
  get hasGroups(): boolean {
    return this.view.rows.some(row => this.groupOf.has(row.symbol));
  }

  group(symbol: string): TiedGroup | undefined {
    return this.groupOf.get(symbol);
  }

  groupTipOf(symbol: string): string {
    return groupTip(symbol, this.groups);
  }
  @Input() savedIn: SavedIn = 'checking';
  @Input() notice?: BookNotice;

  @Output() settings = new EventEmitter<PortfolioSettings>();
  /** Open this stock's row details (to edit the position). */
  @Output() open = new EventEmitter<string>();
  @Output() remove = new EventEmitter<string>();
  @Output() undo = new EventEmitter<void>();
  @Output() selectPortfolio = new EventEmitter<string>();
  @Output() addPortfolio = new EventEmitter<string>();
  @Output() renamePortfolio = new EventEmitter<string>();
  @Output() removePortfolio = new EventEmitter<void>();
  @Output() exportBook = new EventEmitter<void>();
  /** The text of a file chosen for import. */
  @Output() importBook = new EventEmitter<string>();

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  /** Which small form is open beside the portfolio names: none, a new portfolio, or a new name for the shown one. */
  /** What is open in place of the three links: a name being typed, or the question asked before a portfolio is deleted. */
  naming: 'none' | 'new' | 'rename' | 'delete' = 'none';
  nameDraft = '';
  /** What the plan says about each stock in the table, by symbol. */
  private plans = new Map<string, HoldingPlan>();
  /**
   * The words of the "Plan" column that have no line of their own above the table (KEEP, NO OPINION), each with the
   * plan's own sentence: shown under the table, so that what a row says can be read without hovering it.
   */
  planWords: PlanWord[] = [];
  /** Which column the rows of the table follow, and which way: the biggest holding first until a heading is clicked. */
  sort: RowSort = DEFAULT_SORT;
  private every = false;
  /** The rows as last ordered, with what they were ordered from, so the table is not sorted again on every look at it. */
  private ordered?: { from: PositionRow[], sort: RowSort, plans: Map<string, HoldingPlan>, rows: PositionRow[] };

  readonly money = money;
  readonly signedMoney = signedMoney;
  readonly signedPercent = signedPercent;
  readonly shareCount = shareCount;
  /** What "bad case" and "good case" are, with the typical results beside them. */
  readonly casesNote = CASES_CARD_NOTE;
  /** The box's title, which texts elsewhere on the page point to. */
  readonly title = PLAN_BOX;
  /** The heading of the table of holdings. */
  readonly ownTitle = OWN_TABLE;
  /** The names of the two fields, which the plan points to. */
  readonly cashLabel = CASH_LABEL;
  readonly limitLabel = LIMIT_LABEL;
  /** The third field: a second limit of the user's own, the share of the portfolio to keep in cash. */
  readonly keepLabel = KEEP_OUT_LABEL;
  readonly keepTooltip = 'The share of this portfolio you want to keep in cash, whatever the plan offers: cash is the part that ' +
    `cannot fall with your stocks. The plan says when you are under it, and the split in "${COULD_ADD}" leaves that money unspent. ` +
    'Leave it empty to keep nothing back.';
  readonly cashTooltip = 'The cash in this account. The portfolio is worth your stocks at today\'s prices plus this cash. ' +
    'The sizes in the plan are shares of that worth; they do not depend on how much of it is cash.';
  /** Shown in that field while it is empty: the limit the plan starts from. */
  readonly startingLimit = String(DEFAULT_LIMIT_PERCENT);
  readonly limitTooltip = 'The most you are willing to lose on one stock in a bad half-year, as a share of this portfolio. ' +
    `Until you enter your own number the plan starts from ${DEFAULT_LIMIT_PERCENT}.`;
  /** What "Held" counts against: the plan keeps a stock for the 26 weeks the tests followed. */
  readonly heldColumnTooltip = 'How long you have held it. The tests followed each stock for 26 weeks (6 months), ' +
    'so the plan keeps it that long.';
  /** What the "Plan" column is: the plan's steps, turned around so that each stock says which one it is under. */
  /**
   * What the "Plan" column is. The words that have no line of their own in the plan above (KEEP, NO OPINION) are
   * explained under the pointer in each row; their sentences are repeated here because a heading can be reached
   * with the keyboard and a cell cannot.
   */
  get planColumnTooltip(): string {
    const words = this.planWords.map(word => `${word.verb}: ${word.text}`).join('\n');
    return 'What today\'s plan says about this stock. Point at a word for its sentence. The reasons are in ' +
      '"How the plan was tested", at the bottom of the page.' + (words ? `\n\n${words}` : '');
  }

  get hasPositions(): boolean {
    return this.view.rows.length > 0;
  }

  /**
   * The room held for the table while the first prices arrive: its heading, a row a holding, and the lines over and
   * under it. Close enough to what comes that the boxes under this one do not jump.
   */
  get waitingHeight(): number {
    return 225 + this.view.rows.length * 37;
  }

  /** The holdings in the order the table shows them: by the column chosen, the biggest holding first to start with. */
  get rows(): PositionRow[] {
    const from = this.view.rows, {sort, plans} = this;
    if (this.ordered?.from !== from || this.ordered.sort !== sort || this.ordered.plans !== plans) {
      this.ordered = {from, sort, plans, rows: sortedRows(from, sort, plans)};
    }
    // By group when "Group" was clicked: the holdings that move together side by side.
    return this.groupSort ? byGroup(this.ordered.rows, row => row.symbol, this.groups, this.groupSort) : this.ordered.rows;
  }

  /** A click on a column heading: the rows follow that column, and a second click turns them around. */
  sortBy(column: SortColumn): void {
    this.groupSort = undefined;
    this.sort = nextSort(this.sort, column);
  }

  /** The rows follow "Group" (A first, or the other way round); nothing while they follow another column. */
  groupSort?: 'asc' | 'desc';

  /** A click on "Group": the rows are put together by group, and a second click turns them around. */
  sortByGroup(): void {
    this.groupSort = this.groupSort === 'asc' ? 'desc' : 'asc';
  }

  get groupSortedAs(): 'ascending' | 'descending' | null {
    return !this.groupSort ? null : this.groupSort === 'asc' ? 'ascending' : 'descending';
  }

  /** A click on "Key columns" or "All columns": shown at once, and the page is told, so the lists follow. */
  showColumns(all: boolean): void {
    if (all !== this.allColumns) {
      this.allColumns = all;
      this.allColumnsChange.emit(all);
    }
  }

  /** Which of the app's three marks a row's stock carries, as the class the shared mark is drawn with. */
  markClass(row: PositionRow): string {
    return row.verdict === 'DIP BUY' ? 'dip' : row.verdict === 'WATCH' ? 'watch' : 'pass';
  }

  /** The company's name for a row, or nothing when it is not known or is only the symbol again. */
  nameOf(row: PositionRow): string {
    const name = this.names[row.symbol];
    return name && name !== row.symbol ? name : '';
  }

  /** The row whose stock has the keyboard (not a click of the pointer). */
  private keyboardOn?: string;

  onStockFocus(row: PositionRow, event: FocusEvent): void {
    const button = event.target as HTMLElement | null;
    this.keyboardOn = button?.matches?.(':focus-visible') ? row.symbol : undefined;
  }

  onStockBlur(): void {
    this.keyboardOn = undefined;
  }

  /**
   * What shows on a row's stock. Under the pointer: the company's name, as the owner of the page asked. With the
   * keyboard on it: the name, then what the cells of the row say to a pointer, each under the name of its column.
   * Those explanations were out of reach of the keyboard, and the stock is the row's one tab stop.
   */
  stockTip(row: PositionRow): string {
    const name = this.nameOf(row);
    if (this.keyboardOn !== row.symbol) {
      return name;
    }
    const cases = row.risk && row.cases
      ? [`Bad case: ${this.badCaseTooltip(row)}`, `Typical: ${this.typicalCaseTooltip(row)}`, `Good case: ${this.goodCaseTooltip(row)}`] : [];
    return [name, this.planTooltip(row), ...cases].filter(Boolean).join('\n');
  }

  /** What a column heading tells a screen reader: which way its column is sorted, or nothing while the rows follow another. */
  sortedAs(column: SortColumn): 'ascending' | 'descending' | null {
    return this.groupSort || this.sort.column !== column ? null : this.sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  get activeName(): string {
    return this.book.portfolios.find(it => it.id === this.book.active)?.name ?? '';
  }

  /** Asked once before a portfolio is deleted: its name, and what goes with it. */
  get deleteQuestion(): string {
    const stocks = Object.keys(this.portfolio.positions).length;
    return stocks === 0 ? `Delete "${this.activeName}"? It holds no stocks.`
      : `Delete "${this.activeName}" with its ${stocks} stock${stocks === 1 ? '' : 's'}?`;
  }

  /** "Delete it": the answer to that question. The page removes the portfolio and still offers to take it back. */
  confirmDelete(): void {
    this.naming = 'none';
    this.removePortfolio.emit();
  }

  /** "3 stocks · worth $12,450 · −$540 (−4.2%) since bought" */
  get headline(): string {
    const s = this.summary;
    return s.worth === undefined ? s.count : `${s.count} · worth ${s.worth} · ${s.result} since bought`;
  }

  /**
   * The headline's parts, for the page to set its two figures stronger than the words around them: how many
   * stocks, what they are worth, the result so far, and whether that result is a gain or a loss. Without a price
   * there is only the count.
   */
  get summary(): { count: string, worth?: string, result?: string, tone: string } {
    const s = this.view.summary;
    const count = `${s.count} stock${s.count === 1 ? '' : 's'}`;
    return s.value === undefined ? {count, tone: ''} : {
      count,
      worth: money(s.value),
      result: `${signedMoney(s.gain)} (${signedPercent(s.gainPercent)})`,
      tone: this.gainClass(s.gainPercent),
    };
  }

  /**
   * "The same money in the market on the same days: +$310 (+2.4%). Your stocks are $95 ahead of it."
   * Right under the headline it is compared with; then, until the money has been in for 6 months, that it is too
   * early to mean much. Nothing while no stock can be compared (no purchase date, no price, or the market's
   * figure not loaded yet).
   */
  get marketLines(): string[] {
    return againstMarketLines(againstMarket(this.view.rows.map(row => row.view)));
  }

  /**
   * The same comparison as figures with their names, beside the headline. While no stock can be compared and some
   * have no purchase date, one figure says what the comparison needs.
   */
  get ownFacts(): Fact[] {
    const market = againstMarketFacts(againstMarket(this.view.rows.map(row => row.view)));
    const undated = this.undatedText;
    const compared = market.length > 0 || !undated ? market : [{label: 'Against the market', value: 'needs a purchase date', tip: undated}];
    // Then how far the stocks are one bet, as the page hands it in.
    return this.bet.length === 0 ? compared : [...compared, ...this.bet];
  }

  /**
   * The two cases of the marked stocks at once, for a row at the foot of the table: the sums of its two "case"
   * columns, with the bad one as a share of the portfolio. From two marked stocks; one has both figures in its row.
   */
  get totals(): { label: string, bad: string, share: string, typical: string, good: string, tip: string } | undefined {
    const s = this.view.summary;
    if (s.togetherLoss === undefined || s.togetherCount < 2) {
      return undefined;
    }
    // The typical results of the same stocks, added up like the two cases beside them.
    const typical = this.view.rows.reduce((sum, row) => sum + (row.risk && row.cases ? row.risk.typical : 0), 0);
    return {
      label: `${s.togetherCount === 2 ? 'Both' : `All ${s.togetherCount}`} marked DIP BUY at once`,
      bad: signedMoney(-s.togetherLoss),
      share: s.togetherPercent === undefined ? '' : `${s.togetherPercent.toFixed(1)}% of this portfolio`,
      typical: signedWholeMoney(typical),
      good: s.togetherGain === undefined ? '' : signedMoney(s.togetherGain),
      tip: this.togetherLines.join(' '),
    };
  }

  /** How many columns stand before the two "case" columns, and after them when every column is shown. */
  get totalsSpan(): number {
    return 5 + (this.hasGroups ? 1 : 0) + (this.hasDates ? 2 : 0);
  }

  get totalsRest(): number {
    return 4 + (this.hasDates ? 1 : 0);
  }

  /** Under the table, in sight: when the three cases were tested, and that it can be worse. */
  readonly casesLimit = CASES_LIMIT;

  /** A stock of the table has tested cases (it is marked DIP BUY): the line about the cases has something to be about. */
  get hasCases(): boolean {
    return this.view.rows.some(row => !!row.risk && !!row.cases);
  }

  /** What the heading "Typical" is, where the pointer rests or the Tab key lands. */
  readonly typicalHelp = 'What the typical half-year would have added: in tests, the middle stock like it ended there after 6 months. ' +
    'Half did better, half worse.';

  /**
   * What the entries in the fields come to, as figures with their names under the fields: what the portfolio is
   * worth with its cash and how much of it the cash is, the limit in dollars, the share kept outside stocks in
   * dollars with whether the cash covers it, and both sides of the level picked for taking a profit in its test.
   */
  get settingFacts(): Fact[] {
    const facts: Fact[] = [];
    const cash = this.cashText, total = this.view.portfolioValue;
    if (cash && total !== undefined) {
      facts.push({label: 'Worth with cash', value: money(total), tip: cash},
        {label: 'In cash', value: `${((this.portfolio.cash ?? 0) / total * 100).toFixed(1)}%`, tip: cash});
    }
    const limit = this.limitText;
    if (limit) {
      // Under the name of its field: "Limit on one stock" beside sizes that are larger read as a cap on what goes in.
      facts.push({label: LIMIT_LABEL, value: money(this.view.budget) + (this.view.limitIsDefault ? ' (starting value)' : ''), tip: limit});
    }
    const reserve = this.view.reserve, kept = this.reserveText;
    if (reserve && kept) {
      // A holding without a price: the amount to keep is the least it can be, and "covers it" cannot be said.
      const least = reserve.atLeast ? 'at least ' : '';
      const stands = reserve.short >= NO_GAP_UNDER ? `: cash is ${least}${money(reserve.short)} short` : reserve.atLeast ? '' : ': cash covers it';
      facts.push({label: 'Kept outside stocks', value: `${least}${money(reserve.dollars)}${stands}`, tip: kept});
    }
    const level = this.profitLevel, sides = level === undefined ? undefined : takeProfitFigures(level);
    if (level !== undefined && sides) {
      // Each says by itself what it is: where one runs onto the next line, it is still read alone.
      facts.push({label: `In the test at +${level}%, ended with a loss`, value: sides.loss, tip: this.profitText},
        {label: `In the test at +${level}%, made on average`, value: sides.mean, tip: this.profitText});
    }
    return facts;
  }

  trackByLabel(_: number, fact: Fact): string {
    return fact.label;
  }

  /**
   * The box has explanations to keep behind its one control: what the entries come to, or, once it holds
   * something and the prices are in, what is said about the table.
   */
  get hasAbout(): boolean {
    return this.savedIn !== 'checking' && (!!this.cashText || !!this.limitText || !!this.reserveText || !!this.profitText
      || (this.hasPositions && !this.loading));
  }

  /**
   * Whether a line of the comparison with the market is the one that says it is too early to mean much. The first
   * figure a reader meets here is the result so far, often a loss in red; this sentence is what puts it in
   * proportion, so the page sets it in the full ink and not in the grey of a note.
   */
  saysTooEarly(line: string): boolean {
    return line.startsWith('Too early');
  }

  /**
   * How a purchase or a sale is told to the page: said under the table once a portfolio holds something. It names
   * both places a stock is acted on from, since a stock that is not owned yet has no row in this table.
   */
  readonly howToChange = 'Bought or sold? Click the stock\'s symbol, here or in "Could add", to record it.';

  /** What the user's limit comes to in dollars, once it is known. */
  get limitText(): string {
    if (this.loading || this.unvalued || this.view.budget === undefined) {
      return '';
    }
    // Both say what the number is a limit of (a loss, not what can be put in: the sizes beside it are larger). The
    // sentence stands beside the two fields, so it names the field to fill in rather than saying where it is.
    return this.view.limitIsDefault
      ? `The plan assumes you accept to lose ${money(this.view.budget)} on one stock: the app's starting value, ` +
        `${this.view.limitPercent}% of this portfolio. Enter your own under "${LIMIT_LABEL}".`
      // Under the field "Most I can lose on one stock", which says what the number is: only what it comes to in dollars.
      : `${this.view.limitPercent}% of this portfolio is ${money(this.view.budget)}. No size in the plan goes above what fits it.`;
  }

  /**
   * What the share to keep outside stocks comes to. It stands under the field that shows the share, so it says
   * only what the field does not: that share in dollars, and whether the cash covers it.
   */
  /**
   * The fourth setting, a level of the user's own for taking a profit: there because taking a profit passed its test
   * at these levels (pre-registered #9), and only while it offers one. A choice among them, not a number to type.
   */
  readonly profitLabel = TAKE_PROFIT_LABEL;
  readonly profitLevels: readonly number[] = takeProfitOffer().map(it => it.level);
  readonly profitTooltip = 'A level of your own for taking a profit on a stock you bought as a DIP BUY, in its first 6 months. ' +
    'Once such a stock is up that much on what you paid, the plan says so, and for the others it gives the price of a sell order ' +
    'at that level. In a test, selling there made a loss rarer and gave less on average than keeping, so the plan still says KEEP. ' +
    'Leave it at "no level" to have neither.';

  /** The level in force: the portfolio's, when it is one that is on offer. A level the tests do not offer counts as none. */
  get profitLevel(): number | undefined {
    const level = this.portfolio.takeProfitPercent;
    return level !== undefined && this.profitLevels.includes(level) ? level : undefined;
  }

  /**
   * Under the fields, while a level is picked: what that level did in the test, both sides, and which stocks it
   * counts for. A portfolio typed in from a broker's list has no purchase days: the level then names nothing, and
   * this is where the page says why.
   */
  get profitText(): string {
    const level = this.profitLevel;
    return level === undefined ? ''
      : `${takeProfitBrief(level)} It counts for the stocks you bought as a DIP BUY, in their first 6 months: ` +
        'a stock needs its purchase day for that.';
  }

  get reserveText(): string {
    const reserve = this.view.reserve;
    if (this.loading || this.unvalued || this.view.portfolioValue === undefined) {
      return '';
    }
    if (!reserve) {
      // An empty field says nothing about itself: what it is for, until a share is entered.
      // ("What you keep outside stocks" is the share that is set: with none set, the cash is not called that.)
      return `No share is set to keep outside stocks. Enter one under "${KEEP_OUT_LABEL}" to have the plan and the split in ` +
        `"${COULD_ADD}" leave it in cash.`;
    }
    const share = `${shareText(reserve.percent)}% of this portfolio is`;
    if (reserve.atLeast) {
      // A holding without a price adds nothing to what the portfolio is worth, so the amount to keep is the least
      // it can be: a gap is at least that gap, and "covers it" cannot be said.
      return `${share} at least ${money(reserve.dollars)}, because a stock has no price: ` +
        (reserve.short >= NO_GAP_UNDER ? `your cash is at least ${money(reserve.short)} short of it.`
          : 'whether your cash covers it cannot be said until the price loads.');
    }
    const stands = reserve.short >= NO_GAP_UNDER ? `is ${money(reserve.short)} short of it` : 'covers it';
    return `${share} ${money(reserve.dollars)}: your cash ${stands}.`;
  }

  /** "This portfolio is worth $40,000: these stocks plus $120 in cash (0.3%)." Only when cash is entered. */
  get cashText(): string {
    const cash = this.portfolio.cash, total = this.view.portfolioValue;
    if (this.loading || this.unvalued || !cash || total === undefined) {
      return '';
    }
    // The cash is in the field above and what the stocks are worth is in the table's headline: this adds the two up.
    return `With its cash this portfolio is worth ${money(total)}; the cash is ${(cash / total * 100).toFixed(1)}% of it.`;
  }

  /** Why some rows show dashes for the time held and the index comparison. */
  get undatedText(): string {
    const count = this.view.rows.filter(row => !row.view.position.day).length;
    if (count === 0) {
      return '';
    }
    const one = count === 1 && this.view.rows.length > 1;
    const which = count === this.view.rows.length ? 'These stocks have' : one ? 'One stock has' : `${count} stocks have`;
    return `${which} no purchase date, so the app cannot show how long you have held ${one ? 'it' : 'them'} or compare ` +
      `${one ? 'it' : 'them'} with the market. ${one ? 'Click it to add the date.' : 'Click a stock to add its date.'}`;
  }

  /**
   * What the tested bad cases add up to if they happen together, which is how dips in one theme tend to go, and the
   * good cases the same way. Both count from today's prices, so the total since the stocks were bought is said
   * beside each.
   */
  get togetherText(): string {
    return this.togetherLines.join(' ');
  }

  /** The same as two lines, the bad outcome and the good one, so that neither is buried in the other. */
  get togetherLines(): string[] {
    const s = this.view.summary;
    if (s.togetherLoss === undefined) {
      return [];
    }
    const which = s.togetherCount === 1 ? 'your stock marked DIP BUY'
      : `${s.togetherCount === 2 ? 'both' : `all ${s.togetherCount}`} of your stocks marked DIP BUY at once`;
    const share = s.togetherPercent === undefined ? '' : `, ${s.togetherPercent.toFixed(1)}% of this portfolio`;
    // With no gain or loss so far (under half a cent, which shows as $0) each case is the whole of it already.
    const soFar = s.gain !== undefined && Math.abs(s.gain) >= 0.005 ? s.gain : undefined;
    const sinceBought = soFar === undefined || s.sinceBoughtIfBad === undefined ? ''
      : ` ${soFar < 0 ? 'Added to your loss so far' : 'Taken from your gain so far'}, that is ` +
        `${signedMoney(s.sinceBoughtIfBad)} (${signedPercent(s.sinceBoughtIfBadPercent)}) since bought.`;
    const goodSinceBought = soFar === undefined || s.sinceBoughtIfGood === undefined ? ''
      : `, which would be ${signedMoney(s.sinceBoughtIfGood)} (${signedPercent(s.sinceBoughtIfGoodPercent)}) since bought`;
    const good = s.togetherGain === undefined ? [] : [`If the good case did: ${signedMoney(s.togetherGain)}${goodSinceBought}.`];
    return [`If the bad case hit ${which}: ${signedMoney(-s.togetherLoss)}${share}.${sinceBought}`, ...good];
  }

  /**
   * Whether any stock has a purchase date. Three columns need one (how long it has been held, the market since,
   * the date itself); while no stock has one they would be dashes from top to bottom, so they are left out and the
   * note under the table says how to add a date.
   */
  get hasDates(): boolean {
    return this.view.rows.some(row => !!row.view.position.day);
  }

  get unpricedText(): string {
    const symbols = this.loading ? [] : this.view.summary.unpriced;
    // On a day no price arrives at all the plan box says so already: one short line here, not every symbol by name.
    if (this.unvalued && symbols.length > 1) {
      return `No price for any of your ${symbols.length} stocks, so nothing here is valued.`;
    }
    return symbols.length ? `No price for ${symbols.join(', ')}: the quote did not load, so it is left out of the totals.` : '';
  }

  get savedText(): string {
    switch (this.savedIn) {
      case 'database':
        return 'Saved in the database on this computer.';
      case 'memory':
        return 'Not saved: this is the development server. What you enter here is gone when it stops.';
      case 'browser':
        return 'Saved in this browser only: the database is not answering. Start the app with "docker compose up -d".';
      default:
        return 'Checking where your portfolios are saved.';
    }
  }

  /** The purchase day, or a dash for a position recorded without one. */
  day(row: PositionRow): string {
    const day = row.view.position.day;
    return day ? new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : '—';
  }

  /**
   * How long the stock has been held, in a few words: the week it is in of the 26 the tests followed, or the
   * number of weeks once it is past them. A dash without a purchase date.
   */
  held(row: PositionRow): string {
    const v = row.view;
    if (v.daysHeld === undefined) {
      return '—';
    }
    return v.beyondTested ? `${Math.floor(v.daysHeld / 7)} weeks` : `week ${v.week} of 26`;
  }

  /**
   * What is unusual about that time, said apart from it: on a line of its own under the weeks, so that one long
   * sentence does not make the column, and with it the whole table, wider than a laptop screen.
   */
  heldNote(row: PositionRow): string {
    if (row.view.daysHeld === undefined || !row.view.beyondTested) {
      return '';
    }
    // The plan keeps a stock that is marked DIP BUY today whenever it was bought (holding it is the same bet as
    // buying it today), and counts its 6 months from today. Saying only that it is older than the tests would
    // contradict the word KEEP beside it.
    return row.verdict === 'DIP BUY' ? 'DIP BUY today: counts from today' : 'longer than the tests followed';
  }

  /** What that note means, in a sentence, where the pointer rests on the cell. Nothing for a cell without a note. */
  heldTip(row: PositionRow): string {
    if (!this.heldNote(row)) {
      return '';
    }
    const longer = 'Held for longer than the 6 months the tests followed.';
    return row.verdict === 'DIP BUY'
      ? `${longer} It is marked DIP BUY today, and holding it is the same bet as buying it today: the plan keeps it and counts its 6 months from today.`
      // In the words of the plan's own line and reason for such a stock (YOUR CALL).
      : `${longer} After that the tests disagree, so the plan has no rule for it.`;
  }

  /**
   * Held for longer than the tests followed, with nothing that starts the count again: worth a second look, so
   * the cell is set in the colour of a warning. A stock marked DIP BUY today is not: the plan covers it as it stands.
   */
  pastTheTests(row: PositionRow): boolean {
    return !!row.view.beyondTested && row.verdict !== 'DIP BUY';
  }

  /** What the bad case would cost, as one amount. Its share of the portfolio is in the explanation, not in the cell. */
  badCase(row: PositionRow): string {
    // Whole dollars: a case is worked out from tests, not counted, and the column keeps one precision.
    return row.risk && row.cases ? signedWholeMoney(-row.risk.loss) : '—';
  }

  badCaseTooltip(row: PositionRow): string {
    if (!row.risk || !row.cases) {
      return NOT_MEASURED;
    }
    const share = row.risk.ofPortfolioPercent === undefined ? '' : ` (${row.risk.ofPortfolioPercent.toFixed(1)}% of this portfolio)`;
    const limit = row.risk.overBudget === undefined ? ''
      : `, which is ${row.risk.overBudget ? 'over' : 'within'} your limit of ${money(this.view.budget)}`;
    return `In tests, 1 in 10 stocks like this lost ${row.cases.lossPercent}% or more after 6 months. ` +
      `Here that would be the amount shown${share}${limit}.`;
  }

  goodCase(row: PositionRow): string {
    return row.risk && row.cases ? signedWholeMoney(row.risk.gain) : '—';
  }

  goodCaseTooltip(row: PositionRow): string {
    if (!row.risk || !row.cases) {
      return NOT_MEASURED;
    }
    return `In tests, 1 in 10 stocks like this gained ${row.cases.gainPercent}% or more after 6 months. Here that would be the amount shown.`;
  }

  /** Between the two cases: where the middle stock of its kind ended, at what this holding is worth. */
  typicalCase(row: PositionRow): string {
    return row.risk && row.cases ? signedWholeMoney(row.risk.typical) : '—';
  }

  typicalCaseTooltip(row: PositionRow): string {
    if (!row.risk || !row.cases) {
      return NOT_MEASURED;
    }
    return `In tests, the typical stock like this ended at ${signedPercent(row.cases.typicalPercent)} after 6 months: half did better, half worse. ` +
      'Here that would be the amount shown.';
  }

  /** What the plan says about this stock; undefined until the plan is worked out. */
  planOf(row: PositionRow): HoldingPlan | undefined {
    return this.plans.get(row.symbol);
  }

  /**
   * "your level: up 18%", beside the plan's word for a stock that is up to the level the user set for taking a
   * profit. The plan's own word stays (KEEP, or SELL SOME for a stock that is over the limit): the level reports.
   */
  levelNote(row: PositionRow): string {
    return this.planOf(row)?.level?.label ?? '';
  }

  /** The amount that goes with the plan's verb: what to keep, or what can be added. Nothing for most stocks. */
  planNote(row: PositionRow): string {
    const plan = this.planOf(row);
    return plan?.amount ?? plan?.add?.label ?? '';
  }

  /**
   * Whether the note beside a stock's verb is an amount that could be bought ("add 4.8% ($2,000)"). Only that one
   * is in the green of BUY. An amount that belongs to another verb ("keep $3,000" beside SELL SOME, "up 19%" beside
   * YOUR LEVEL) is in plain ink: in green, "keep $3,000" read as good news right after an amber SELL SOME.
   */
  noteIsPurchase(row: PositionRow): boolean {
    const plan = this.planOf(row);
    return !!plan && !plan.amount && !!plan.add;
  }

  /** Whether the plan asks for something on this stock: its verb then wears the filled mark it has in the plan's lines. */
  planAsks(row: PositionRow): boolean {
    const plan = this.planOf(row);
    return !!plan && asks(plan);
  }

  /** The plan's own sentence for this stock's step, under its verb; then the one about buying when more can be added. */
  planTooltip(row: PositionRow): string {
    const plan = this.planOf(row);
    if (!plan) {
      return 'The plan is worked out once every price has loaded.';
    }
    // The one place a row's word is explained (the owner's choice: the same sentences used to stand under the
    // table as well, and read as a repeat). Who uses the keyboard finds them in the heading's explanation.
    return `${plan.verb}: ${plan.text}` + (plan.level ? `\n${plan.level.verb}: ${plan.level.text}` : '') +
      (plan.add ? `\n${plan.add.verb}: ${plan.add.text}` : '');
  }

  /**
   * Said while the plan covers one or two of the stocks: how many the tests found worth holding together, and why.
   * Nothing once it covers that many, when it covers none (the plan then has no opinion on what is owned), or
   * before the plan is worked out.
   */
  get spreadText(): string {
    const covered = [...this.plans.values()].filter(plan => plan.kind === 'hold' || plan.kind === 'trim').length;
    return covered >= 1 && covered < SEVERAL_COUNT ? severalCardNote(covered) : '';
  }

  /**
   * "to do: SELL SOME, BUY": what a portfolio's button says after its name when its plan asks for something. It
   * names what is expected, in the words of the plan's own lines, so that it can be read without opening the
   * portfolio; "to do" keeps it from reading as what the button itself does.
   */
  toDoText(portfolioId: string): string {
    const verbs = this.toDo[portfolioId] ?? [];
    return verbs.length > 0 ? `to do: ${verbs.join(', ')}` : '';
  }

  weight(row: PositionRow): string {
    return row.view.weightPercent === undefined ? '—' : `${row.view.weightPercent.toFixed(1)}%`;
  }

  gainClass(value?: number): string {
    return value === undefined || Math.abs(value) < 0.05 ? '' : value > 0 ? 'gain' : 'loss';
  }

  trackBySymbol(_: number, row: PositionRow): string {
    return row.symbol;
  }

  trackById(_: number, portfolio: NamedPortfolio): string {
    return portfolio.id;
  }

  /**
   * What was wrong with the last entry in one of the two fields, said under them. It is about the portfolio it was
   * typed for, so it is gone when another portfolio is shown, and when the next entry is taken.
   */
  get problem(): string {
    return this.refused?.portfolio === this.portfolio ? this.refused.text : '';
  }

  /**
   * Saves the cash when its field is committed. An emptied field means no cash. An amount below zero is not saved:
   * what was there stays, is put back into the field, and a line under the fields says why.
   */
  setCash(field: HTMLInputElement): void {
    if (unreadable(field)) {
      this.refuse(field, this.portfolio.cash, 'That is not a number, so the cash stays as it was.');
      return;
    }
    const cash = notNegative(field.value);
    if (field.value.trim() !== '' && cash === undefined) {
      this.refuse(field, this.portfolio.cash, 'Cash cannot be less than zero, so it stays as it was.');
      return;
    }
    this.refused = undefined;
    this.emitSettings({cash});
  }

  /**
   * Saves the limit the same way. An emptied field means the limit the plan starts from. The limit is a share of
   * the portfolio, so zero, less, or more than 100 is not saved.
   */
  setBudget(field: HTMLInputElement): void {
    if (unreadable(field)) {
      this.refuse(field, this.portfolio.lossBudgetPercent, 'That is not a number, so the limit stays as it was.');
      return;
    }
    const percent = positive(field.value);
    if (field.value.trim() !== '' && (percent === undefined || percent > 100)) {
      this.refuse(field, this.portfolio.lossBudgetPercent, 'The limit is a share of this portfolio: above 0, at most 100. It stays as it was.');
      return;
    }
    this.refused = undefined;
    this.emitSettings({lossBudgetPercent: percent});
  }

  /**
   * Saves the share to keep outside stocks the same way. An emptied field, or a zero, means none. It is a part of
   * the portfolio, so less than zero, or all of it and more, is not saved.
   */
  setKeep(field: HTMLInputElement): void {
    if (unreadable(field)) {
      this.refuse(field, this.portfolio.reservePercent, 'That is not a number, so the share to keep outside stocks stays as it was.');
      return;
    }
    const percent = notNegative(field.value);
    if (field.value.trim() !== '' && (percent === undefined || percent >= 100)) {
      this.refuse(field, this.portfolio.reservePercent,
        'The share to keep outside stocks is a part of this portfolio: from 0 to under 100. It stays as it was.');
      return;
    }
    this.refused = undefined;
    this.emitSettings({reservePercent: percent || undefined});
  }

  /** Saves the level for taking a profit when one is chosen; "no level" means none. */
  setProfit(field: HTMLSelectElement): void {
    const level = Number(field.value);
    this.refused = undefined;
    this.emitSettings({takeProfitPercent: field.value !== '' && this.profitLevels.includes(level) ? level : undefined});
  }

  /**
   * Hands over all the settings with one of them changed: one that is left out would mean "none". The level for
   * taking a profit is named only when there is one, so that a portfolio without one is handed over as before.
   */
  private emitSettings(change: PortfolioSettings): void {
    // A level in the file that is not on offer is not in force and cannot be shown: it is not carried on, or it
    // would come to life unpicked if that level were ever offered.
    const {takeProfitPercent, ...others} = {
      cash: this.portfolio.cash, lossBudgetPercent: this.portfolio.lossBudgetPercent, reservePercent: this.portfolio.reservePercent,
      takeProfitPercent: this.profitLevel, ...change,
    };
    this.settings.emit(takeProfitPercent === undefined ? others : {...others, takeProfitPercent});
  }

  private refused?: { portfolio: Portfolio, text: string };

  private refuse(field: HTMLInputElement, kept: number | undefined, text: string): void {
    field.value = kept === undefined ? '' : String(kept);
    this.refused = {portfolio: this.portfolio, text};
  }

  /**
   * A name being typed, or the question before a portfolio is deleted, was closed without a change (Cancel, "Keep
   * it", Esc): the three links are back, and the keyboard goes to the one that had opened it. It used to be left
   * on nothing.
   */
  closeNaming(): void {
    const opener = this.naming;
    this.naming = 'none';
    if (opener !== 'none') {
      setTimeout(() => this.host?.nativeElement.querySelector<HTMLElement>(`.manage [data-opens="${opener}"]`)?.focus());
    }
  }

  /** Not there when a test makes the box by hand; the keyboard is then left where it is. */
  constructor(@Optional() private readonly host?: ElementRef<HTMLElement>) {
  }

  /**
   * The cash as the field shows it: an amount with cents has both of them ("40.50"), as the sentence beside it
   * says "$40.50". The field used to show "40.5".
   */
  get cashValue(): string {
    const cash = this.portfolio.cash;
    return cash === undefined ? '' : Number.isInteger(cash) ? String(cash) : cash.toFixed(2);
  }

  startNaming(kind: 'new' | 'rename'): void {
    this.naming = kind;
    this.nameDraft = kind === 'rename' ? this.activeName : '';
    setTimeout(() => this.nameInput?.nativeElement.focus());   // the field appears on the next render
  }

  submitName(): void {
    const name = this.nameDraft.trim();
    if (!name) {
      return;
    }
    (this.naming === 'new' ? this.addPortfolio : this.renamePortfolio).emit(name);
    this.naming = 'none';
  }

  /** Reads the chosen file and hands its text on; the page checks it before replacing anything. */
  async readImport(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    input.value = '';   // so choosing the same file again is noticed
    this.importBook.emit(text);
  }
}

const NOT_MEASURED = 'Only stocks marked DIP BUY were measured in the tests; this one is not marked now.';
/** The columns about how a stock was bought, shown only with "All columns". */
const BOUGHT_COLUMNS = new Set<SortColumn>(['shares', 'paid', 'now', 'bought']);
/** How many stocks the tests found worth holding together (pre-registered #8). */
const SEVERAL_COUNT = EVIDENCE.several.count;

function positive(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Cash can be zero, but not negative. */

/**
 * Whether a number field holds something it cannot read ("2-0", "e", "."). Such a field hands over an empty text,
 * which would otherwise count as emptied, and emptied means "none": the entry is refused instead.
 */
function unreadable(field: HTMLInputElement): boolean {
  return field.validity?.badInput === true;
}

function notNegative(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
