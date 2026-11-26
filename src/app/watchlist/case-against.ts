import {Stock} from "../api/microsoft-money.service";
import {biggestDropSinceHigh} from "./drop-news";
import {EVIDENCE, inTen, VOLATILITY_COLUMN_NOTE, VOLATILITY_GROUPS_NOTE, volatilityNote} from "./evidence";
import {signedPercent, signedWholePercent} from "./format";
import {trendFor} from "./market-math";
import {daysUntilEarnings, debtToEquity, peFiveYearRange, Signal, signalFor, SignalResult, TARGET_CONTEXT, TESTED_DEPTH_P95, TESTED_VOL_P95} from "./signal";
import {COLUMNS} from "./recommendations";
import {earningsWhen, resultsSoonLine} from "./results-soon";
import {casesFor, VolatilityGroup, volatilityGroup} from "./sizing";
import {SnapshotLog, valueBefore} from "./snapshot-log";
import {FACT_COLUMNS, FACT_HELP, factsOf} from "./stock-facts";

/**
 * The case against a stock, where the reader chooses what to buy.
 *
 * The owner of the page, of "Could add": "I need the risk analysis to be surfaced so that I can pick the risky one.
 * Also there should be some sort of way of comparing them against each other". Until then a stock's risk stood only
 * in its details on the Watchlist, one stock at a time, and the sizes of "Could add" even it out: every row is
 * sized so that a bad half-year costs the same, so the table could not show which stock is the risky one.
 *
 * Worked out here, from what the page already knows of a stock, in the words its details use:
 * - for a row of the table, how much its price swings (the one risk measure that passed a test) and, apart from
 *   it, short tags for what speaks against it among the facts no test could use;
 * - for the block that sets the ticked stocks side by side, every fact as a row, what was tested apart from the
 *   context and from why the price dropped.
 *
 * None of it ranks the stocks or names one: no order among stocks marked DIP BUY held up in the tests (there the
 * riskier ones typically earned more, with a worse bad case). A tested fact and an untested one never share a
 * column or a part, there is no score and no total, and an order by a column is the reader's own.
 */

/** One thing that speaks against a stock among the facts no test could use: a tag of a word or two, and its sentence. */
export type Against = { tag: string, text: string };

/** The facts a stock is compared by, a row each in the block that sets the ticked stocks side by side. */
export type FactKey = 'dropped' | 'growing' | 'swings' | 'fell' | 'bad' | 'typical' | 'good' | 'beyond'
  | 'profit' | 'debt' | 'pe' | 'target' | 'rating' | 'targetChange' | 'owners' | 'trend' | 'results'
  | 'bigDay';

/**
 * What one stock says for one fact: a figure or a word or two, and the sentence behind it where there is one.
 * `against` is set where the fact is one of those the stock's "Against" tags name: the page sets it in red (the
 * owner: "I want that in red so that we know it's a "no no"").
 */
export type FactCell = {
  value: string
  tip?: string
  against?: boolean
  /** The figure as it is printed, in the rows that have a best value among the ticked stocks. */
  n?: number
  /** Set by `sideBySide`: this is the best of the ticked stocks in its row. The page sets it in green. */
  best?: boolean
};

export type StockCase = {
  /** How much the price swings in a year: "85%". Empty without a year of prices. */
  swings: string
  /** The group that puts a stock marked DIP BUY in; the tests measured those only. */
  group?: VolatilityGroup
  /** It dropped further or swings more than 19 in 20 of the tested stocks: the averages fit it less well. */
  beyondTests: boolean
  /** Under the pointer: what the tests found for stocks that swing like it and, on a line of its own, why it is beyond them. */
  swingsTip: string
  /** The swing as a number, for an order by the column. */
  volatility?: number
  /** What speaks against it: the company first, then the analysts, then the calendar. Empty for most stocks. */
  against: Against[]
  /** Under the pointer: the sentence of each of those, a line each. */
  againstTip: string
  /** Every fact the page knows of it, for the block of the ticked stocks. One it does not know is left out. */
  facts: Partial<Record<FactKey, FactCell>>
};

/**
 * @param signal the stock's mark and what was worked out with it; given by a test that fixes the day
 * @param log    the daily log, for how analysts' target moved; `today` is its key for today (YYYY-MM-DD)
 */
export type CaseOptions = { signal?: Signal, log?: SnapshotLog, today?: string, now?: Date };

/** The headings of the two columns. */
export const CASE_COLUMNS: { swings: string, against: string } = {swings: 'Swings', against: 'Against'};

/** What each of the two is, said when its heading is pointed at or reached with the keyboard. */
export const CASE_HELP: { swings: string, against: string } = {
  swings: `${VOLATILITY_COLUMN_NOTE} A warning sign marks a stock that dropped further or swings more than 19 in 20 of ` +
    'the tested ones: the averages fit it less well.',
  against: 'What speaks against the stock among the facts no test could use, or that made no difference in tests: it makes ' +
    'no profit, it owes a lot, its price is high for its profit, analysts are not keen or cut their target, its results ' +
    'are due. Context, not a tested reason to leave one out.',
};

const MINUS = '−';
/** How analysts' target moved is judged against a reading at least this old, as in a stock's details. */
const CHANGE_DAYS = 20;

/**
 * The lines of a stock's context that its details mark against it, by how each begins, and the tag for it. In the
 * order the tags are shown: the company, then the analysts. A line no rule knows keeps its own first words.
 */
const TAGS: { is: (reason: string) => boolean, tag: string, fact: FactKey }[] = [
  {is: reason => reason.startsWith('Not profitable'), tag: 'no profit', fact: 'profit'},
  {is: reason => reason.startsWith('High debt'), tag: 'high debt', fact: 'debt'},
  {is: reason => reason.includes('(P/E)'), tag: 'high P/E', fact: 'pe'},
  {is: reason => reason.startsWith('Analysts rate it'), tag: 'weak rating', fact: 'rating'},
  {is: reason => reason.startsWith(TARGET_CONTEXT), tag: 'low target', fact: 'target'},
];

/**
 * A stock's risk for "Could add", or nothing for a stock the page cannot judge (a fund, a company with too little
 * history): such a stock has no mark and is never in the box.
 */
export function caseOf(stock: Stock | undefined, o: CaseOptions = {}): StockCase | undefined {
  const signal = o.signal !== undefined ? o.signal : stock ? signalFor(stock) : null;
  if (!stock || !signal) {
    return undefined;
  }
  const now = o.now ?? new Date();
  const volatility = signal.volatility;
  const group = signal.verdict === 'DIP BUY' && volatility !== undefined ? volatilityGroup(volatility) : undefined;
  const said = swingsSaid(signal);
  const change = targetChange(stock, o.log, o.today);
  const against = againstOf(signal, change);
  return {
    swings: volatility === undefined ? '' : `${volatility.toFixed(0)}%`,
    group,
    beyondTests: !!signal.rareInTests,
    swingsTip: said && signal.rareInTests ? `${said}\n${signal.rareInTests}` : said,
    volatility,
    against,
    againstTip: against.map(it => it.text).join('\n'),
    facts: factsFor(stock, signal, group, said, change, now),
  };
}

/** What the "Against" cell of a row prints: the first tags, and how many more there are (their sentences are under the pointer). */
export function againstCell(against: Against[], max = 2): { tags: string[], more: number } {
  return {tags: against.slice(0, max).map(it => it.tag), more: Math.max(0, against.length - max)};
}

/** What the tests found for stocks that swing like this one, in the sentence the lists use for the same figure. */
function swingsSaid(signal: SignalResult): string {
  if (signal.volatility === undefined) {
    return '';
  }
  return signal.volatilityTier ? volatilityNote(signal.volatilityTier, signal.volatility)
    : `Swings of about ${signal.volatility.toFixed(0)}% a year (from weekly returns over the past year). ${VOLATILITY_GROUPS_NOTE}`;
}

type TargetChange = { percent: number, when: string };

/** How far analysts' middle price target moved since the log's reading of three weeks ago or more; nothing under 1%. */
function targetChange(stock: Stock, log: SnapshotLog | undefined, today: string | undefined): TargetChange | undefined {
  const target = stock.equity?.analysis?.estimate?.medianPriceTarget, symbol = stock.quote?.symbol;
  if (!log || !today || !symbol || !isNum(target)) {
    return undefined;
  }
  const before = valueBefore(log, symbol, 't', today, CHANGE_DAYS);
  if (!before || before.value <= 0) {
    return undefined;
  }
  const percent = (target / before.value - 1) * 100;
  if (Math.round(Math.abs(percent)) < 1) {
    return undefined;
  }
  return {percent, when: new Date(`${before.day}T12:00:00`).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})};
}

function againstOf(signal: SignalResult, change: TargetChange | undefined): Against[] {
  const minus = signal.factors.filter(it => it.points < 0).map(it => it.reason);
  const known = TAGS.flatMap(rule => minus.filter(rule.is).map(reason => ({tag: rule.tag, text: `${reason}.`})));
  const others = minus.filter(reason => !TAGS.some(rule => rule.is(reason)))
    .map(reason => ({tag: reason.split(/[:(]/)[0].trim().toLowerCase(), text: `${reason}.`}));
  const cut = change && change.percent < 0
    ? [{tag: 'target cut', text: `Analysts cut their middle price target by ${Math.abs(change.percent).toFixed(0)}% since ${change.when}.`}] : [];
  const days = signal.earningsInDays;
  const due = days === undefined ? []
    : [{tag: days === 0 ? 'results today' : days === 1 ? 'results tomorrow' : `results in ${days}d`, text: resultsSoonLine(days)}];
  return [...known, ...others, ...cut, ...due];
}

function factsFor(stock: Stock, signal: SignalResult, group: VolatilityGroup | undefined, swingsSays: string,
                  change: TargetChange | undefined, now: Date): Partial<Record<FactKey, FactCell>> {
  const facts: Partial<Record<FactKey, FactCell>> = {};
  // The facts that speak against the stock: the ones its "Against" tags name, by the same rules (`againstOf`).
  const minus = signal.factors.filter(it => it.points < 0).map(it => it.reason);
  const against = new Set<FactKey>([
    ...TAGS.filter(rule => minus.some(rule.is)).map(rule => rule.fact),
    ...(change && change.percent < 0 ? ['targetChange' as const] : []),
    ...(signal.earningsInDays !== undefined ? ['results' as const] : []),
  ]);
  /** @param n the figure as printed, in a row that has a best value among the ticked stocks (`BEST`) */
  const put = (key: FactKey, value: string | undefined, tip?: string, n?: number) => {
    if (value) {
      facts[key] = {value, ...(tip ? {tip} : {}), ...(against.has(key) ? {against: true} : {}), ...(n !== undefined ? {n} : {})};
    }
  };
  /** The sentence of a line of context, when the stock's details have that line. */
  const line = (is: (reason: string) => boolean, against = false) => {
    const found = signal.factors.find(it => is(it.reason) && (!against || it.points < 0));
    return found ? `${found.reason}.` : undefined;
  };

  // What was tested: the two facts the mark rests on, the swing, and what stocks that swing like it did.
  const known = factsOf(stock, signal);
  put('dropped', known?.dropped, known?.droppedTip);
  put('growing', known?.growing, known?.growingTip);
  const volatility = signal.volatility;
  if (volatility !== undefined) {
    const word = group === 'volatile' ? ' · volatile' : group === 'calm' ? ' · calm' : group === 'middle' ? ' · between' : '';
    put('swings', `${volatility.toFixed(0)}% a year${word}`, swingsSays, Number(volatility.toFixed(0)));
  }
  const fell = EVIDENCE.fresh.fellPercent, fellPercent = group === 'volatile' ? fell.volatile : group === 'calm' ? fell.calm : undefined;
  // "4 in 10" is what is printed, so 4 is what is compared: 41% and 44% are the same figure to the reader.
  put('fell', fellPercent === undefined ? undefined : inTen(fellPercent), undefined, fellPercent === undefined ? undefined : Math.round(fellPercent / 10));
  const cases = casesFor(signal);
  if (cases) {
    put('bad', signedWholePercent(-cases.lossPercent), undefined, Math.round(cases.lossPercent));
    put('typical', signedPercent(cases.typicalPercent), undefined, Number(cases.typicalPercent.toFixed(1)));
    put('good', signedWholePercent(cases.gainPercent), undefined, Math.round(cases.gainPercent));
  }
  if (signal.rareInTests) {
    const beyond = [
      (signal.belowHigh ?? 0) >= TESTED_DEPTH_P95 ? 'dropped this far' : '',
      (volatility ?? 0) >= TESTED_VOL_P95 ? 'swings this much' : '',
    ].filter(it => !!it).join(', ');
    put('beyond', beyond || 'yes', signal.rareInTests);
  }

  // Context: what no test could use, or what made no difference in tests.
  const eps = stock.equity?.analysis?.keyMetrics?.eps;
  put('profit', isNum(eps) ? (eps > 0 ? 'yes' : 'no') : undefined, line(reason => reason.startsWith('Not profitable')));
  const debt = debtToEquity(stock), highDebt = line(reason => reason.startsWith('High debt'));
  put('debt', debt === undefined ? undefined : `${debt.toFixed(1)} times${highDebt ? ' · high' : ''}`, highDebt,
    debt === undefined ? undefined : Number(debt.toFixed(1)));
  const pe = stock.quote?.peRatio, range = peFiveYearRange(stock);
  if (isNum(pe) && pe > 0) {
    const where = !range ? '' : ` · ${pe < range.low ? 'below' : pe > range.high ? 'above' : 'within'} its range`;
    put('pe', `${pe.toFixed(0)}${where}`, line(reason => reason.includes('(P/E)')));
  }
  // The target as a whole percent from today's price, as its cell prints it (a figure that rounds to nothing is 0, not −0).
  const price = stock.quote?.price, median = stock.equity?.analysis?.estimate?.medianPriceTarget;
  put('target', known?.target, known?.targetTip,
    known?.target && isNum(price) && price > 0 && isNum(median) ? Math.round((median - price) / price * 100) || 0 : undefined);
  const rated = line(reason => reason.startsWith('Analysts rate it')), rate = stock.equity?.analysis?.estimate?.recommendationRate;
  put('rating', rated && isNum(rate) ? rate.toFixed(2) : undefined, rated, rated && isNum(rate) ? Number(rate.toFixed(2)) : undefined);
  put('targetChange', change && `${change.percent > 0 ? 'raised' : 'cut'} ${signedWholePercent(change.percent)} since ${change.when}`);
  put('owners', known?.holders, known?.holdersTip);
  const trend = trendFor(stock);
  put('trend', trend ? `${signedWholePercent(trend.vs200Percent)} · average ${trend.ma200SlopePercent >= 0 ? 'rising' : 'falling'}` : undefined);
  const days = daysUntilEarnings(stock, now);
  put('results', days === undefined ? undefined : earningsWhen(days),
    signal.earningsInDays === undefined ? undefined : resultsSoonLine(signal.earningsInDays));

  // Why it dropped: what the chart shows. The headlines of that week are in the stock's details.
  if (stock.chart?.prices?.length) {
    const drop = biggestDropSinceHigh(stock);
    // Daily bars are stamped at midnight US Eastern (as UTC), so the day is read in UTC, as in the details.
    put('bigDay', drop ? `${MINUS}${Math.abs(drop.changePercent).toFixed(1)}% on ` +
      drop.date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'}) : 'none: a slide');
  }
  return facts;
}

/** A row of the block: one fact, and what each of the stocks says for it. */
export type CompareRow = {
  key: FactKey
  label: string
  /** What the fact is, said when its name is pointed at or reached with the keyboard. */
  help: string
  /** A cell a stock, in the order of the stocks; a dash where the page does not know the fact of that one. */
  cells: FactCell[]
  /** Every stock says the same: the row can step back, so that what differs stands out. */
  same: boolean
};
export type ComparePart = { title: string, note: string, rows: CompareRow[] };
export type Comparison = { symbols: string[], title: string, parts: ComparePart[] };

/**
 * The name of each row and what it is. Where "Could add" has a column for the same fact, the row has that column's
 * name: one name a fact on the page. (In the table the three cases are dollars for the row's size; here they are
 * the percentages those dollars come from.)
 */
const ROWS: Record<FactKey, { label: string, help: string }> = {
  dropped: {label: FACT_COLUMNS.dropped, help: FACT_HELP.dropped},
  growing: {label: FACT_COLUMNS.growing, help: FACT_HELP.growing},
  swings: {label: CASE_COLUMNS.swings, help: VOLATILITY_COLUMN_NOTE},
  fell: {
    label: 'Fell a further 20%',
    help: 'How many of the tested stocks that swing like it fell a further 20% within 13 weeks of being marked DIP BUY. ' +
      'The tests have a figure for volatile stocks and one for calm ones, none for those between.',
  },
  bad: {label: COLUMNS.bad, help: '1 in 10 of the tested stocks that swing like it lost this much or more in the 6 months after being marked DIP BUY.'},
  typical: {label: COLUMNS.typical, help: 'Where the middle one of the tested stocks that swing like it ended after 6 months: half did better, half worse.'},
  good: {label: COLUMNS.good, help: '1 in 10 of the tested stocks that swing like it gained this much or more in the 6 months after being marked DIP BUY.'},
  beyond: {
    label: 'Beyond the tests',
    help: `Only 1 in 20 of the tested stocks was ${TESTED_DEPTH_P95}% or more below its highest price, and only 1 in 20 swung ` +
      `${TESTED_VOL_P95}% or more a year: the averages fit such a stock less well.`,
  },
  profit: {label: 'Makes a profit', help: 'Whether the company earned a profit per share over the past year. It made no difference in tests.'},
  debt: {label: 'Debt', help: 'What the company owes, as a multiple of what belongs to its owners (debt/equity). It made no difference in tests.'},
  pe: {
    label: 'Price for its profit (P/E)',
    help: 'The price as a multiple of the yearly profit per share, and where that stands in the stock\'s own range of the past 5 years. ' +
      'It made no difference in tests.',
  },
  target: {label: FACT_COLUMNS.target, help: FACT_HELP.target},
  rating: {label: 'Analyst rating', help: 'Analysts\' average rating, where 1 is the strongest "buy" and 5 the strongest "sell". It cannot be tested: there is no history of ratings.'},
  targetChange: {label: 'Target, last 3 weeks', help: 'How analysts\' middle price target moved since this page\'s reading of three weeks ago or more. It cannot be tested yet.'},
  owners: {label: FACT_COLUMNS.holders, help: FACT_HELP.holders},
  trend: {
    label: 'Against its 200-day average',
    help: 'How far the price is from its average of the past 200 days, and which way that average is going. In tests on stocks it was not found on, this did not help.',
  },
  results: {label: 'Next results', help: 'When the company reports its results next: the price may swing, and the report will change the growth numbers the mark rests on.'},
  bigDay: {
    label: 'Biggest one-day fall',
    help: 'The largest fall in one day since the stock\'s highest price of the past year; "none" when no day fell 4% or more, a gradual ' +
      'slide rather than one news event. The headlines of that week are in the stock\'s details.',
  },
};

/** The parts of the block and the rows of each, in order. "Context" is the word a stock's details use for the second. */
const PARTS: { title: string, note: string, rows: FactKey[] }[] = [
  {title: 'Tested', note: 'what the mark rests on, and what stocks that swing like it did in tests', rows: ['dropped', 'growing', 'swings', 'fell', 'bad', 'typical', 'good', 'beyond']},
  {title: 'Context', note: 'not part of the mark: no test could use it, or it made no difference', rows: ['profit', 'debt', 'pe', 'target', 'rating', 'targetChange', 'owners', 'trend', 'results']},
  {title: 'Why it dropped', note: '', rows: ['bigDay']},
];

/**
 * The rows that have a best value among the ticked stocks: which way is better, and the word for it.
 *
 * The owner, of the block: "highlight the winers so that it's easy to pick". Asked which rows, with what the tests
 * found for each, they chose these: the five where the tests say which way is better (all five follow from how
 * much the price swings, so stocks of one group differ in "Swings" only), and three of the context where the
 * reading is plain though no test backs it (the least debt, the highest target, the strongest rating).
 *
 * Left out on purpose, by the same choice: the rows where the tests found the plain reading wrong or of no use (a
 * cheaper price for the profit did worse; a deeper drop, the kind of growth, the owners in profit and the 200-day
 * average made no difference), and any count of wins a stock: that would rank the stocks, and no order among the
 * stocks marked DIP BUY held up in the tests. A row's winner is a fact about that row, not a pick.
 */
const BEST: Partial<Record<FactKey, { lower: boolean, word: string, tested: boolean }>> = {
  swings: {lower: true, word: 'lowest', tested: true},
  fell: {lower: true, word: 'fewest', tested: true},
  bad: {lower: true, word: 'mildest', tested: true},
  typical: {lower: false, word: 'highest', tested: true},
  good: {lower: false, word: 'highest', tested: true},
  debt: {lower: true, word: 'least', tested: false},
  target: {lower: false, word: 'highest', tested: false},
  rating: {lower: true, word: 'strongest', tested: false},
};

/**
 * For the explanations of the box the block stands in ("How to read this table"): what green and red are in the
 * block, and that the page counts neither. The names are the rows' own.
 */
export const COMPARE_NOTE = 'Where ticked stocks stand side by side, a figure in green is the best of them in its row: in the rows ' +
  `where the tests say which way is better ("${CASE_COLUMNS.swings}", "Fell a further 20%", the three cases) and in three rows of ` +
  `context where the reading is plain though no test backs it ("Debt", "${FACT_COLUMNS.target}", "Analyst rating"). ` +
  'A figure in red speaks against the stock. The page counts neither and names no pick.';

/** Said on the name of a context row that has a best value: the green is the row's best, not a tested reason. */
const UNTESTED_BEST = '; no test says that it is a reason to pick one.';

/**
 * The cells of a row with the best of them marked: every stock that shares the best figure as printed. None where
 * fewer than two figures are known or all are the same (there is nothing to be better than), and never a figure
 * that speaks against the stock. The stocks' own cells are left as they are: a marked cell is a copy.
 */
function withBest(cells: FactCell[], lower: boolean): FactCell[] {
  const figures = cells.flatMap(cell => cell.n === undefined ? [] : [cell.n]);
  if (figures.length < 2 || figures.every(n => n === figures[0])) {
    return cells;
  }
  const best = lower ? Math.min(...figures) : Math.max(...figures);
  return cells.map(cell => cell.n === best && !cell.against ? {...cell, best: true} : cell);
}

/**
 * The ticked stocks side by side: a column a stock in the order given, a row a fact, what was tested apart from
 * the context and from why the price dropped. A row no stock has a value for is left out, and so is a part
 * without rows. Nothing while no stock is ticked, or while the page knows no fact of the ticked ones.
 */
export function sideBySide(stocks: { symbol: string, case: StockCase | undefined }[]): Comparison | undefined {
  if (stocks.length === 0) {
    return undefined;
  }
  const several = stocks.length > 1;
  const parts = PARTS.map(part => ({
    title: part.title, note: part.note,
    rows: part.rows.filter(key => stocks.some(it => it.case?.facts[key])).map(key => {
      const said = stocks.map(it => it.case?.facts[key] ?? {value: '—'});
      const rule = BEST[key];
      const cells = rule ? withBest(said, rule.lower) : said;
      const help = rule && several ? `${ROWS[key].help} In green: the ${rule.word} of the ticked stocks${rule.tested ? '.' : UNTESTED_BEST}` : ROWS[key].help;
      return {key, label: ROWS[key].label, help, cells, same: several && cells.every(cell => cell.value === cells[0].value)};
    }),
  })).filter(part => part.rows.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  return {
    symbols: stocks.map(it => it.symbol),
    title: stocks.length === 1 ? `${stocks[0].symbol}, fact by fact` : `${stocks.length} ticked stocks, side by side`,
    parts,
  };
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
