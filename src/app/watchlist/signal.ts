import {ChartSeries, Stock} from "../api/microsoft-money.service";
import {costDistributionFor, trendFor, volatilityFor} from "./market-math";
import {dipBuyHeadline, EVIDENCE, fearText, passHeadline, watchHeadline} from "./evidence";

/**
 * A buy-the-dip screen. The verdict uses only the rule that passed a pre-registered out-of-sample test, and the
 * texts state how thin that evidence has since turned out to be. Not financial advice.
 *
 * VERDICT:
 *    DIP BUY  ≥ 15% below the 52-week high AND growing
 *    WATCH    growing, but not a 15%+ dip yet
 *    PASS     not growing
 *    (none)   fewer than 8 reported quarters or under a year of prices: outside what the backtests covered
 *  "Growing" = EPS outlook ≥ 10% (next quarter's consensus + last 3 reported quarters vs the trailing 4)
 *              or revenue ≥ 15% (latest reported quarter vs the same quarter a year earlier).
 *
 * EVIDENCE: 26-week forward returns of dips with point-in-time fundamentals, on stock lists the rule was not
 *    built on. tools/signal-backtest/README.md has the tests and their history. No tested number is written in
 *    this file: the backtests record them, `npm run evidence` writes evidence.generated.ts, and evidence.ts turns
 *    them into the sentences shown here and in the row details.
 *
 * VALIDATED RISK AND HOLDING NOTES (pre-registered #5, fifth list; shown in the row details, not in the verdict):
 *    volatility: the more volatile DIP BUYs fell another 20%+ within 13 weeks more often   (PASS)
 *    a 20% stop-loss lowered the average result                                            (PASS)
 *    Tested and rejected: a deep-dip caution, a 20% dip threshold, and ranking DIP BUYs by earnings-backed vs
 *    revenue-only growth.
 *
 * VALIDATED HOLDING RULES (pre-registered #6 and #7, sixth and seventh lists; used by "Your plan today", not by
 * the verdict):
 *    selling at +25% lowered the average result                                            (PASS on both)
 *    a 20% stop lowered the average result                                                 (PASS again on the seventh)
 *    Tested and NOT used: keeping for weeks 26 to 52. It beat the S&P 500 on the sixth list (KEEP, narrowly) and
 *    not on the seventh (FAIL), so the plan keeps for 26 weeks and has no rule after that.
 *    Tested and NOT used: DIP BUYs that fell 25%+ in the 13 weeks before, first. It passed as written (a higher
 *    average), but inside one week those were ahead of the other DIP BUYs under half the time, which is what an
 *    order among one day's candidates needs. So there is still no order within a verdict.
 *
 * CONTEXT ONLY (not used in the verdict):
 *    200-day trend      — big edge in the tuning set, none out of sample (validation: +0.5 pts, P(no edge) = 41%)
 *    red flags          — losing money / debt > 2× equity: no edge in any universe
 *    P/E vs own history — "cheap" did worse than "normal" in every universe
 *    analyst upside / consensus — no history in these sources yet (the snapshot log is building it)
 *    holders in profit, last EPS surprise — no edge in the timing backtests
 */
export type SignalVerdict = 'DIP BUY' | 'WATCH' | 'PASS';

export type SignalFactor = {
  /** Context points (+ good, − bad). Not used in the verdict. */
  points: number
  reason: string
}

export type SignalResult = {
  verdict: SignalVerdict
  /** The validated inputs. */
  growing: boolean
  growthText: string
  belowHigh?: number
  /** Untested or unvalidated context: analysts, valuation, red flags. */
  factors: SignalFactor[]
  /** Timing context: dip, trend, holder cost, earnings. */
  notes: string[]
  /** One-line answer to "why this verdict?". */
  headline: string
  /** Annualised volatility of the last year's weekly returns, in %. */
  volatility?: number
  /**
   * DIP BUYs only: 'high' (VOL_HIGH or more a year) or 'low' (under VOL_LOW), the two groups whose chance of a
   * further 20% fall was validated on the fifth list. Unset in between and for other verdicts.
   */
  volatilityTier?: 'high' | 'low'
  /** DIP BUYs only: set when the stock is deeper or more volatile than 19 in 20 of the tested DIP BUYs. */
  rareInTests?: string
  /** The next earnings report is within two weeks: the price may swing and the growth inputs will change. */
  earningsSoon: boolean
  /** Days until that report (0 = today); set only when it is within two weeks. */
  earningsInDays?: number
  /** For sorting: DIP BUY highest, then WATCH, then PASS. Deliberately nothing finer: no ranking within a verdict has passed a test. */
  rank: number
}

export type Signal = SignalResult | null;

const MIN_ANALYSTS = 3;
export const DIP_PERCENT = 15;
/**
 * The backtests only judged companies with at least 8 reported quarters (EPS known for each) and 56 weeks of
 * prices (tools/signal-backtest/quality_rules.py). Younger companies get no verdict rather than an untested one.
 */
export const MIN_REPORTED_QUARTERS = 8;
/** About a year of daily prices: all the 1-year chart can show. */
export const MIN_PRICE_BARS = 240;
export const GROWTH_EPS_PERCENT = 10;
export const GROWTH_REVENUE_PERCENT = 15;
/**
 * Risk groups validated on the fifth list (pre-registered #5, H2), in % a year. Like DIP_PERCENT these are the
 * rule's own thresholds, so they are written here; evidence.spec.ts checks they are the ones the backtests used.
 */
export const VOL_HIGH = 45;
export const VOL_LOW = 35;
/** 95th percentiles among the tested DIP BUYs: measured by the backtests, so taken from their figures. */
export const TESTED_DEPTH_P95 = EVIDENCE.reach.depthP95;
export const TESTED_VOL_P95 = EVIDENCE.reach.volatilityP95;
const HIGH_DEBT_TO_EQUITY = 2;
const LOW_PROFIT_RATIO = 10;
const EARNINGS_WARNING_DAYS = 14;
/**
 * How the context line about analysts' price target begins, and the words the line about a stock's owners holds.
 * "Could add" shows the same two facts as short cells (stock-facts.ts) and finds their sentences by these.
 */
export const TARGET_CONTEXT = "Analysts' middle price target is ";
export const OWNERS_CONTEXT = '% of its owners are in profit';

/**
 * Market fear (CBOE VIX). Pre-registered test #3 (tools/signal-backtest/backtest_sentiment.py): on stocks not
 * used to find it, monthly dips from 1994 on, dips bought when the VIX closed the month at 25 or more did better
 * over 6 months than dips bought in calmer months, in both halves of the period. It is market-wide and rests on
 * a small number of fear episodes, so it is shown as market context, not mixed into each stock's verdict.
 * Geopolitical risk (GPR index) showed no pattern: not used. The numbers are in evidence.ts (`fearText`).
 */
export const VIX_HIGH = 25;

export type MarketFear = { vix: number, high: boolean, label: string, text: string };

export function marketFear(vix?: number): MarketFear | undefined {
  if (!isNum(vix) || vix <= 0) {
    return undefined;
  }
  const high = vix >= VIX_HIGH;
  return {
    vix, high,
    label: `Market fear ${high ? 'high' : 'normal'} (VIX ${vix.toFixed(1)})`,
    text: fearText(high),
  };
}

const VERDICT_RANK: Record<SignalVerdict, number> = {'DIP BUY': 2, 'WATCH': 1, 'PASS': 0};

const signalCache = new WeakMap<Stock, Signal>();

export function signalFor(stock: Stock): Signal {
  if (!signalCache.has(stock)) {
    signalCache.set(stock, computeSignal(stock));
  }
  return signalCache.get(stock)!;
}

export function computeSignal(stock: Stock, now: Date = new Date()): Signal {
  const price = stock.quote?.price;
  const growth = growthOutlook(stock, now);
  if (!isNum(price) || price <= 0 || !growth || !growth.tested) {
    return null; // e.g. ETFs (no earnings history) or a company too young for the tested rule
  }

  // ---- Validated inputs ----
  const growing = growth.growing;
  const growthText = [
    growth.epsOutlook !== undefined ? `expected profit per share ${signed(growth.epsOutlook)}%` : undefined,
    growth.revenueGrowth !== undefined ? `sales ${signed(growth.revenueGrowth)}% on a year ago` : undefined,
  ].filter(it => !!it).join(', ');
  const belowHigh = percentBelow52wHigh(stock);
  const dipped = belowHigh !== undefined && belowHigh >= DIP_PERCENT;

  // ---- Context (not used in the verdict) ----
  const factors: SignalFactor[] = [];
  const estimate = stock.equity?.analysis?.estimate;
  const median = estimate?.medianPriceTarget;
  if (isNum(median) && median > 0 && (estimate?.numberOfPriceTargets ?? 0) >= MIN_ANALYSTS) {
    const upside = ((median - price) / price) * 100;
    // Targets lag a fast fall: an upside figure means little without knowing how old the targets are.
    const updated = parseDate(estimate?.dateLastUpdated);
    const age = updated ? `last updated ${updated.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}; ` : '';
    // In everyday words, as every line of the context is: read by someone deciding about one stock who does not
    // know the trade's words ("upside", "median", "untestable").
    factors.push({points: upside >= 8 ? 1 : upside <= -5 ? -1 : 0,
      reason: `${TARGET_CONTEXT}${median.toFixed(2)} (${signed(upside)}% from here; ${age}cannot be tested: no history of targets)`});
  }
  const rate = estimate?.recommendationRate;
  if (isNum(rate) && rate > 0 && (estimate?.numberOfAnalysts ?? 0) >= MIN_ANALYSTS) {
    factors.push({points: rate <= 1.8 ? 1 : rate >= 3 ? -1 : 0,
      reason: `Analysts rate it ${rate.toFixed(2)} on average, where 1 is the strongest "buy" (${estimate!.numberOfAnalysts} analysts; cannot be tested)`});
  }
  const peRange = peFiveYearRange(stock);
  const pe = stock.quote?.peRatio;
  if (peRange && isNum(pe) && pe > 0) {
    const where = pe < peRange.low ? 'below' : pe > peRange.high ? 'above' : 'within';
    factors.push({points: where === 'above' ? -1 : 0,
      reason: `The price is ${pe.toFixed(1)} times the yearly profit per share (P/E): ${where} its range of the past 5 years, ` +
        `${peRange.low.toFixed(1)}–${peRange.high.toFixed(1)} (made no difference in tests)`});
  }
  const eps = stock.equity?.analysis?.keyMetrics?.eps;
  if (isNum(eps) && eps <= 0) {
    factors.push({points: -1, reason: `Not profitable: profit per share over the past year ${eps.toFixed(2)} (made no difference in tests)`});
  }
  const debt = debtToEquity(stock);
  if (debt !== undefined && debt > HIGH_DEBT_TO_EQUITY) {
    factors.push({points: -1,
      reason: `High debt: it owes ${debt.toFixed(2)} times what belongs to its owners (debt/equity; made no difference in tests)`});
  }

  const notes: string[] = [];
  const trend = trendFor(stock);
  if (trend) {
    const direction = trend.ma200SlopePercent >= 0 ? 'rising' : 'falling';
    notes.push(`The price is ${signed(trend.vs200Percent)}% from its average of the past 200 days (${trend.ma200.toFixed(2)}), ` +
      `and that average is ${direction}; context only: in tests on stocks it was not found on, this did not help`);
  }
  const cost = costDistributionFor(stock);
  if (cost) {
    const costVsPrice = (cost.averageCost / price - 1) * 100;
    notes.push(`${cost.profitRatio < LOW_PROFIT_RATIO ? "Most owners paid more than today's price: only " : ''}` +
      `${cost.profitRatio.toFixed(1)}${OWNERS_CONTEXT}; the average owner paid ${cost.averageCost.toFixed(2)} ` +
      `(${signed(costVsPrice)}% from here)`);
  }
  const last = lastEarnings(stock, now);
  const next = daysUntilEarnings(stock, now);
  const earningsSoon = next !== undefined && next <= EARNINGS_WARNING_DAYS;
  if (!earningsSoon && last && last.daysAgo !== undefined && last.daysAgo <= EARNINGS_WARNING_DAYS) {
    const result = last.surprisePercent === undefined ? '' :
      last.surprisePercent >= 0 ? ` (beat by ${last.surprisePercent.toFixed(1)}%)` : ` (missed by ${Math.abs(last.surprisePercent).toFixed(1)}%)`;
    const missed = last.surprisePercent !== undefined && last.surprisePercent < 0;
    notes.push(`Reported ${last.daysAgo} day${last.daysAgo === 1 ? '' : 's'} ago${result}` +
      (missed ? '; in the past, a stock that missed did not go on doing worse afterwards' : ''));
  }

  // ---- Verdict ----
  const dipText = belowHigh === undefined ? '' : `${belowHigh.toFixed(1)}% below its highest price of the past year`;
  let verdict: SignalVerdict;
  let headline: string;
  if (growing && dipped) {
    verdict = 'DIP BUY';
    headline = dipBuyHeadline(dipText);
  } else if (growing) {
    verdict = 'WATCH';
    headline = watchHeadline(dipText, DIP_PERCENT);
  } else {
    verdict = 'PASS';
    headline = passHeadline(GROWTH_EPS_PERCENT, GROWTH_REVENUE_PERCENT);
  }

  const volatility = volatilityFor(stock) ?? undefined;
  let volatilityTier: 'high' | 'low' | undefined;
  let rareInTests: string | undefined;
  if (verdict === 'DIP BUY') {
    if (volatility !== undefined) {
      volatilityTier = volatility >= VOL_HIGH ? 'high' : volatility < VOL_LOW ? 'low' : undefined;
    }
    const rare = [
      (belowHigh ?? 0) >= TESTED_DEPTH_P95 ? `this far below its high (${TESTED_DEPTH_P95}%+)` : undefined,
      (volatility ?? 0) >= TESTED_VOL_P95 ? `this volatile (${TESTED_VOL_P95}%+ a year)` : undefined,
    ].filter(it => !!it);
    if (rare.length) {
      rareInTests = `Only 1 in 20 tested DIP BUYs was ${rare.join(', and only 1 in 20 ')}, so the averages fit this case less well.`;
    }
  }

  return {
    verdict, growing, growthText, belowHigh, factors, notes, headline, volatility, volatilityTier, rareInTests,
    earningsSoon, earningsInDays: earningsSoon ? next : undefined,
    rank: VERDICT_RANK[verdict],
  };
}

/**
 * Growth exactly as backtested: from the quarterly earnings history (only quarters already reported).
 * `tested` is false when the company has less history than the backtests required; its numbers are then shown
 * as context only (for a very young company they come from the data provider's own metrics) and give no verdict.
 */
export type GrowthOutlook = { epsOutlook?: number, revenueGrowth?: number, growing: boolean, shrinking: boolean, tested: boolean }

export function growthOutlook(stock: Stock, now: Date = new Date()): GrowthOutlook | undefined {
  return growthFrom(stock, now, stock.forecast?.EpsForecast);
}

/**
 * The growth number a stock is marked on, in a word and a whole percentage: "profit +21%" when the profit per
 * share passes its test, "sales +27%" otherwise. For the short list of DIP BUYs, where two numbers a stock would
 * be too many; the Growth column shows both.
 */
export function growthChipText(growth: GrowthOutlook | undefined): string {
  const profit = growth?.epsOutlook, sales = growth?.revenueGrowth;
  const whole = (value: number) => `${Math.round(value) > 0 ? '+' : ''}${Math.round(value)}%`;
  if (profit !== undefined && profit >= GROWTH_EPS_PERCENT) {
    return `profit ${whole(profit)}`;
  }
  return sales === undefined ? '' : `sales ${whole(sales)}`;
}

/**
 * The growth figures on a day.
 *
 * @param nextEps the earnings forecast for the quarter that was next on that day: today's forecast for today, and
 *                for a past day the forecast the quarter after it was reported against
 */
function growthFrom(stock: Stock, now: Date, nextEps: number | undefined): GrowthOutlook | undefined {
  let epsOutlook: number | undefined;
  let revenueGrowth: number | undefined;
  const past = reportedQuarters(stock, now);
  if (past.length >= 5) {
    const eps = past.slice(-4).map(q => q.EpsActual);
    const ttm = eps.every(isNum) ? eps.reduce((a, b) => a + b, 0) : undefined;
    if (ttm !== undefined && ttm > 0 && isNum(nextEps)) {
      epsOutlook = ((nextEps + eps.slice(-3).reduce((a, b) => a + b, 0)) / ttm - 1) * 100;
    }
    const revNow = past[past.length - 1].RevenueActual, revYearAgo = past[past.length - 5].RevenueActual;
    if (isNum(revNow) && isNum(revYearAgo) && revNow > 0 && revYearAgo > 0) {
      revenueGrowth = (revNow / revYearAgo - 1) * 100;
    }
  } else {
    epsOutlook = epsGrowthPercent(stock);
    revenueGrowth = revenueGrowthPercent(stock);
  }
  if (epsOutlook === undefined && revenueGrowth === undefined) {
    return undefined;
  }
  return {
    epsOutlook, revenueGrowth,
    growing: (epsOutlook ?? -Infinity) >= GROWTH_EPS_PERCENT || (revenueGrowth ?? -Infinity) >= GROWTH_REVENUE_PERCENT,
    shrinking: epsOutlook !== undefined && epsOutlook <= -5 && (revenueGrowth ?? 0) < 5,
    tested: hasTestedHistory(stock, past),
  };
}

/**
 * Whether the stock was a DIP BUY on the day it was bought, at the price paid. The plan needs this for a holding,
 * because the tests held a DIP BUY for 26 weeks whatever the verdict became afterwards.
 *
 * It is judged the way the backtests judged a past day: growth from the quarters reported by then and the
 * earnings forecast for the quarter that was next then; the dip from the price paid against the highest price of
 * the year before.
 *
 * Undefined when it cannot be told: no prices on or before that day, too little reported history then, or a price
 * that was not a dip against the prices still in view when those do not go back a full year, because an older high
 * may be out of sight. A dip against the prices in view is a dip for certain: an older, higher high only deepens it.
 */
export function wasDipBuy(stock: Stock, day: string, pricePaid: number): boolean | undefined {
  const date = new Date(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(date.getTime()) || !isNum(pricePaid) || pricePaid <= 0) {
    return undefined;
  }
  const growth = growthFrom(stock, date, forecastOn(stock, date));
  if (!growth || !growth.tested) {
    return undefined;
  }
  if (!growth.growing) {
    return false;
  }
  const highs = highsOfYearBefore(stock.chart, day);
  if (highs.length === 0) {
    return undefined;
  }
  const high = Math.max(pricePaid, ...highs);
  if ((high - pricePaid) / high * 100 >= DIP_PERCENT) {
    return true;
  }
  return highs.length >= MIN_PRICE_BARS ? false : undefined;
}

/** The earnings forecast for the quarter that was next on that day: the one its report was later measured against. */
function forecastOn(stock: Stock, date: Date): number | undefined {
  const quarterly = stock.forecast?.History?.quarterly;
  const next = Object.keys(quarterly ?? {}).sort()
    .map(key => quarterly![key])
    .find(q => { const released = parseDate(q?.EarningReleaseDate); return !!released && released >= date; });
  return next ? next.EpsForecast : stock.forecast?.EpsForecast;
}

/** The highs of the trading days in the year up to and including that day, as far as the price history shows them. */
function highsOfYearBefore(series: ChartSeries | undefined, day: string): number[] {
  if (!series?.timeStamps) {
    return [];
  }
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const highs: number[] = [];
  series.timeStamps.forEach((stamp, i) => {
    const high = isNum(series.pricesHigh?.[i]) ? series.pricesHigh[i] : series.prices?.[i];
    if (stamp.slice(0, 10) >= from && stamp.slice(0, 10) <= day && isNum(high)) {
      highs.push(high);
    }
  });
  return highs;
}

/**
 * Sort value for the Signal column. Verdict first; inside a verdict the default (descending) order is A to Z,
 * because no finer ranking has passed a test. Undefined without a verdict.
 */
export function signalSortValue(signal: Signal, symbol: string): number | undefined {
  if (!signal) {
    return undefined;
  }
  // A fraction in [0, 1) that grows with alphabetical order (first four characters; letters before digits).
  let fraction = 0, scale = 1;
  for (const ch of symbol.toUpperCase().slice(0, 4)) {
    scale /= 37;
    const code = ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 64 : ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 21 : 0;
    fraction += code * scale;
  }
  return signal.rank + 1 - fraction;
}

export type NoVerdictReason = 'too-new' | 'no-data';

/** Why a stock has no verdict: too little history for the tested rule, or no usable earnings data at all. */
export function whyNoVerdict(stock: Stock, now: Date = new Date()): NoVerdictReason | undefined {
  if (computeSignal(stock, now)) {
    return undefined;
  }
  const quarters = reportedQuarters(stock, now).length;
  const young = quarters > 0 && quarters < MIN_REPORTED_QUARTERS;
  const shortPrices = quarters >= MIN_REPORTED_QUARTERS && tooFewPriceBars(stock);
  return young || shortPrices ? 'too-new' : 'no-data';
}

/** Quarters already reported, oldest first. */
function reportedQuarters(stock: Stock, now: Date) {
  const quarterly = stock.forecast?.History?.quarterly;
  return Object.keys(quarterly ?? {}).sort()
    .map(key => quarterly![key])
    .filter(q => { const d = parseDate(q?.EarningReleaseDate); return !!d && d < now; });
}

function hasTestedHistory(stock: Stock, past: { EpsActual: number }[]): boolean {
  return past.length >= MIN_REPORTED_QUARTERS
    && past.slice(-MIN_REPORTED_QUARTERS).every(q => isNum(q.EpsActual))
    && !tooFewPriceBars(stock);
}

/** True when the 1-year chart loaded and shows the stock has traded for less than about a year. */
function tooFewPriceBars(stock: Stock): boolean {
  const closes = stock.chart?.prices;
  return !!closes && closes.filter(isNum).length < MIN_PRICE_BARS;
}

/* ---------------- data helpers (also used by table columns) ---------------- */

/** Price ÷ analysts' mean EPS estimate. Undefined when the estimate is missing or not positive. */
export function forwardPE(stock: Stock): number | undefined {
  const price = stock.quote?.price;
  const forwardEps = stock.equity?.analysis?.estimate?.meanEpsTarget;
  if (!isNum(price) || !isNum(forwardEps) || forwardEps <= 0) {
    return undefined;
  }
  return price / forwardEps;
}

/** % change from trailing EPS to the analysts' mean EPS estimate (only when trailing EPS is positive). */
export function epsGrowthPercent(stock: Stock): number | undefined {
  const eps = stock.equity?.analysis?.keyMetrics?.eps;
  const forwardEps = stock.equity?.analysis?.estimate?.meanEpsTarget;
  if (!isNum(eps) || eps <= 0 || !isNum(forwardEps)) {
    return undefined;
  }
  return ((forwardEps - eps) / eps) * 100;
}

/** Latest quarter's revenue vs the same quarter a year earlier, in %. */
export function revenueGrowthPercent(stock: Stock): number | undefined {
  const value = stock.equity?.analysis?.companyMetrics?.revenueQQLastYearGrowthRate;
  return isNum(value) ? value : undefined;
}

/** Analysts' consensus revenue for the nearest forecast fiscal year, in $ millions. */
export function revenueConsensusMillions(stock: Stock): number | undefined {
  const annual = stock.forecast?.Forecast?.annual;
  const year = Object.keys(annual ?? {}).sort()[0];
  const revenue = year ? annual![year]?.RevenueForecast : undefined;
  return isNum(revenue) && revenue > 0 ? revenue / 1e6 : undefined;
}

/** Debt ÷ equity; undefined for missing or placeholder values (the API returns e.g. -1000 when unknown). */
export function debtToEquity(stock: Stock): number | undefined {
  return saneRatio(stock.equity?.analysis?.companyMetrics?.debtEquityRatio);
}

export function industryDebtToEquity(stock: Stock): number | undefined {
  return saneRatio(stock.equity?.analysis?.industryMetrics?.debtEquityRatio);
}

/** The P/E's 5-year low/high, when the API provides a real range (it sometimes repeats one value). */
export function peFiveYearRange(stock: Stock): { low: number, high: number } | undefined {
  const metrics = stock.equity?.analysis?.companyMetrics;
  const low = metrics?.pE5YearLowRatio, high = metrics?.pE5YearHighRatio;
  if (!isNum(low) || !isNum(high) || low <= 0 || high <= low * 1.2) {
    return undefined;
  }
  return {low, high};
}

/** How far the price is below its 52-week high, in % (0 = at the high). */
export function percentBelow52wHigh(stock: Stock): number | undefined {
  const price = stock.quote?.price;
  const high = stock.quote?.price52wHigh;
  if (!isNum(price) || !isNum(high) || high <= 0) {
    return undefined;
  }
  return Math.max(0, ((high - price) / high) * 100);
}

/** The next expected earnings report, or undefined if unknown or already past. */
export function nextEarningsDate(stock: Stock, now: Date = new Date()): Date | undefined {
  const date = parseDate(stock.forecast?.ExpectedReportDate);
  if (!date || startOfDay(date) < startOfDay(now)) {
    return undefined;
  }
  return date;
}

/** Whole calendar days until the next earnings report (0 = today). */
export function daysUntilEarnings(stock: Stock, now: Date = new Date()): number | undefined {
  const date = nextEarningsDate(stock, now);
  return date ? dayDiff(now, date) : undefined;
}

/** The most recent reported quarter: when, and how EPS compared with estimates. */
export function lastEarnings(stock: Stock, now: Date = new Date()): { date?: Date, daysAgo?: number, surprisePercent?: number } | undefined {
  const last = stock.forecast?.LastActual;
  if (!last) {
    return undefined;
  }
  const date = parseDate(last.EarningReleaseDate);
  const surprise = last.EpsSurprisePercent;
  return {
    date,
    daysAgo: date && date <= now ? dayDiff(date, now) : undefined,
    surprisePercent: isNum(surprise) ? surprise : undefined,
  };
}

function saneRatio(value: unknown): number | undefined {
  return isNum(value) && value >= 0 && value <= 50 ? value : undefined;
}

function parseDate(raw?: string): Date | undefined {
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  return isNaN(date.getTime()) ? undefined : date;
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function signed(value: number): string {
  const fixed = value.toFixed(1);
  // A change that rounds to nothing is "0.0", never "-0.0".
  // The true minus sign, as everywhere else on the page: a hyphen is shorter and stood beside it.
  return Number(fixed) === 0 ? '0.0' : `${Number(fixed) > 0 ? '+' : ''}${fixed.replace('-', '−')}`;
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
