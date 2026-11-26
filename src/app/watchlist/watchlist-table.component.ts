import {NO_PRICES, NO_PRICES_SHORT, PORTFOLIOS_UNREAD} from "./plan-trouble";
import {
  Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, TemplateRef, ViewChild,
  ViewChildren
} from "@angular/core";
import {MatTableDataSource} from "@angular/material/table";
import {SmartTableComponent, TableDef} from "../dashboard/dashboard-components/smart-table/smart-table.component";
import {PriceCellComponent} from "./cells/price/price-cell.component";
import {PercentChangeCellComponent} from "./cells/percent-change/percent-change-cell.component";
import {PriceRangeCellComponent} from "./cells/price-range/price-range-cell.component";
import {ChartSeries, MarketSnapshot, MicrosoftMoneyService, Stock} from "../api/microsoft-money.service";
import {ProjectionRangeCellComponent} from "./cells/projection-range/projection-range-cell.component";
import {AnalystRecommendationCellComponent} from "./cells/analyst-recommendation/analyst-recommendation-cell.component";
import {OwnershipCellComponent} from "./cells/ownership/ownership-cell.component";
import {SectorDistributionWidgetComponent} from "./sector-distribution-widget/sector-distribution-widget.component";
import {NgForOf, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault} from "@angular/common";
import {MatButtonModule} from "@angular/material/button";
import {MatButtonToggleModule} from "@angular/material/button-toggle";
import {MatTooltipModule} from "@angular/material/tooltip";
import {MatSnackBar, MatSnackBarModule} from "@angular/material/snack-bar";
import {FormsModule} from "@angular/forms";
import {SymbolCellComponent} from "./cells/symbol/symbol-cell.component";
import {NoVerdict, SignalCellComponent} from "./cells/signal/signal-cell.component";
import {GrowthCellComponent} from "./cells/growth/growth-cell.component";
import {VolatilityCellComponent} from "./cells/volatility/volatility-cell.component";
import {SignalDetailComponent} from "./signal-detail/signal-detail.component";
import {BookNotice, PortfolioSettings, PositionsCardComponent, SavedIn} from "./positions-card/positions-card.component";
import {PositionPanelComponent, Trade} from "./position-panel/position-panel.component";
import {money, shareCount} from "./format";
import {Portfolio, Position, withoutPosition, withPosition} from "./positions";
import {
  activeOf, addPortfolio, loadBook, parseBook, PortfolioBook, reconcile, removePortfolio, renamePortfolio, saveBook,
  selectPortfolio, stamped, symbolsHeld, withActive
} from "./portfolio-book";
import {PortfolioStoreService} from "./portfolio-store.service";
import {StoreService} from "./store.service";
import {ListEditorComponent} from "./list-editor/list-editor.component";
import {PlanCardComponent} from "./plan-card/plan-card.component";
import {PlanEvidenceComponent} from "./plan-evidence/plan-evidence.component";
import {PlanStep, toDoVerbs} from "./plan";
import {planFor} from "./portfolio-plan";
import {
  addList, defaultBook, loadWatchlists, moveList, parseWatchlists, reconcileLists, removeList, renameList, saveWatchlists,
  stampedLists, symbolProblem, WatchlistBook, WatchlistDef, withoutSymbol, withSymbol
} from "./watchlists";
import {portfolioView, PortfolioView, PositionRow} from "./portfolio-view";
import {casesFor, TestedCases} from "./sizing";
import {
  daysUntilEarnings,
  debtToEquity,
  DIP_PERCENT,
  forwardPE,
  GROWTH_EPS_PERCENT,
  GROWTH_REVENUE_PERCENT,
  growthChipText,
  growthOutlook,
  industryDebtToEquity,
  lastEarnings,
  MarketFear,
  marketFear,
  MIN_REPORTED_QUARTERS,
  nextEarningsDate,
  signalFor,
  signalSortValue,
  whyNoVerdict
} from "./signal";
import {factsOf, StockFacts} from "./stock-facts";
import {alsoFits, Findable, findMatches, notFound} from "./find-stock";
import {costDistributionFor, trendFor, volatilityFor} from "./market-math";
import {CostDistributionCellComponent} from "./cells/cost-distribution/cost-distribution-cell.component";
import {TrendCellComponent} from "./cells/trend/trend-cell.component";
import {EarningsDateCellComponent} from "./cells/earnings-date/earnings-date-cell.component";
import {DebtEquityCellComponent} from "./cells/debt-equity/debt-equity-cell.component";
import {addDays, biggestDropSinceHigh, DROP_WORDS, DropNews, isoDay, newsQuery, parseHeadlines} from "./drop-news";
import {movingTogetherText, oneBetText} from "./concentration";
import {GROUP_HELP, groupBySymbol, groupsAmong, groupTip, NO_GROUPS, TiedGroup, TiedGroups, tiedGroups} from "./tied-groups";
import {heldIn, heldText} from "./held-in";
import {CARD_NOTE, VOLATILITY_COLUMN_NOTE} from "./evidence";
import {
  dayChange, DayLog, dipBuySince, loadLog, mergeLogs, missingIn, parseLog, record, saveLog, snapshotOf, SnapshotLog, trackRecord,
  trimChange
} from "./snapshot-log";
import {copyLine, evidenceLine, joinNotes, recorderLine} from "./status-lines";
import {DipCandidate, DipCandidatesComponent} from "./dip-candidates/dip-candidates.component";
import {latestQuoteTime, PriceStatusService} from "./price-status.service";
import {CouldAddComponent} from "./could-add/could-add.component";
import {WhereItFitsComponent} from "./where-it-fits/where-it-fits.component";
import {FocusWhenShownDirective} from "./focus-when-shown.directive";
import {FillsColumnDirective} from "./fills-column.directive";
import {listColumns} from "./list-columns";
import {Addition, Fitting, Recommendation, RowReading, SizingInput, whereItFits} from "./recommendations";
import {PageView} from "./page-view";
import {finalize, map, of, Subscription, switchMap} from "rxjs";

export type ViewMode = 'decision' | 'all';

/**
 * The short default view: the mark, what it rests on (growth, and the results that will change it), the price,
 * the one tested measure of risk, and the past year. The analysts' target and the range of the past year are
 * context no test used, and the range says again what stands beside the mark (how far the price dropped): both
 * are under "All columns".
 */
const DECISION_COLUMNS = ['symbol', 'group', 'signal', 'price', 'growth', 'earnings', 'volatility', 'oneYear'];
const VIEW_STORAGE_KEY = 'watchlist.view';
/** Where this browser keeps whether the "Dip candidates" box is folded. */
const PANE_STORAGE_KEY = 'watchlist.candidates';
/** How long a message with "Undo" stays: long enough to read it, look at what changed and reach the button. */
const UNDO_MS = 30_000;
/** The link in a stock's details that returns to the portfolio's view, whose first box is "Your plan today". */
const BACK_TO_PLAN = 'Back to your plan';
/** Above this, P/E mostly reflects near-zero earnings rather than valuation. */
const MAX_MEANINGFUL_PE = 200;
const HELD_LIST_TITLE = 'HELD, NOT IN A LIST';
/** The id of that extra list. Your own lists have ids of their own (l1, l2, ...). */
const HELD_LIST_ID = 'held-outside';
/** The store key of your lists in the database. */
const LISTS_KEY = 'watchlists';
/** The store key of the daily log in the database. The daily recorder (tools/recorder) writes to it too. */
const LOG_KEY = 'log';
/** What the recorder and the re-run of the backtests leave behind after each run. */
const RECORDER_STATUS_KEY = 'recorder-status';
const EVIDENCE_STATUS_KEY = 'evidence-status';
/** What the app keeps of its last daily copy of the records: {triedAt, ok, file} or {triedAt, ok: false, message}. */
const COPY_STATUS_KEY = 'copy-status';

/** A stock marked DIP BUY, before it is known which portfolio is shown: whether it is held is added for that one. */
export type Opportunity = Omit<DipCandidate, 'held'>;

export type ListState = 'loading' | 'ready' | 'error' | 'empty';

@Component({
  selector: "app-watchlist-table",
  standalone: true,
  imports: [
    SmartTableComponent,
    PriceCellComponent,
    SymbolCellComponent,
    PercentChangeCellComponent,
    PriceRangeCellComponent,
    ProjectionRangeCellComponent,
    AnalystRecommendationCellComponent,
    OwnershipCellComponent,
    SectorDistributionWidgetComponent,
    NgIf,
    NgForOf,
    NgSwitch,
    NgSwitchCase,
    NgSwitchDefault,
    SignalCellComponent,
    SignalDetailComponent,
    PositionsCardComponent,
    PositionPanelComponent,
    ListEditorComponent,
    PlanCardComponent,
    PlanEvidenceComponent,
    DipCandidatesComponent,
    CouldAddComponent,
    WhereItFitsComponent,
    EarningsDateCellComponent,
    DebtEquityCellComponent,
    CostDistributionCellComponent,
    TrendCellComponent,
    GrowthCellComponent,
    VolatilityCellComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatTooltipModule,
    MatSnackBarModule,
    FormsModule,
    FocusWhenShownDirective, FillsColumnDirective,
  ],
  templateUrl: "./watchlist-table.component.html",
  styleUrls: ["./watchlist-table.component.scss"]
})
export class WatchlistTableComponent implements OnInit, OnChanges, OnDestroy {
  /**
   * Which of the page's two views is shown: the portfolio's (what you own, what could be added, how the plan was
   * tested) or the watchlist's (what is marked, and your lists). Both are in the page all the time and read the
   * same prices; the one not shown is only hidden, so its open rows and its editor are there when it comes back.
   */
  @Input() shows: PageView = 'portfolio';
  /** Asks for the other view: a stock's details are on the watchlist. */
  @Output() go = new EventEmitter<PageView>();
  /**
   * Not one price arrived, and no load is under way: the first load failed. The Portfolio view then says so where
   * the plan and the sizes are looked for, and lists what is held from what is recorded.
   */
  get noPrices(): boolean {
    return !this.loaded && this.pending === 0 && this.failedLists.size > 0;
  }

  /** The database did not answer and this browser has no holding of its own: what is shown is not the reader's book. */
  get portfoliosUnread(): boolean {
    return this.savedIn === 'browser' && !this.book.portfolios.some(it => Object.keys(it.positions).length > 0);
  }

  /** What the plan box says in place of the plan when it cannot be worked out; empty when it can. */
  get planTrouble(): string {
    return this.portfoliosUnread ? PORTFOLIOS_UNREAD : this.noPrices ? NO_PRICES : '';
  }

  readonly noPricesShort = NO_PRICES_SHORT;

  /** "Try again" in the plan box: reads the saved portfolios again, loads the prices again, whichever failed. */
  retry(): void {
    if (this.portfoliosUnread) {
      this.loadStoredBook();
    }
    if (this.noPrices) {
      this.loadAll();
    }
  }

  /** The stock the address names (/watchlist?stock=ACME): its details open once the lists have their prices. */
  @Input() stock?: string;
  /**
   * The stock whose details were opened last on the watchlist, and nothing once they are closed. The address
   * follows it, so that a reload of the page or a bookmark comes back to the stock: a stock had no address, and a
   * reload closed whatever was open.
   */
  @Output() stockShown = new EventEmitter<string | undefined>();
  /** What `stockShown` said last. */
  private shownStock?: string;
  /** The stock the address names, until its details have been opened. */
  private stockFromAddress?: string;
  /** The stock to open once the watchlist is shown: it was asked for from the portfolio's view. */
  private stockToShow?: string;
  /** The stock that was opened from the portfolio's view, and how far down that view the reader was. */
  private cameFrom?: { symbol: string, top: number };

  tableDefinition: TableDef[] = [];
  view: ViewMode = readView();
  visibleColumns?: string[] = this.view === 'decision' ? DECISION_COLUMNS : undefined;

  /** DIP BUYs across every list, A to Z: no ranking among them has passed a test. */
  opportunities: Opportunity[] = [];
  /** The same stocks as the "Dip candidates" box shows them: each says whether the portfolio being shown holds it. */
  candidates: DipCandidate[] = [];
  /** How many stocks on the page carry each mark, and how many have none (funds, companies too new to judge). */
  marks = {dipBuy: 0, watch: 0, pass: 0, none: 0};
  loaded = false;
  /** Lists still loading (first load or a refresh). The top bar is told, so its button can say so and wait. */
  get pending(): number {
    return this.loading;
  }

  set pending(count: number) {
    this.loading = count;
    if (count === 0 && this.loaded) {
      this.wasComplete = true;
      if (this.failedLists.size === 0) {
        this.lastChecked = new Date();
      }
      if (this.stockFromAddress) {
        // The rows are there now: the stock the address names can be opened (once they are drawn).
        setTimeout(() => this.openFromAddress());
      }
    }
    this.tellBar();
  }

  private loading = 0;
  /** When the newest price on the page is from: what the top bar shows as "Prices as of". */
  private newest?: Date;

  /**
   * Tells the top bar how the prices stand, just after the look at the page that is going on and never in the
   * middle of it: the bar is drawn before the page inside it, and what it shows must not change while a screen
   * is half drawn.
   */
  private tellBar(): void {
    Promise.resolve().then(() => {
      this.status.pending = this.loading;
      this.status.latest = this.newest;
      this.status.failed = this.failedLists.size > 0;
      this.status.checked = this.lastChecked;
    });
  }

  /** When every list last answered with prices: the bar says it beside the age of the prices themselves. */
  private lastChecked?: Date;

  /** The lists whose last try to load prices failed: the bar says that the prices on the page are the old ones. */
  private readonly failedLists = new Set<string>();
  /** The top bar's requests to load the prices again, for as long as the page is there. */
  private readonly reloads: Subscription;
  /** Market-wide context from the VIX; validated separately from the per-stock verdict. */
  fear?: MarketFear;
  /** Where the S&P 500 stands against its 52-week high, as a sentence. */
  indexLine = '';
  /** How much the DIP BUYs are one bet: shared sector and how closely they have moved together. */
  oneBet = '';
  /** Which of the stocks on the page moved together over the past year, as groups under a letter. */
  tied: TiedGroups = NO_GROUPS;
  /** The same groups as the candidates' box shows them: its own stocks of each. */
  tiedCandidates: TiedGroups = NO_GROUPS;
  private groupOf = new Map<string, TiedGroup>();
  readonly groupHelp = GROUP_HELP;

  /** What a row of a list shows in "Group": the letter and colour of its stock's group, and what the pointer is told. */
  groupCell(stock: Stock): { letter?: string, index?: number, tip: string } {
    const symbol = stock.quote?.symbol ?? '';
    const group = this.groupOf.get(symbol);
    return {letter: group?.letter, index: group?.index, tip: groupTip(symbol, this.tied)};
  }
  /** The live record of the verdict since the log began. */
  trackText = '';
  /** The daily log: the copy in this browser at first, joined with the one in the database once that is read. */
  log: SnapshotLog = loadLog();
  /** What the daily recorder last did, when it has ever run. */
  recorderText = '';
  /**
   * Set when something needs a look: the last re-run of the backtests was stopped by a check or left a note, or the
   * last daily copy of the records could not be made.
   */
  evidenceText = '';
  private evidenceNote = '';
  private copyNote = '';
  readonly today = localDay(new Date());
  /** "Why it dropped" context per symbol, fetched once for each stock that is in a dip. */
  private dropNews = new Map<string, DropNews>();
  private newsRequested = new Set<string>();
  private noVerdictCache = new WeakMap<Stock, NoVerdict>();

  /** Every portfolio the user keeps and which one is shown. Saved to the database and to this browser. */
  book: PortfolioBook = loadBook();
  /** The portfolio being shown: its positions and the two settings the sizing works from. */
  portfolio: Portfolio = activeOf(this.book);
  /**
   * Where the book is kept: the database, nothing at all on the development server (its store keeps nothing past its
   * own end), or this browser only while the database is not answering.
   */
  savedIn: SavedIn = 'checking';
  /** What the last change did, with the book as it was before when the change can be taken back. */
  notice?: BookNotice;
  /** The holdings joined with today's prices, verdicts and tested bad cases. */
  positions: PortfolioView = portfolioView(this.portfolio, new Map(), {today: this.today});
  /** How far the holdings are one bet (where the money is, how they moved over the year), as sentences. */
  positionsTogether = '';
  /**
   * Who each stock held is, by symbol: the company's name, its sector and its industry. "What you own" shows it
   * when a symbol is pointed at or reached with the keyboard, as the lists do.
   */
  companyNames: Record<string, string> = {};
  /** The tested plan applied to the portfolio being shown: what to look at today, in order. */
  plan: PlanStep[] = [];
  /** What the plan expects in each portfolio, by its id: the verbs of its steps that ask for something, named on that portfolio's button. */
  toDo: Record<string, string[]> = {};
  /** What the portfolio's box is given while prices are still arriving: no plan for its rows and nothing on the buttons, as its plan lines show none. */
  readonly noSteps: PlanStep[] = [];
  readonly nothingYet: Record<string, string[]> = {};
  /** The stocks marked DIP BUY that the portfolio being shown does not hold, each sized for it: its "Could add". */
  recommendations: Recommendation[] = [];
  /** The first of them worked out in words, which "Could add" shows under its table. */
  reading?: RowReading;
  /**
   * For the split of the cash in "Could add": the stocks the shown portfolio holds that are marked and under their
   * share (its last rows), and what the sizes were worked out from. The cash itself is the shown portfolio's.
   */
  additions: Addition[] = [];
  sizing?: SizingInput;
  /** How many of the shown portfolio's holdings have no price today: the sizes leave them out, and they are held all the same. */
  unpricedHeld = 0;
  /** The names of the companies in "Could add", by symbol: each shows where the pointer rests on its symbol. */
  couldAddNames: Record<string, string> = {};
  /** What the page knows of each of those stocks itself: how far it dropped, how it grows, and two pieces of context. */
  couldAddFacts: Record<string, StockFacts> = {};
  /** Today's price of each of those stocks: a row of "Could add" records a purchase starting from it. */
  couldAddPrices: Record<string, number> = {};
  /** "Find a stock", above the lists: every stock in the lists, what is typed, and what is said when nothing fits. */
  findable: Findable[] = [];
  findText = '';
  findProblem = '';
  /** After a stock was opened that was one of several fitting what was typed: which the others are. */
  findNote = '';
  /** The stocks that got their mark today. */
  newlyMarked: ReadonlySet<string> = new Set<string>();
  /** What each portfolio has to say about the marked stocks: a stock's details say from it where the stock fits. */
  private fitting: Fitting[] = [];
  private fits = new Map<string, string[]>();
  private positionBySymbol = new Map<string, PositionRow>();
  private casesCache = new WeakMap<Stock, TestedCases | null>();
  private stocksBySymbol = new Map<string, Stock>();
  private indexNow?: number;
  /** One year of S&P 500 closes, to compare each position with the index since it was bought. */
  private indexHistory?: ChartSeries;

  readonly maxMeaningfulPe = MAX_MEANINGFUL_PE;

  @ViewChildren(SmartTableComponent) tables!: QueryList<SmartTableComponent>;

  @ViewChild('priceCellTemplate', {static: true}) priceCellTemplate!: TemplateRef<any>;
  @ViewChild('peCellTemplate', {static: true}) peCellTemplate!: TemplateRef<any>;
  @ViewChild('neutralPercentCellTemplate', {static: true}) neutralPercentCellTemplate!: TemplateRef<any>;
  @ViewChild('plainPercentCellTemplate', {static: true}) plainPercentCellTemplate!: TemplateRef<any>;
  @ViewChild('symbolCellTemplate', {static: true}) symbolCellTemplate!: TemplateRef<any>;
  @ViewChild('groupCellTemplate', {static: true}) groupCellTemplate!: TemplateRef<any>;
  @ViewChild('dayRangeCellTemplate', {static: true}) dayRangeCellTemplate!: TemplateRef<any>;
  @ViewChild('range52wCellTemplate', {static: true}) range52wCellTemplate!: TemplateRef<any>;
  @ViewChild('projectionRangeCellTemplate', {static: true}) projectionRangeCellTemplate!: TemplateRef<any>;
  @ViewChild('analystRecommendationCellTemplate', {static: true}) analystRecommendationCellTemplate!: TemplateRef<any>;
  @ViewChild('ownershipCellTemplate', {static: true}) ownershipCellTemplate!: TemplateRef<any>;
  @ViewChild('signalCellTemplate', {static: true}) signalCellTemplate!: TemplateRef<any>;
  @ViewChild('growthCellTemplate', {static: true}) growthCellTemplate!: TemplateRef<any>;
  @ViewChild('volatilityCellTemplate', {static: true}) volatilityCellTemplate!: TemplateRef<any>;
  @ViewChild('earningsDateCellTemplate', {static: true}) earningsDateCellTemplate!: TemplateRef<any>;
  @ViewChild('debtEquityCellTemplate', {static: true}) debtEquityCellTemplate!: TemplateRef<any>;
  @ViewChild('costDistributionCellTemplate', {static: true}) costDistributionCellTemplate!: TemplateRef<any>;
  @ViewChild('trendCellTemplate', {static: true}) trendCellTemplate!: TemplateRef<any>;

  /** The lists saved in this browser, if you have edited them; the starting lists are shown otherwise. */
  private listsSaved = loadWatchlists();
  /** Your lists: names and symbols. Edited on the page, saved to the database and to this browser. */
  listBook: WatchlistBook = this.listsSaved ?? defaultBook();
  /** The same lists with their loaded quotes. */
  watchLists: Watchlist[] = this.listBook.lists.map(toWatchlist);
  /** The list whose editor is open. */
  editingListId?: string;
  /** The list a typed symbol is being checked for, and why the last symbol typed was not added. */
  checkingListId?: string;
  listProblem?: { listId: string, text: string };
  /** The name being typed for a new list; undefined while that form is closed. */
  newListTitle?: string;

  /**
   * Holdings that are in none of the lists above get a list of their own, so every position has a price and a row
   * to open. It follows the portfolios: a stock leaves it when its position is removed or it joins a list above.
   */
  heldOutside: Watchlist = {id: HELD_LIST_ID, title: HELD_LIST_TITLE, showSymbolName: true, symbols: [], dataSource: new MatTableDataSource<Stock>([])};
  /** The lists on the page: the ones above, then the holdings outside them when there are any. */
  shownLists: Watchlist[] = this.watchLists;

  readonly symbolOf = (stock: Stock) => stock.quote?.symbol ?? '';
  /**
   * What the button at the end of a list's row says where the pointer rests or the Tab key lands: the company, its
   * sector and its industry. The same as the symbol's own mouse-over, which the keyboard cannot reach.
   */
  /** What a row's button says with the keyboard on it: the company, and in which portfolios the stock is held. */
  readonly rowTipOf = (stock: Stock) => [this.symbolTooltip(stock), this.heldWhere(stock)].filter(it => !!it).join('\n');

  constructor(private microsoftMoneyService: MicrosoftMoneyService, private portfolioStore: PortfolioStoreService,
              private store: StoreService, private snackBar: MatSnackBar, private status: PriceStatusService) {
    // "Reload prices" is in the top bar, outside this page: the bar asks through the status it shares with the page.
    this.reloads = this.status.reload$.subscribe(() => this.loadAll());
    this.syncHeldList();
    this.loadAll();
    this.loadStoredBook();
    this.loadStoredLists();
    this.loadStoredLog();
  }

  /**
   * Looks at the saved records again when the page comes back into view: the portfolios or the lists may have been changed
   * in another tab or browser meanwhile, and a stale copy here must not be what the next change saves over them.
   * The log may have gained days from the recorder.
   */
  @HostListener('window:focus')
  @HostListener('document:visibilitychange')
  recheckStoredBook(): void {
    if (document.visibilityState === 'visible') {
      this.loadStoredBook();
      this.loadStoredLists();
      this.loadStoredLog();
    }
  }

  ngOnInit(): void {
    this.tableDefinition = this.getTableDefinition()
  }

  /** The address changed to the other view: it starts at its top, or at the stock that was asked for. */
  ngOnChanges(changes: SimpleChanges): void {
    const view = changes['shows'];
    if (view) {
      // The view's own name in the browser's tab and in its history: both were "Stock Screener".
      document.title = `${this.shows === 'watchlist' ? 'Watchlist' : 'Portfolio'} · Stock Screener`;
    }
    if (changes['stock'] && this.stock && this.stock !== this.shownStock) {
      this.stockFromAddress = this.stock;
      this.openFromAddress();
    }
    if (!view || view.firstChange) {
      return;
    }
    if (this.findAfterShown) {
      this.findAfterShown = false;
      if (this.shows === 'watchlist') {
        setTimeout(() => document.getElementById('find-stock')?.focus());
      }
    }
    if (this.shows === 'watchlist' && this.shownStock && !this.stockToShow) {
      // Back on the watchlist with a stock's details still open: the address names it again.
      this.stockShown.emit(this.shownStock);
    }
    const symbol = this.shows === 'watchlist' ? this.stockToShow : undefined;
    this.stockToShow = undefined;
    if (symbol) {
      this.openStock(symbol);
    } else if (this.shows === 'portfolio' && this.cameFrom) {
      // Back from a stock that was looked up from here (by the link in its details or the browser's Back): to
      // where the reader was, once the view is shown again.
      const {top, symbol: from} = this.cameFrom;
      this.cameFrom = undefined;
      setTimeout(() => {
        window.scrollTo({top});
        // The keyboard comes back too, to the stock the reader left by: it used to be on nothing.
        document.querySelector<HTMLElement>(`.view-portfolio button.symbol[aria-label="Open details for ${from}"]`)
          ?.focus({preventScroll: true});
      });
    } else {
      window.scrollTo({top: 0});
    }
  }

  /** The top bar outlives the page: a page that is gone must not answer its "Reload prices" any more. */
  ngOnDestroy(): void {
    this.reloads.unsubscribe();
  }

  /** Loads (or reloads) the market backdrop and every list. Lists already on screen stay visible meanwhile. */
  loadAll(): void {
    this.loadMarket();
    this.microsoftMoneyService.getIndexHistory().subscribe(series => {
      // The same for the market's history: a reload that brought none keeps the one the page has.
      if (series || !this.indexHistory) {
        this.indexHistory = series;
      }
      this.refreshPositions();
    });
    this.shownLists.forEach(list => this.loadList(list));
  }

  loadList(list: Watchlist): void {
    if (list.symbols.length === 0) {
      list.dataSource = new MatTableDataSource<Stock>([]);
      list.state = 'empty';
      this.refreshSummary();
      return;
    }
    if (list.dataSource.data.length === 0) {
      list.state = 'loading';
    }
    this.pending++;
    const symbols = list.symbols;
    // An answer for a set of symbols the list no longer has (it was edited meanwhile) is dropped.
    const outdated = () => list.symbols !== symbols;
    this.microsoftMoneyService.getStocks(symbols).pipe(finalize(() => this.pending--)).subscribe({
      next: stocks => {
        if (outdated()) {
          return;
        }
        // An answer without a single stock is a failed load too (the source answered, with nothing): the prices
        // already on the page stay, and the bar says that they are the old ones.
        if (stocks.length === 0) {
          this.failedLists.add(list.id);
          if (list.dataSource.data.length === 0) {
            list.state = 'error';
          }
          return;
        }
        this.failedLists.delete(list.id);
        list.dataSource = new MatTableDataSource<Stock>(stocks);
        list.state = 'ready';
        this.recordSnapshot(stocks);
        this.refreshSummary();
        stocks.forEach(stock => this.loadDropNews(stock));
      },
      error: error => {
        console.warn(`Could not load ${list.title}`, error);
        // A failure for a set of symbols the list no longer has is dropped like an answer for it: the list of what
        // is held outside the lists empties when the lists arrive, and its late failure kept the bar on "could not
        // be loaded" after every price had loaded.
        if (outdated()) {
          return;
        }
        // Said in the top bar, with the age of the prices that are still shown and a way to try again.
        this.failedLists.add(list.id);
        this.tellBar();
        // Keep showing the last good prices if there are any; otherwise say so and offer a retry.
        if (list.dataSource.data.length === 0 && !outdated()) {
          list.state = 'error';
        }
      },
    });
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.visibleColumns = view === 'decision' ? DECISION_COLUMNS : undefined;
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Storage unavailable (private mode etc.): the choice just isn't remembered.
    }
  }

  /** Which column each shown list stands in, with how many stocks each list had when that was worked out. */
  private columnsOf?: { key: string, columns: number[] };

  /**
   * Which of the two columns a list stands in where two lists fit side by side: see `listColumns`. It rests on
   * how many stocks each list has, so a list keeps its column when a stock's details are opened.
   */
  columnOfList(index: number): number {
    const counts = this.shownLists.map(list => list.symbols.length), key = counts.join(',');
    if (this.columnsOf?.key !== key) {
      this.columnsOf = {key, columns: listColumns(counts)};
    }
    return this.columnsOf.columns[index];
  }

  /**
   * Whether the "Dip candidates" box is folded to the least of it (the marks with their counts, and the stocks
   * with how far each dropped). Folded, it is a narrow strip and the lists get the room: on a wide window two lists
   * then stand side by side, so most of the Watchlist is on one screen. Kept in this browser, like the columns.
   */
  paneFolded = readFolded();

  foldPane(folded: boolean): void {
    this.paneFolded = folded;
    try {
      localStorage.setItem(PANE_STORAGE_KEY, folded ? 'folded' : 'open');
    } catch {
      // Storage unavailable: the choice just isn't remembered.
    }
  }

  /**
   * Opens a stock's details. The rows are on the watchlist: asked from the portfolio's view, the page first asks
   * to be shown as the watchlist and opens the stock once it is.
   */
  showStock(symbol: string): void {
    if (this.shows !== 'watchlist') {
      this.stockToShow = symbol;
      // Remembered, so that the stock's details can offer the way back to this place.
      this.cameFrom = {symbol, top: window.scrollY};
      this.go.emit('watchlist');
      return;
    }
    this.openStock(symbol);
  }

  /**
   * "Find a stock" was sent (Enter): the row of the stock that was meant opens, as a click on a candidate opens it,
   * and the field is emptied for the next one. When nothing in the lists fits, a sentence beside the field says so
   * and what was typed stays, to be corrected.
   */
  findStock(): void {
    const [symbol, ...others] = findMatches(this.findText, this.findable);
    this.findNote = '';
    if (!symbol) {
      this.findProblem = this.findText.trim() ? notFound(this.findText) : '';
      return;
    }
    // One of several: the first from A to Z opens, and the others are named beside the field.
    this.findNote = alsoFits(this.findText, others);
    if (this.findNote) {
      // Said also where the reader now is: the page scrolls to the row that opened, and the bar may be out of sight.
      this.snackBar.open(this.findNote, undefined, {duration: 8000});
    }
    this.findText = '';
    this.findProblem = '';
    this.openStock(symbol);
  }

  /**
   * The "/" key puts the keyboard into "Find a stock", as it does on many pages with a search field. Only on the
   * watchlist's view, where the field is, and never while something is being typed into another field.
   */
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target?.closest?.('input, textarea, select, [contenteditable="true"]');
    if (event.key !== '/' || typing || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (this.shows !== 'watchlist') {
      // The field is on the watchlist: the key leads there, with the keyboard in the field once it is shown. It
      // used to do nothing on this view, so the one shortcut of the page worked on one view of two.
      this.findAfterShown = true;
      this.go.emit('watchlist');
      return;
    }
    document.getElementById('find-stock')?.focus();
  }

  /**
   * "Skip to your lists" in "Dip candidates": the keyboard goes past the box (a stop a stock) to the first control
   * of the lists, the choice of columns, and the lists come into view.
   */
  toLists(): void {
    const first = document.querySelector<HTMLElement>('.lists-bar button, .lists-bar input');
    first?.focus();
    first?.scrollIntoView({block: 'start'});
  }

  /** "/" was pressed on the portfolio's view: the keyboard goes into "Find a stock" once the watchlist is shown. */
  private findAfterShown = false;

  /**
   * "Back to your plan", for the details of the stock that was opened from the portfolio's view; nothing for any
   * other stock. Looking a stock up from "Could add" or "What you own" changes the view: this is the way back.
   */
  backFrom(symbol: string): string {
    return this.shows === 'watchlist' && this.cameFrom?.symbol === symbol ? BACK_TO_PLAN : '';
  }

  /**
   * Closes a stock's details from their foot. The row they belong to is brought back into view and gets the
   * keyboard: after a long panel closes, the reader is where they started, not somewhere further down the page.
   */
  closeStock(stock: Stock): void {
    const symbol = stock.quote?.symbol;
    this.tables?.forEach(table => table.collapse(stock));
    if (symbol === this.shownStock) {
      this.tellStock(undefined);
    }
    setTimeout(() => {
      const row = document.querySelector(`[data-symbol="${symbol}"]`)?.closest('tr');
      row?.scrollIntoView({block: 'nearest'});
      row?.querySelector<HTMLElement>('button.toggle')?.focus({preventScroll: true});
    });
  }

  /** Goes back to the portfolio's view, to where the reader was when they opened the stock (see `ngOnChanges`). */
  backToPlan(): void {
    this.go.emit('portfolio');
  }

  /**
   * The column every list is ordered by, and which way. One order for all the lists, as there is one choice of
   * columns for them: a click on a heading in one list used to reorder that list alone, and the same question
   * ("which fell furthest this year?") had to be asked list by list.
   */
  listSort: { active: string, direction: 'asc' | 'desc' } = {active: 'signal', direction: 'desc'};

  /** A heading was clicked in one list: the other lists follow, and a list shown later starts the same way. */
  sortLists(order: { active: string, direction: 'asc' | 'desc' }): void {
    this.listSort = order;
    this.tables?.forEach(table => table.sortTo(order.active, order.direction));
  }

  /** How many stocks have their details open, over all the lists. */
  get openDetails(): number {
    return this.tables?.reduce((count, table) => count + table.openCount, 0) ?? 0;
  }

  /** "Close all open details", in the line of "Your lists". */
  closeAllDetails(): void {
    this.tables?.forEach(table => table.collapseAll());
    this.tellStock(undefined);
    // The button that was pressed is gone with the last open details: the keyboard goes to "Find a stock".
    setTimeout(() => document.getElementById('find-stock')?.focus());
  }

  /** The link in front of a list that takes the keyboard past it, to the list after it. */
  skipList(event: Event, index: number): void {
    event.preventDefault();
    const next = document.querySelectorAll<HTMLElement>('.lists > section.list')[index + 1];
    if (next) {
      next.tabIndex = -1;
      next.focus({preventScroll: true});
      next.scrollIntoView({block: 'start'});
    }
  }

  /** The reader opened or closed a row's details themself: the address follows (see `stockShown`). */
  rowToggled(change: { row: Stock, open: boolean }): void {
    const symbol = this.symbolOf(change.row);
    if (change.open) {
      this.tellStock(symbol);
    } else if (symbol === this.shownStock) {
      this.tellStock(undefined);
    }
  }

  /** Says which stock's details are open now, when that is news. */
  private tellStock(symbol: string | undefined): void {
    if (symbol !== this.shownStock) {
      this.shownStock = symbol;
      this.stockShown.emit(symbol);
    }
  }

  /**
   * Opens the stock the address names, once, when its row is there: on the watchlist, after the lists have their
   * prices. A stock that is in no list (any more) opens nothing: the line beside "Find a stock" says why, and
   * the address is put right.
   */
  private openFromAddress(): void {
    const symbol = this.stockFromAddress;
    if (!symbol || this.shows !== 'watchlist' || !this.wasComplete) {
      return;
    }
    this.stockFromAddress = undefined;
    if (this.findable.some(it => it.symbol === symbol)) {
      this.openStock(symbol);
    } else {
      this.findProblem = notFound(symbol);
      this.stockShown.emit(undefined);
    }
  }

  /** Opens a stock's details, scrolls to its row, moves the keyboard there and briefly highlights it. */
  private openStock(symbol: string): void {
    this.tellStock(symbol);
    this.tables?.forEach(table => {
      const row = table.dataSource.data.find((it: Stock) => it.quote?.symbol === symbol);
      if (row) {
        table.expand(row);
      }
    });
    // Wait for the details to render so the scroll lands on the final layout.
    setTimeout(() => {
      const row = document.querySelector(`[data-symbol="${symbol}"]`)?.closest('tr');
      if (!row) {
        return;
      }
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      // The row comes into view together with its list's name and column heads when it is near enough to them (a
      // list is a handful of rows): at the very top of the window its figures stood there without their headings.
      const list = row.closest<HTMLElement>('section.list');
      const near = !!list && row.getBoundingClientRect().top - list.getBoundingClientRect().top < window.innerHeight * 0.45;
      (near ? list! : row).scrollIntoView({behavior: calm ? 'auto' : 'smooth', block: 'start'});
      // The row was opened from elsewhere on the page: the keyboard, and a screen reader, go with it.
      row.querySelector<HTMLElement>('button.toggle')?.focus({preventScroll: true});
      row.classList.add('row-highlight');
      setTimeout(() => row.classList.remove('row-highlight'), 1600);
    });
  }

  /** Saves the snapshot log as a file, so it can be kept safe or tested later with the Python tools. */
  exportLog(): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.log)], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `watchlist-log-${this.today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  trackByList(_: number, list: Watchlist): string {
    return list.id;
  }

  trackByPortfolio(_: number, portfolio: { id: string }): string {
    return portfolio.id;
  }

  trackBySymbolOf(_: number, stock: Findable): string {
    return stock.symbol;
  }

  /** "Apple Inc | Technology | Consumer Electronics", skipping parts the API doesn't provide (e.g. ETFs). */
  symbolTooltip(stock: Stock): string {
    return [stock.quote?.displayName, stock.equity?.company?.sector, stock.equity?.company?.industry]
      .filter(it => !!it)
      .join(' | ');
  }

  newsFor(stock: Stock): DropNews | undefined {
    return this.dropNews.get(stock.quote?.symbol);
  }

  /** Why a stock has no verdict (only meaningful when it has none). */
  noVerdictFor(stock: Stock): NoVerdict {
    if (!this.noVerdictCache.has(stock)) {
      this.noVerdictCache.set(stock, isFund(stock) ? 'fund' : whyNoVerdict(stock) ?? 'no-data');
    }
    return this.noVerdictCache.get(stock)!;
  }

  /** The holding in this stock, if there is one. */
  positionOf(stock: Stock): PositionRow | undefined {
    return this.positionBySymbol.get(stock.quote?.symbol);
  }

  /**
   * Whether any of the user's portfolios holds the stock. On the Watchlist "held" used to mean "held in the
   * portfolio last chosen on the other view", which the owner called odd: the Watchlist is about the market, not
   * about one portfolio.
   */
  isHeld(stock: Stock): boolean {
    return heldIn(this.book, stock.quote?.symbol).length > 0;
  }

  /** In which portfolios, as the "held" tag says it: "You hold this in Savings and Brokerage." */
  heldWhere(stock: Stock): string {
    return heldText(heldIn(this.book, stock.quote?.symbol), this.book.portfolios.length);
  }

  /** What tested DIP BUYs of this volatility did, for a stock that is a DIP BUY now (the sizing works from the bad case). */
  casesOf(stock: Stock): TestedCases | undefined {
    if (!this.casesCache.has(stock)) {
      this.casesCache.set(stock, casesFor(signalFor(stock)) ?? null);
    }
    return this.casesCache.get(stock) ?? undefined;
  }

  // ---- Your lists: edited on the page, saved to the database and to this browser. ----

  /** The saved definition of one of your lists. */
  listDef(id: string): WatchlistDef | undefined {
    return this.listBook.lists.find(it => it.id === id);
  }

  toggleListEditor(id: string): void {
    this.editingListId = this.editingListId === id ? undefined : id;
    this.listProblem = undefined;
  }

  /** "Done" or Esc in a list's editor: it closes, and the keyboard goes back to that list's "Edit list". */
  closeListEditor(id: string): void {
    this.editingListId = undefined;
    this.listProblem = undefined;
    setTimeout(() => document.querySelector<HTMLElement>(`[data-edits="${id}"]`)?.focus());
  }

  /** Cancel or Esc in the form of "New list": the button is back, and the keyboard is on it. */
  cancelNewList(): void {
    this.newListTitle = undefined;
    setTimeout(() => document.querySelector<HTMLElement>('.lists-bar .new-list button')?.focus());
  }

  /**
   * Whether the plan is still being worked out: until the first prices of every list are in. A reload of prices
   * that are already there does not count: every list keeps its old rows until its new ones arrive, so the plan
   * stays complete all the way through. It used to be taken away for the seconds a reload takes: the plan's lines,
   * the "to do" on the portfolios' buttons and the rows of "Could add" vanished, the page jumped, and a form that
   * was open in "Could add" was thrown away with what was typed in it.
   */
  get working(): boolean {
    return !this.loaded || (this.pending > 0 && !this.wasComplete);
  }

  /** Every list has had its first prices at least once. */
  private wasComplete = false;

  /** Adds a stock to a list once the data source confirms it has a quote for exactly that symbol. */
  addSymbol(listId: string, text: string): void {
    const symbol = text.trim().toUpperCase();
    const list = this.listDef(listId);
    const problem = symbolProblem(text) ?? (list?.symbols.includes(symbol) ? `${symbol} is already in this list.` : undefined);
    if (!list || problem) {
      this.listProblem = {listId, text: problem ?? ''};
      return;
    }
    this.listProblem = undefined;
    this.checkingListId = listId;
    this.microsoftMoneyService.getStocks([symbol]).pipe(finalize(() => this.checkingListId = undefined)).subscribe({
      next: stocks => {
        if (stocks.some(stock => stock.quote?.symbol?.toUpperCase() === symbol)) {
          this.updateLists(withSymbol(this.listBook, listId, symbol));
        } else {
          this.listProblem = {listId, text: `No quote found for ${symbol}, so it was not added.`};
        }
      },
      error: () => this.listProblem = {listId, text: `${symbol} could not be checked: the data source did not answer. Try again.`},
    });
  }

  removeSymbol(listId: string, symbol: string): void {
    this.updateLists(withoutSymbol(this.listBook, listId, symbol), `Removed ${symbol} from ${this.listDef(listId)?.title ?? 'the list'}.`);
  }

  renameList(id: string, title: string): void {
    this.updateLists(renameList(this.listBook, id, title));
  }

  moveList(id: string, by: -1 | 1): void {
    this.updateLists(moveList(this.listBook, id, by));
  }

  removeList(id: string): void {
    this.updateLists(removeList(this.listBook, id), `Deleted the list ${this.listDef(id)?.title ?? ''}.`);
  }

  /** Adds the list being named in the "New list" form and opens its editor, ready for its stocks. */
  addNewList(): void {
    const after = addList(this.listBook, this.newListTitle ?? '');
    if (after === this.listBook) {
      return;
    }
    this.newListTitle = undefined;
    this.updateLists(after);
    this.editingListId = after.lists[0].id;
  }

  /**
   * Applies a change to the lists and saves it: to this browser at once, and to the database.
   * With `undoText`, says what was removed and offers to take it back.
   */
  private updateLists(book: WatchlistBook, undoText?: string): void {
    const before = this.listBook;
    this.listBook = stampedLists(book, new Date());
    this.listsSaved = this.listBook;
    saveWatchlists(this.listBook);
    this.applyLists();
    this.store.save(LISTS_KEY, this.listBook).subscribe();
    if (undoText) {
      this.snackBar.open(undoText, 'Undo', {duration: UNDO_MS}).onAction().subscribe(() => this.updateLists(before));
    }
  }

  /** Rebuilds the lists on the page from the saved ones, keeping the quotes already loaded and loading only what is new. */
  private applyLists(): void {
    const shown = new Map(this.watchLists.map(list => [list.id, list]));
    const toLoad: Watchlist[] = [];
    this.watchLists = this.listBook.lists.map(def => {
      const current = shown.get(def.id);
      if (current && current.symbols.join() === def.symbols.join()) {
        current.title = def.title;
        return current;
      }
      const list = toWatchlist(def);
      // Rows already loaded stay on screen for the stocks that remain; the list is fetched again only when one was added.
      const kept = (current?.dataSource.data ?? []).filter(stock => def.symbols.includes(stock.quote?.symbol));
      list.dataSource = new MatTableDataSource<Stock>(kept);
      list.state = def.symbols.length === 0 ? 'empty' : kept.length ? 'ready' : undefined;
      if (kept.length < def.symbols.length) {
        toLoad.push(list);
      }
      return list;
    });
    if (this.editingListId && !this.watchLists.some(list => list.id === this.editingListId)) {
      this.editingListId = undefined;
    }
    // A holding taken out of its list moves to the list of holdings, and back out when it joins a list again.
    if (this.syncHeldList() && this.heldOutside.dataSource.data.length < this.heldOutside.symbols.length) {
      toLoad.push(this.heldOutside);
    }
    this.showLists();
    toLoad.forEach(list => this.loadList(list));
    this.refreshSummary();
  }

  /**
   * Brings in the lists kept in the database, when the store is answering, and settles which copy is current: the later
   * save wins (see `reconcileLists`). Until a list is edited nothing is saved anywhere and the starting lists show.
   */
  private loadStoredLists(): void {
    this.store.load(LISTS_KEY).subscribe(stored => {
      if (!stored.available) {
        return;
      }
      const inFile = stored.value === undefined ? undefined : parseWatchlists(JSON.stringify(stored.value));
      const unreadable = !!stored.damaged || (stored.value !== undefined && !inFile);
      const {book, writeFile, writeBrowser} = reconcileLists(this.listsSaved, inFile, unreadable);
      if (writeBrowser && book) {
        this.listBook = book;
        this.listsSaved = book;
        saveWatchlists(book);
        this.applyLists();
      }
      if (writeFile) {
        this.store.save(LISTS_KEY, this.listBook).subscribe();
      }
    });
  }

  /**
   * A correction of what is recorded ("Edit" in a stock's details). It replaces the holding, so it is said in a
   * sentence and can be taken back, like the purchases and sales entered beside it. The cash is not touched.
   */
  savePosition(position: Position): void {
    const shares = `${shareCount(position.shares)} share${position.shares === 1 ? '' : 's'}`;
    this.changeWithUndo(withActive(this.book, withPosition(this.portfolio, position)),
      `${position.symbol} is now recorded as ${shares} at ${position.price.toFixed(2)}.`, this.book);
  }

  /**
   * Records a purchase or a sale that happened: the holding that results and, when the reader said the money
   * came from or went to this portfolio's cash, the cash, in one save. Otherwise the money of a purchase would be
   * counted twice (as the stock and as cash) and every size the plan gives would be too large. What was recorded
   * is said in a sentence, with what it did to the cash, and can be taken back.
   */
  /**
   * @param away the trade was entered away from the plan box (in "Could add"): the sentence and its Undo are then
   *             also shown where the reader is, when the plan box is not on screen
   */
  recordTrade(trade: Trade, away = false): void {
    this.applyTrades([trade], trade.text, away);
  }

  /**
   * Records several purchases together (the stocks ticked in "Could add"): every holding and the cash in one save,
   * one sentence that names them, and one Undo that takes them all back.
   */
  recordTrades(trades: Trade[]): void {
    if (trades.length === 1) {
      this.recordTrade(trades[0], true);
    } else if (trades.length > 1) {
      const symbols = trades.map(trade => trade.symbol);
      this.applyTrades(trades, `Recorded ${trades.length} purchases: ${symbols.slice(0, -1).join(', ')} and ${symbols[symbols.length - 1]}.`, true);
    }
  }

  /** The holdings and the cash after the trades given, saved in one step, said in one sentence, with one Undo. */
  private applyTrades(trades: Trade[], text: string, away: boolean): void {
    const before = this.book;
    let portfolio = this.portfolio;
    trades.forEach(trade => portfolio = trade.holding ? withPosition(portfolio, trade.holding) : withoutPosition(portfolio, trade.symbol));
    const change = trades.reduce((sum, trade) => sum + trade.cashChange, 0);
    let cashText = portfolio.cash === undefined ? '' : ' Cash was left as it was.';
    if (change !== 0) {
      const cash = Math.max(0, Math.round(((portfolio.cash ?? 0) + change) * 100) / 100);
      portfolio = {...portfolio, cash};
      cashText = ` Cash is now ${money(cash)}.`;
    }
    this.changeWithUndo(withActive(this.book, portfolio), text + cashText, before, away && !this.planBoxOnScreen());
  }

  /** Whether the top of the plan box, where the notice of a change stands, is in the window now. */
  private planBoxOnScreen(): boolean {
    const box = document.querySelector('app-positions-card')?.getBoundingClientRect();
    return !!box && box.top >= 0 && box.top < window.innerHeight - 160;
  }

  removePosition(symbol: string): void {
    this.changeWithUndo(withActive(this.book, withoutPosition(this.portfolio, symbol)), `Removed ${symbol} from what you own.`, this.book);
  }

  /** Applies a change to what is owned, says it in a sentence and offers to take it back. */
  private changeWithUndo(book: PortfolioBook, text: string, before: PortfolioBook, alsoHere = false): void {
    this.updateBook(book, {text, undo: before});
    // The notice with its Undo stands in the plan box. On the watchlist's view that box is hidden, so the same
    // sentence and the same way back are shown where the change was made. It takes back only this change: once
    // another change has replaced the notice, the message does nothing.
    if (this.shows === 'watchlist' || alsoHere) {
      this.snackBar.open(text, 'Undo', {duration: UNDO_MS}).onAction().subscribe(() => {
        if (this.notice?.undo === before) {
          this.undoChange();
        }
      });
    }
  }

  saveSettings(settings: PortfolioSettings): void {
    this.updateBook(withActive(this.book, {
      ...this.portfolio, cash: settings.cash, lossBudgetPercent: settings.lossBudgetPercent, reservePercent: settings.reservePercent,
      takeProfitPercent: settings.takeProfitPercent,
    }));
  }

  selectPortfolio(id: string): void {
    this.updateBook(selectPortfolio(this.book, id));
  }

  addPortfolio(name: string): void {
    this.updateBook(addPortfolio(this.book, name));
  }

  renamePortfolio(name: string): void {
    this.updateBook(renamePortfolio(this.book, this.book.active, name));
  }

  /** Removes the portfolio being shown, with a way back: it may hold positions typed in by hand. */
  removePortfolio(): void {
    const name = activeOf(this.book).name;
    this.updateBook(removePortfolio(this.book, this.book.active), {text: `Removed the portfolio "${name}".`, undo: this.book});
  }

  /** Takes back the last change that offered it. */
  undoChange(): void {
    if (this.notice?.undo) {
      this.updateBook(this.notice.undo);
    }
  }

  /** Saves every portfolio as one file: a backup, or the way to carry them to another browser or computer. */
  exportBook(): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.book, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolios-${this.today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Replaces every portfolio with the ones in an exported file, after checking the whole file is sound. */
  importBook(text: string): void {
    const imported = parseBook(text);
    if (!imported) {
      this.notice = {text: 'That file is not a portfolios export from this app, so nothing was changed.'};
      return;
    }
    const count = imported.portfolios.length;
    this.updateBook(imported, {text: `Imported ${count} portfolio${count === 1 ? '' : 's'}, replacing what was here.`, undo: this.book});
  }

  /** Applies a change to the book and saves it: to this browser at once, and to the database. */
  private updateBook(book: PortfolioBook, notice?: BookNotice): void {
    this.book = stamped(book, new Date());
    saveBook(this.book);
    this.notice = notice;
    this.showBook();
    this.writeFile();
  }

  private showBook(): void {
    this.portfolio = activeOf(this.book);
    if (this.syncHeldList()) {
      const list = this.heldOutside;
      if (list.dataSource.data.length < list.symbols.length) {
        this.loadList(list);   // the page's totals are refreshed when its quotes arrive
      } else {
        this.refreshSummary();   // a holding left the list: take it out of the counts too
        return;
      }
    }
    this.refreshPositions();
  }

  /**
   * Puts the holdings that are in none of the lists into the extra list. It takes the symbols held in any
   * portfolio, so switching between portfolios loads nothing new. True when that list changed.
   */
  private syncHeldList(): boolean {
    const listed = new Set(this.watchLists.flatMap(list => list.symbols));
    const outside = symbolsHeld(this.book).filter(symbol => !listed.has(symbol));
    const list = this.heldOutside;
    if (outside.join() === list.symbols.join()) {
      return false;
    }
    list.symbols = outside;
    list.dataSource = new MatTableDataSource<Stock>(list.dataSource.data.filter(stock => outside.includes(stock.quote?.symbol)));
    if (outside.length === 0) {
      list.state = undefined;
    }
    this.showLists();
    return true;
  }

  private showLists(): void {
    this.shownLists = this.heldOutside.symbols.length ? [...this.watchLists, this.heldOutside] : this.watchLists;
    // A list that is no longer shown is no longer a failed one. On a day without prices every holding counts as
    // held outside the lists, and that list fails with the others; once the prices are in it is empty and is not
    // loaded again, and it used to keep the bar on "Prices could not be loaded" after everything had loaded.
    const gone = [...this.failedLists].filter(id => !this.shownLists.some(list => list.id === id));
    if (gone.length > 0) {
      gone.forEach(id => this.failedLists.delete(id));
      this.tellBar();
    }
  }

  private writeFile(): void {
    this.portfolioStore.save(this.book).subscribe(saved => this.savedIn = saved ? (this.portfolioStore.lasting ? 'database' : 'memory') : 'browser');
  }

  /**
   * Brings in the copy kept in the database, when the store is answering, and settles which copy is current: the later
   * save wins, and an empty copy never replaces one with positions (see `reconcile`).
   */
  private loadStoredBook(): void {
    this.portfolioStore.load().subscribe(stored => {
      if (!stored.available) {
        this.savedIn = 'browser';
        return;
      }
      this.savedIn = this.portfolioStore.lasting ? 'database' : 'memory';
      if (stored.damaged) {
        this.notice = {
          text: 'The portfolios saved in the database could not be read, so the copy kept in this browser is shown. ' +
            'Your next change replaces them; the unreadable version is kept in the database as the one before.',
        };
      }
      const {book, writeFile, writeBrowser} = reconcile(this.book, stored.book, stored.damaged);
      if (writeBrowser) {
        this.book = book;
        this.notice = undefined;   // an Undo offered for the copy just replaced no longer applies
        saveBook(book);
        this.showBook();
      }
      if (writeFile) {
        this.writeFile();
      }
    });
  }

  /**
   * Works out the plan from today's prices: in full for the portfolio being shown, and for every other portfolio
   * as far as its button needs: what that plan expects.
   */
  private refreshPositions(): void {
    const context = {
      stocks: this.stocksBySymbol, today: this.today, log: this.log,
      indexNow: this.indexNow, indexHistory: this.indexHistory, fear: this.fear,
    };
    const shown = planFor(this.portfolio, context);
    this.positions = shown.view;
    this.positionBySymbol = new Map(this.positions.rows.map(row => [row.symbol, row]));
    // How far the stocks of this portfolio are one bet: by what each is worth today, over the year of prices loaded.
    // Not said while a holding has no price (also while the prices are still arriving): it would be about fewer
    // stocks than the headline counts, and NO PRICE says what to do about the one that is missing.
    this.positionsTogether = this.positions.rows.some(row => row.view.value === undefined) ? ''
      : oneBetText(this.positions.rows.flatMap(row => {
        const stock = this.stocksBySymbol.get(row.symbol);
        return stock && row.view.value !== undefined ? [{stock, value: row.view.value}] : [];
      }), this.indexHistory);
    this.companyNames = Object.fromEntries(this.positions.rows.map(row => {
      const stock = this.stocksBySymbol.get(row.symbol);
      // The company's name with its sector and industry, as the lists say it for the same symbol.
      return [row.symbol, stock ? this.symbolTooltip(stock) : ''];
    }));
    this.plan = shown.steps;
    const shownId = activeOf(this.book).id;
    const plans = this.book.portfolios.map(it => ({portfolio: it, plan: it.id === shownId ? shown : planFor(it, context)}));
    this.toDo = Object.fromEntries(plans.map(it => [it.portfolio.id, toDoVerbs(it.plan.steps)]));
    // The marked stocks as recommendations: sized for the portfolio being shown ("Could add"), and for every
    // portfolio where a stock's details say where it fits.
    this.recommendations = shown.recommendations;
    this.reading = shown.reading;
    this.additions = shown.additions;
    this.sizing = shown.sizing;
    this.unpricedHeld = this.positions.rows.filter(row => row.view.value === undefined).length;
    this.couldAddNames = Object.fromEntries([...shown.recommendations, ...shown.additions]
      .map(it => [it.symbol, companyName(this.stocksBySymbol.get(it.symbol))]));
    this.couldAddFacts = Object.fromEntries([...shown.recommendations, ...shown.additions].flatMap(it => {
      const facts = factsOf(this.stocksBySymbol.get(it.symbol));
      return facts ? [[it.symbol, facts] as const] : [];
    }));
    this.couldAddPrices = Object.fromEntries([...shown.recommendations, ...shown.additions].flatMap(it => {
      const price = this.stocksBySymbol.get(it.symbol)?.quote?.price;
      return isNum(price) && price > 0 ? [[it.symbol, price] as const] : [];
    }));
    this.newlyMarked = new Set(this.opportunities.filter(it => it.isNew).map(it => it.symbol));
    this.fitting = plans.map(it => ({
      name: it.portfolio.name, held: Object.keys(it.portfolio.positions),
      recommendations: it.plan.recommendations, additions: it.plan.additions,
    }));
    this.fits.clear();
    // "held" among the candidates is held in any portfolio, as in the lists, and the tag says in which.
    this.candidates = this.opportunities.map(it => {
      const names = heldIn(this.book, it.symbol);
      return {...it, held: names.length > 0, heldIn: heldText(names, this.book.portfolios.length)};
    });
  }

  /** The name of the portfolio being shown. */
  get shownName(): string {
    return activeOf(this.book).name;
  }

  /** Which portfolio that is: what the user ticked in "Could add" belongs to it, whatever its name. */
  get shownId(): string {
    return activeOf(this.book).id;
  }

  /** Where a stock fits: its size in each portfolio, a line each. Empty unless the stock is marked DIP BUY. */
  fitsOf(stock: Stock): string[] {
    const symbol = stock.quote?.symbol ?? '';
    let lines = this.fits.get(symbol);
    if (!lines) {
      lines = whereItFits(symbol, this.fitting);
      this.fits.set(symbol, lines);
    }
    return lines;
  }

  /** Whether a stock is marked DIP BUY now: only those get a size. */
  isMarked(stock: Stock): boolean {
    return signalFor(stock)?.verdict === 'DIP BUY';
  }

  /** Brings "How the plan was tested", at the bottom of the page, into view. */
  showPlanTests(): void {
    this.bringIntoView(document.getElementById('plan-evidence'));
  }

  /** Brings the "Could add" box into view: the plan's BUY line points to it, and in a laptop window it is far down. */
  showCouldAdd(): void {
    this.bringIntoView(document.getElementById('could-add'));
  }

  /** Scrolls a box of the page to the top of the window (without the motion, for who asked for none) and puts the keyboard there. */
  private bringIntoView(box: HTMLElement | null): void {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    box?.scrollIntoView({behavior: calm ? 'auto' : 'smooth', block: 'start'});
    box?.focus({preventScroll: true});
  }

  private loadMarket(): void {
    this.microsoftMoneyService.getMarket().subscribe(market => {
      // A reload that brought nothing keeps the market's last figures, as the rows keep their last prices (the bar
      // says of when they are). It used to take the GOOD TIME line, "Market since" and the comparison with the
      // market off the page without a word.
      if (market.spy === undefined && market.vix === undefined && (this.fear || this.indexNow !== undefined)) {
        return;
      }
      this.fear = marketFear(market.vix);
      this.indexLine = indexLineOf(market);
      this.indexNow = market.spy;
      this.refreshPositions();
      if (market.spy !== undefined || market.vix !== undefined) {
        this.recordDay({spy: market.spy, vix: market.vix, s: {}});
        this.refreshSummary();
      }
    });
  }

  /** Adds today's reading of these stocks to the log. */
  private recordSnapshot(stocks: Stock[]): void {
    const entry: DayLog = {s: {}};
    stocks.forEach(stock => {
      const snap = snapshotOf(stock);
      if (stock.quote?.symbol && snap) {
        entry.s[stock.quote.symbol] = snap;
      }
    });
    this.recordDay(entry);
  }

  /**
   * Adds readings to today's entry: in this browser at once, and in the database as a change to
   * merge, so what the recorder or another tab wrote there stays.
   */
  private recordDay(entry: DayLog): void {
    this.log = record(this.log, this.today, entry);
    saveLog(this.log);
    this.store.merge(LOG_KEY, dayChange(this.today, entry)).subscribe();
  }

  /**
   * Joins the log in the database with the copy in this browser: the days the recorder added appear here, and what
   * this browser recorded while the store was not answering is sent to the database. Also reads what the recorder,
   * the last re-run of the backtests and the daily copy of the records reported.
   */
  private loadStoredLog(): void {
    this.store.load(LOG_KEY).subscribe(stored => {
      if (!stored.available || stored.damaged) {
        return;
      }
      const inFile = parseLog(stored.value);
      if (stored.value !== undefined && !inFile) {
        return;   // something else is in that file: leave it alone
      }
      const unsent = missingIn(inFile, this.log);
      if (inFile) {
        this.log = mergeLogs(inFile, this.log);
        saveLog(this.log);
        this.refreshSummary();
      }
      if (unsent) {
        this.store.merge(LOG_KEY, {v: 1, days: unsent}).subscribe();
      }
      const tooOld = inFile && trimChange(inFile);
      if (tooOld) {
        this.store.merge(LOG_KEY, tooOld).subscribe();
      }
    });
    this.store.load(RECORDER_STATUS_KEY).subscribe(stored =>
      this.recorderText = stored.available ? recorderLine(stored.value, this.today) : '');
    this.store.load(EVIDENCE_STATUS_KEY).subscribe(stored => {
      this.evidenceNote = stored.available ? evidenceLine(stored.value) : '';
      this.evidenceText = joinNotes([this.evidenceNote, this.copyNote]);
    });
    this.store.load(COPY_STATUS_KEY).subscribe(stored => {
      this.copyNote = stored.available ? copyLine(stored.value) : '';
      this.evidenceText = joinNotes([this.evidenceNote, this.copyNote]);
    });
  }

  /** Headlines from the week of the biggest one-day fall, for stocks at least DIP_PERCENT below their high. */
  private loadDropNews(stock: Stock): void {
    const symbol = stock.quote?.symbol;
    const signal = signalFor(stock);
    if (!symbol || !signal || (signal.belowHigh ?? 0) < DIP_PERCENT || this.newsRequested.has(symbol)) {
      return;
    }
    this.newsRequested.add(symbol);
    const drop = biggestDropSinceHigh(stock);
    const query = newsQuery(stock);
    if (!drop || !query) {
      this.dropNews.set(symbol, {drop, headlines: []});
      return;
    }
    // Ask for articles about the fall first (Google ranks by relevance, not by what moved the price); fall back to any news.
    const from = isoDay(addDays(drop.date, -2)), to = isoDay(addDays(drop.date, 2));
    this.microsoftMoneyService.getNewsRss(`${query} ${DROP_WORDS}`, from, to).pipe(
      map(xml => xml ? parseHeadlines(xml) : []),
      switchMap(headlines => headlines.length ? of(headlines) :
        this.microsoftMoneyService.getNewsRss(query, from, to).pipe(map(xml => xml ? parseHeadlines(xml) : [])))
    ).subscribe(headlines => this.dropNews.set(symbol, {drop, headlines}));
  }

  private refreshSummary(): void {
    const unique = new Map<string, Stock>();
    this.shownLists.forEach(list => list.dataSource.data.forEach(stock => {
      if (stock.quote?.symbol) {
        unique.set(stock.quote.symbol, stock);
      }
    }));
    const counts = {'DIP BUY': 0, 'WATCH': 0, 'PASS': 0, none: 0};
    const opportunities: Opportunity[] = [];
    const dipBuys: Stock[] = [];
    unique.forEach((stock, symbol) => {
      const signal = signalFor(stock);
      counts[signal?.verdict ?? 'none']++;
      if (signal?.verdict === 'DIP BUY') {
        opportunities.push({
          // A stock is marked DIP BUY because it dropped, so how far is known.
          symbol, name: companyName(stock),
          belowHigh: signal.belowHigh ?? DIP_PERCENT, growthText: growthChipText(growthOutlook(stock)),
          isNew: this.becameDipBuyToday(symbol), earningsSoon: signal.earningsSoon, headline: signal.headline,
        });
        dipBuys.push(stock);
      }
    });
    this.opportunities = opportunities.sort((a, b) => a.symbol.localeCompare(b.symbol));
    this.marks = {dipBuy: counts['DIP BUY'], watch: counts['WATCH'], pass: counts['PASS'], none: counts.none};
    this.oneBet = movingTogetherText(dipBuys, 'these', 3);
    // Which stocks move together, over every stock on the page: one grouping, so that a letter means the same
    // group in the lists, among the candidates, in "Could add" and in "What you own" (the owner: "add the group
    // everywhere so that I can see").
    this.tied = unique.size > 1 ? tiedGroups([...unique.values()]) : NO_GROUPS;
    this.groupOf = groupBySymbol(this.tied);
    this.tiedCandidates = groupsAmong(this.tied, dipBuys.map(stock => stock.quote?.symbol as string));
    this.stocksBySymbol = unique;
    this.findable = [...unique.entries()].map(([symbol, stock]) => ({symbol, name: companyName(stock)}))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    this.newest = latestQuoteTime([...unique.values()]);
    this.tellBar();
    this.refreshPositions();
    this.trackText = trackText(this.log, this.today);
    this.loaded = unique.size > 0;
  }

  /** True when the stock's DIP BUY run starts today and the log already knew the stock from an earlier day. */
  private becameDipBuyToday(symbol: string): boolean {
    if (dipBuySince(this.log, symbol, this.today)?.day !== this.today) {
      return false;
    }
    return Object.keys(this.log.days).some(day => day < this.today && !!this.log.days[day].s[symbol]);
  }

  private getTableDefinition(): TableDef[] {
    return [
      {
        columnName: 'symbol',
        // "Stock", as in the page's other three tables of stocks.
        columnDisplayName: 'Stock',
        template: this.symbolCellTemplate,
        templateData: (it: Stock) => it,
        sortValue: (it: Stock) => it.quote?.symbol,
        sortStart: 'asc',
        sticky: true
      },
      {
        // Which stocks move together: a letter a group, the same letter in every table of the page.
        columnName: 'group',
        columnDisplayName: 'Group',
        columnTooltip: GROUP_HELP,
        template: this.groupCellTemplate,
        templateData: (it: Stock) => this.groupCell(it),
        // A to Z by the group's letter, the stocks in no group last: a click puts the rows of a group together.
        sortValue: (it: Stock) => this.groupOf.get(it.quote?.symbol ?? '')?.letter ?? '~',
        sortStart: 'asc',
      },
      {
        columnName: 'signal',
        // "Mark", the word every sentence on the page uses for DIP BUY, WATCH and PASS (this heading said "Signal").
        // The figure beside the mark (how far the price is below its highest of the past year) had no name in sight,
        // and "Past year" stood in the same row: the heading names both, in the word of "Dip candidates" and "Could add".
        columnDisplayName: 'Mark · dropped',
        columnTooltip: 'DIP BUY: the price is ' + DIP_PERCENT + '% or more below its highest of the past year and the business is ' +
          'growing (profit per share on course to grow ' + GROWTH_EPS_PERCENT + '% or more, or sales up ' + GROWTH_REVENUE_PERCENT +
          '% or more on a year ago; see Growth). WATCH: growing, but no such drop yet. PASS: not growing enough. ' +
          'No mark for funds, or for companies with fewer than ' + MIN_REPORTED_QUARTERS +
          ' reported quarters or less than a year of prices.\n\n' + CARD_NOTE + '\n\n' +
          'The % next to the mark is how far the price is below its highest of the past year; a flag means the company reports ' +
          'its results within 2 weeks. Sorted by mark, then A to Z: no order inside a mark has passed a test. ' +
          'Open a row for the evidence, the risks and the context. Not financial advice.',
        template: this.signalCellTemplate,
        templateData: (it: Stock) => ({signal: signalFor(it), noVerdict: this.noVerdictFor(it)}),
        sortValue: (it: Stock) => signalSortValue(signalFor(it), it.quote?.symbol ?? ''),
        sticky: true,
        stickyWideOnly: true
      },
      {
        columnName: 'price',
        columnDisplayName: 'Price',
        columnTooltip: 'The price of one share in US dollars, as of the time the bar at the top of the page says.',
        template: this.priceCellTemplate,
        templateData: (it: Stock) => it.quote?.price,
        sortValue: (it: Stock) => it.quote?.price
      },
      {
        columnName: 'growth',
        columnDisplayName: 'Growth',
        columnTooltip: 'The two numbers behind the mark. Profit: profit per share (EPS), the next quarter as analysts expect it ' +
          'plus the last 3 reported, against the last 4 reported. Sales: the latest quarter\'s sales (revenue) against the same ' +
          'quarter a year earlier. A tick marks a pass (profit ' + GROWTH_EPS_PERCENT + '% or more, sales ' + GROWTH_REVENUE_PERCENT +
          '% or more); one tick makes the company "growing". Grey without ticks: too little history for the tested rule. ' +
          'Sorts by the stronger of the two.',
        template: this.growthCellTemplate,
        templateData: (it: Stock) => growthOutlook(it),
        sortValue: (it: Stock) => growthStrength(it)
      },
      {
        columnName: 'earnings',
        columnDisplayName: 'Next results',
        columnTooltip: 'When the company is expected to report its next quarterly results (its "earnings"). Orange = within ' +
          '2 weeks: prices often swing sharply on the report, and it changes the growth numbers, so check the mark again ' +
          'afterwards. If the company has just reported, shows that date and whether its profit per share beat or missed ' +
          'what analysts expected.',
        template: this.earningsDateCellTemplate,
        templateData: (it: Stock) => ({date: nextEarningsDate(it), days: daysUntilEarnings(it), reported: lastEarnings(it)}),
        sortValue: (it: Stock) => daysUntilEarnings(it),
        sortStart: 'asc'
      },
      {
        columnName: '52wRange',
        columnDisplayName: 'Past-year range',
        columnTooltip: 'The lowest and the highest price of the past year. The dot marks today\'s price: left = near the ' +
          'lowest, right = near the highest. Sorts by how far the price is below the highest.',
        template: this.range52wCellTemplate,
        templateData: (it: Stock) => ({
          price: it.quote?.price,
          minPrice: it.quote?.price52wLow,
          maxPrice: it.quote?.price52wHigh,
        }),
        sortValue: (it: Stock) => percentChange(it.quote?.price52wHigh, it.quote?.price)
      },
      {
        columnName: 'volatility',
        columnDisplayName: 'Volatility',
        columnTooltip: VOLATILITY_COLUMN_NOTE + ' Worked out from the past year\'s weekly price changes. ' +
          'It measures risk, not which stocks do better.',
        template: this.volatilityCellTemplate,
        templateData: (it: Stock) => ({volatility: volatilityFor(it), tier: signalFor(it)?.volatilityTier}),
        sortValue: (it: Stock) => volatilityFor(it)
      },
      {
        columnName: 'projection',
        columnDisplayName: 'Analyst target',
        columnTooltip: 'Where analysts expect the price in 12 months. Large number: how far the middle one of their targets is ' +
          'above (or below) today\'s price. Small numbers: the lowest and the highest target. Dot = today\'s price, ' +
          'triangle = the middle target. Sorts by the large number. ' +
          'Context only: targets lag a fast fall, and there is no history yet to test them against (the log is building it).',
        template: this.projectionRangeCellTemplate,
        templateData: (it: Stock) => ({
          price: it.quote?.price,
          minPrice: it.equity?.analysis?.estimate?.lowPriceTarget,
          medianPrice: it.equity?.analysis?.estimate?.medianPriceTarget,
          maxPrice: it.equity?.analysis?.estimate?.highPriceTarget,
          numberOfTargets: it.equity?.analysis?.estimate?.numberOfPriceTargets,
        }),
        sortValue: (it: Stock) => percentChange(it.quote?.price, it.equity?.analysis?.estimate?.medianPriceTarget)
      },
      {
        columnName: 'dayChange',
        columnDisplayName: 'Day %',
        columnTooltip: 'Price change since the previous close.',
        // Context, like every change of price in the lists: its sign, no green or red (colour is for the mark and
        // what it rests on).
        template: this.plainPercentCellTemplate,
        templateData: (it: Stock) => it.quote?.priceChangePercent,
        sortValue: (it: Stock) => it.quote?.priceChangePercent
      },
      {
        columnName: 'dividend',
        columnDisplayName: 'Div. Yield',
        columnTooltip: 'Forward annual dividend as a % of the current price. "—" if the stock pays no dividend.',
        template: this.neutralPercentCellTemplate,
        // The API reports 0 for non-payers; show "—" rather than a misleading "0.00%".
        templateData: (it: Stock) => it.quote?.yieldPercent || undefined,
        sortValue: (it: Stock) => it.quote?.yieldPercent || undefined
      },
      {
        columnName: 'dayRange',
        columnDisplayName: 'Day Range',
        columnTooltip: "Today's low and high. The dot marks the current price.",
        template: this.dayRangeCellTemplate,
        templateData: (it: Stock) => ({
          price: it.quote?.price,
          minPrice: it.quote?.priceDayLow,
          maxPrice: it.quote?.priceDayHigh,
        }),
        // By where today's price stands between the day's low and high: the one column that could not be ordered.
        sortValue: (it: Stock) => {
          const low = it.quote?.priceDayLow, high = it.quote?.priceDayHigh, price = it.quote?.price;
          return typeof low === 'number' && typeof high === 'number' && typeof price === 'number' && high > low
            ? (price - low) / (high - low) : undefined;
        }
      },
      {
        columnName: 'trend',
        columnDisplayName: 'vs 200D',
        columnTooltip: 'Price vs its 200-day moving average; the arrow shows whether that average is rising or falling. ' +
          'Context only: in tests on stocks it had not seen before, it did not improve the results of stocks that dropped, ' +
          'so the mark does not use it.',
        template: this.trendCellTemplate,
        templateData: (it: Stock) => trendFor(it),
        sortValue: (it: Stock) => trendFor(it)?.vs200Percent
      },
      {
        columnName: 'holders',
        columnDisplayName: 'Holders in Profit',
        columnTooltip: 'An estimate of the prices at which today\'s holders bought over the last year. ' +
          "Dark = bought below today's price (in profit), pale = bought above it. Context only: in the tests it did not " +
          'tell which of the stocks that dropped did well, so the mark does not use it.',
        template: this.costDistributionCellTemplate,
        templateData: (it: Stock) => costDistributionFor(it),
        sortValue: (it: Stock) => costDistributionFor(it)?.profitRatio
      },
      {
        columnName: 'analystRating',
        columnDisplayName: 'Analyst Rating',
        columnTooltip: "The stock's analyst consensus, with the split of ratings from Sell (left) to Strong Buy (right). " +
          'A click orders the rows by the average rating, the most favourable first. Context only: there is no history of ' +
          'past ratings to test it on.',
        template: this.analystRecommendationCellTemplate,
        templateData: (it: Stock) => it?.equity?.analysis?.estimate,
        // Provider scale: 1 = Strong Buy … 5 = Sell
        sortValue: (it: Stock) => it?.equity?.analysis?.estimate?.recommendationRate
      },
      // Who holds the stock stands with the two other columns about its holders and its analysts (the owner asked
      // for it right after "Analyst Rating"; it used to be the last column, a long scroll to the right).
      {
        columnName: 'ownership',
        columnDisplayName: 'Inst. Ownership',
        columnTooltip: '% of shares held by institutions (funds, banks, pensions). Hover a cell for insider ownership.',
        template: this.ownershipCellTemplate,
        templateData: (it: Stock) => it.equity?.ownershipSummary,
        sortValue: (it: Stock) => it.equity?.ownershipSummary?.institutionalOwnershipPercent
      },
      {
        columnName: 'oneWeek',
        columnDisplayName: '1W',
        columnTooltip: 'Price return over the last week.',
        template: this.plainPercentCellTemplate,
        templateData: (it: Stock) => it.quote?.return1Week,
        sortValue: (it: Stock) => it.quote?.return1Week
      },
      {
        columnName: 'oneMonth',
        columnDisplayName: '1M',
        columnTooltip: 'Price return over the last month.',
        template: this.plainPercentCellTemplate,
        templateData: (it: Stock) => it.quote?.return1Month,
        sortValue: (it: Stock) => it.quote?.return1Month
      },
      {
        columnName: 'threeMonths',
        columnDisplayName: '3M',
        columnTooltip: 'Price return over the last 3 months.',
        template: this.plainPercentCellTemplate,
        templateData: (it: Stock) => it.quote?.return3Month,
        sortValue: (it: Stock) => it.quote?.return3Month
      },
      {
        columnName: 'sixMonths',
        columnDisplayName: '6M',
        columnTooltip: 'Price return over the last 6 months.',
        template: this.plainPercentCellTemplate,
        templateData: (it: Stock) => it.quote?.return6Month,
        sortValue: (it: Stock) => it.quote?.return6Month
      },
      {
        columnName: 'oneYear',
        columnDisplayName: 'Past year',
        columnTooltip: 'How much the price changed over the past year (dividends not included).',
        // Context in the key columns, where the mark and what it rests on are the only things in colour.
        template: this.plainPercentCellTemplate,
        templateData: (it: Stock) => it.quote?.return1Year,
        sortValue: (it: Stock) => it.quote?.return1Year
      },
      {
        columnName: 'eps-ttm',
        columnDisplayName: 'EPS (TTM)',
        columnTooltip: 'Earnings per share over the trailing twelve months, in dollars. A minus sign means the company lost money. ' +
          'Useful for tracking growth or comparing peers; a bigger EPS alone does not make a stock cheaper.',
        template: this.priceCellTemplate,
        templateData: (it: Stock) => it.equity?.analysis?.keyMetrics?.eps,
        sortValue: (it: Stock) => it.equity?.analysis?.keyMetrics?.eps
      },
      {
        columnName: 'pe-ttm',
        columnDisplayName: 'P/E (TTM)',
        columnTooltip: 'Price ÷ trailing twelve-month EPS: what you pay for each $1 of past earnings. ' +
          'Lower can mean cheaper, but only compare within the same industry. "—" when earnings are negative; ' +
          `"n/m" (not meaningful) above ${MAX_MEANINGFUL_PE}, where earnings are too small for the ratio to say much.`,
        template: this.peCellTemplate,
        templateData: (it: Stock) => nonZero(it.quote?.peRatio),
        sortValue: (it: Stock) => nonZero(it.quote?.peRatio)
      },
      {
        columnName: 'pe-forward',
        columnDisplayName: 'Fwd P/E',
        columnTooltip: "Price ÷ analysts' average EPS estimate. Fwd P/E below P/E (TTM) means earnings are expected " +
          `to grow; above it means they are expected to shrink. "—" when expected earnings are negative; "n/m" above ${MAX_MEANINGFUL_PE}.`,
        template: this.peCellTemplate,
        // Computed here: the API's own forwardPriceToEPS does not match price ÷ its EPS estimate.
        templateData: (it: Stock) => forwardPE(it),
        sortValue: (it: Stock) => forwardPE(it)
      },
      {
        columnName: 'debtToEquity',
        columnDisplayName: 'Debt/Equity',
        columnTooltip: 'Debt ÷ shareholder equity. Lower = safer balance sheet. Bold above 2 (banks and utilities often run higher). ' +
          'Hover a cell for the industry average.',
        template: this.debtEquityCellTemplate,
        templateData: (it: Stock) => ({
          value: debtToEquity(it),
          industryValue: industryDebtToEquity(it),
          industry: it.equity?.company?.industry,
        }),
        sortValue: (it: Stock) => debtToEquity(it)
      },
    ];
  }
}

function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'all' ? 'all' : 'decision';
  } catch {
    return 'decision';
  }
}

function readFolded(): boolean {
  try {
    return localStorage.getItem(PANE_STORAGE_KEY) === 'folded';
  } catch {
    return false;
  }
}

/** The local calendar day as YYYY-MM-DD: the snapshot log's key. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function indexLineOf(market: MarketSnapshot): string {
  const price = market.spy, high = market.spyHigh52;
  if (!isNum(price) || !isNum(high) || high <= 0) {
    return '';
  }
  const below = Math.max(0, (high - price) / high * 100);
  return below < 0.5 ? 'The market (S&P 500) is at its highest of the past year'
    : `The market (S&P 500) is ${below.toFixed(1)}% below its highest of the past year`;
}

function trackText(log: SnapshotLog, today: string): string {
  const record = trackRecord(log, today);
  if (!record.opened || !record.since) {
    return '';
  }
  const flagged = `${record.opened} DIP BUY${record.opened === 1 ? '' : 's'}`;
  const since = new Date(`${record.since}T12:00:00`).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  if (record.typicalReturn === undefined) {
    return `Log started ${since}: following ${flagged} from here.`;
  }
  // The middle one, as everywhere the page says how such stocks did ("the typical one"): an average of twenty is
  // ruled by one stock whose first recorded price was wrong.
  const index = record.typicalSpyReturn === undefined ? ''
    : `, against ${signedPercent(record.typicalSpyReturn)} for the market over the same days`;
  return `Since ${since} this page has flagged ${flagged}: the typical one is ${signedPercent(record.typicalReturn)} so far${index}. ` +
    'A live record, not a backtest.';
}

/**
 * ETFs and other funds have no earnings of their own, so the Signal can't judge them. The provider also tags some
 * partnerships as "etf" (e.g. Energy Transfer LP), so the name must look like a fund too; those show "NO DATA" instead.
 */
function isFund(stock: Stock): boolean {
  const type = `${stock.quote?.securityType ?? ''} ${stock.equity?.analysis?.assetCategory ?? ''}`;
  const name = `${stock.quote?.displayName ?? ''} ${stock.quote?.shortName ?? ''}`;
  return /etf|fund/i.test(type) && /\b(etf|fund|trust|index|portfolio)\b/i.test(name);
}

/** How far the stronger growth number is past its threshold (1 = exactly at it), for sorting. */
function growthStrength(stock: Stock): number | undefined {
  const growth = growthOutlook(stock);
  if (!growth) {
    return undefined;
  }
  return Math.max((growth.epsOutlook ?? -Infinity) / GROWTH_EPS_PERCENT, (growth.revenueGrowth ?? -Infinity) / GROWTH_REVENUE_PERCENT);
}

function signedPercent(value: number): string {
  const fixed = value.toFixed(1);
  // A change that rounds to nothing is "0.0%", never "-0.0%".
  return Number(fixed) === 0 ? '0.0%' : `${Number(fixed) > 0 ? '+' : ''}${fixed}%`;
}

/** % change going from `from` to `to`; undefined when either value is missing. */
function percentChange(from?: number, to?: number): number | undefined {
  if (!from || to === null || to === undefined || !Number.isFinite(from) || !Number.isFinite(to)) {
    return undefined;
  }
  return ((to - from) / from) * 100;
}

/** The API reports a P/E of exactly 0 when there is none (e.g. ETFs); treat it as missing. */
function nonZero(value?: number): number | undefined {
  return value ? value : undefined;
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** The company's name as the data source gives it, or nothing: shown under a stock's symbol wherever stocks are listed. */
function companyName(stock?: Stock): string {
  return stock?.quote?.displayName || stock?.quote?.shortName || '';
}

/** One of your lists as the page shows it: its definition plus a place for its quotes. */
function toWatchlist(def: WatchlistDef): Watchlist {
  return {id: def.id, title: def.title, symbols: def.symbols, showSymbolName: true, dataSource: new MatTableDataSource<Stock>([])};
}

export type Watchlist = {
  /** The id of the list in the saved lists; the extra list of holdings has one of its own. */
  id: string
  title: string
  symbols: string[]
  showSymbolName?: boolean
  dataSource: MatTableDataSource<Stock>
  /** Undefined until the first load starts; treated as loading. */
  state?: ListState
}
