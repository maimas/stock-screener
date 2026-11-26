import {ChartSeries, Stock} from "../api/microsoft-money.service";

/* ------------------------------------------------------------------ */
/*  Trend: price vs the 200-day moving average                         */
/* ------------------------------------------------------------------ */

export type Trend = {
  ma50?: number
  ma200: number
  /** Current price vs the 200-day average, in %. */
  vs200Percent: number
  /** Change in the 200-day average over the last 20 trading days, in %. Positive = long-term trend rising. */
  ma200SlopePercent: number
  /**
   * "Intact" when the price is at or above its 200-day average. Display/context only: it looked predictive on the
   * tuning universe (+29.9% vs +13.1% for dips over 26 weeks) but showed no edge on two fresh universes
   * (validation: +0.5 pts vs every dip), so the Signal's verdict does not use it.
   */
  intact: boolean
}

const trendCache = new WeakMap<Stock, Trend | null>();

export function trendFor(stock: Stock): Trend | null {
  if (!trendCache.has(stock)) {
    trendCache.set(stock, computeTrend(stock));
  }
  return trendCache.get(stock)!;
}

function computeTrend(stock: Stock): Trend | null {
  const closes = cleanCloses(stock.chart);
  const price = stock.quote?.price;
  if (!isNum(price) || closes.length < 220) {
    return null;
  }
  const ma200 = sma(closes, 200, closes.length)!;
  const ma200Prev = sma(closes, 200, closes.length - 20)!;
  const slope = (ma200 / ma200Prev - 1) * 100;
  const vs200 = (price / ma200 - 1) * 100;
  return {
    ma50: sma(closes, 50, closes.length),
    ma200,
    vs200Percent: vs200,
    ma200SlopePercent: slope,
    intact: price >= ma200,
  };
}

function cleanCloses(series?: ChartSeries): number[] {
  return (series?.prices ?? []).filter(isNum);
}

function sma(values: number[], length: number, end: number): number | undefined {
  if (end < length) {
    return undefined;
  }
  let sum = 0;
  for (let i = end - length; i < end; i++) {
    sum += values[i];
  }
  return sum / length;
}

/* ------------------------------------------------------------------ */
/*  Cost distribution ("Positions Cost Distribution" / chip distribution) */
/* ------------------------------------------------------------------ */

/**
 * Estimates at what prices current holders bought, from the last year of daily prices and volume:
 * each day's volume is spread over that day's low–high range (peaking at the typical price), and
 * older holdings fade as shares change hands (daily turnover = volume ÷ float shares).
 * Checked against Webull for GOOGL on 2026-10-30: average cost 333 vs 336, holders in profit 2.4% vs 3.1%.
 */
export type CostDistribution = {
  /** Lowest price of the first bin. */
  low: number
  /** Width of each price bin. */
  step: number
  /** Share of holdings in each bin (sums to 1). */
  weights: number[]
  /** Volume-weighted average cost of current holders. */
  averageCost: number
  /** % of holdings bought below the current price (i.e. currently in profit). */
  profitRatio: number
  price: number
}

const BINS = 120;
const costCache = new WeakMap<Stock, CostDistribution | null>();

export function costDistributionFor(stock: Stock): CostDistribution | null {
  if (!costCache.has(stock)) {
    costCache.set(stock, computeCostDistribution(stock));
  }
  return costCache.get(stock)!;
}

function computeCostDistribution(stock: Stock): CostDistribution | null {
  const series = stock.chart;
  const price = stock.quote?.price;
  const shares = stock.equity?.analysis?.shareStatistics?.sharesOutstanding;
  if (!series || !isNum(price) || !isNum(shares) || shares <= 0) {
    return null;
  }
  const floatPercent = stock.equity?.ownershipSummary?.floatOwnershipPercent;
  const floatShares = shares * (isNum(floatPercent) && floatPercent > 0 && floatPercent <= 100 ? floatPercent / 100 : 1);

  const bars: { high: number, low: number, close: number, volume: number }[] = [];
  for (let i = 0; i < series.prices.length; i++) {
    const high = series.pricesHigh?.[i], low = series.pricesLow?.[i], close = series.prices[i], volume = series.volumes?.[i];
    if (isNum(high) && isNum(low) && isNum(close) && isNum(volume) && volume > 0 && high >= low) {
      bars.push({high, low, close, volume});
    }
  }
  if (bars.length < 60) {
    return null;
  }

  const low = Math.min(...bars.map(b => b.low));
  const high = Math.max(...bars.map(b => b.high));
  if (high <= low) {
    return null;
  }
  const step = (high - low) / BINS;
  let weights = new Array<number>(BINS).fill(0);

  for (const bar of bars) {
    const turnover = Math.min(1, bar.volume / floatShares);
    const keep = 1 - turnover;
    for (let i = 0; i < BINS; i++) {
      weights[i] *= keep;
    }
    // Triangular spread over the day's range, peaking at the typical price.
    const typical = (bar.high + bar.low + bar.close) / 3;
    const first = Math.max(0, Math.floor((bar.low - low) / step));
    const last = Math.min(BINS - 1, Math.floor((bar.high - low) / step));
    let total = 0;
    const dayWeights: number[] = [];
    for (let i = first; i <= last; i++) {
      const p = low + (i + 0.5) * step;
      let w: number;
      if (bar.high === bar.low) {
        w = 1;
      } else if (p <= typical) {
        w = typical > bar.low ? (p - bar.low) / (typical - bar.low) : 1;
      } else {
        w = bar.high > typical ? (bar.high - p) / (bar.high - typical) : 1;
      }
      w = Math.max(w, 0.0001);
      dayWeights.push(w);
      total += w;
    }
    dayWeights.forEach((w, k) => weights[first + k] += turnover * w / total);
  }

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return null;
  }
  weights = weights.map(w => w / sum);

  let averageCost = 0;
  let inProfit = 0;
  weights.forEach((w, i) => {
    const p = low + (i + 0.5) * step;
    averageCost += p * w;
    if (p <= price) {
      inProfit += w;
    }
  });

  return {low, step, weights, averageCost, profitRatio: inProfit * 100, price};
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/* ------------------------------------------------------------------ */
/*  Volatility: how widely the price swings                            */
/* ------------------------------------------------------------------ */

const MIN_WEEKLY_RETURNS = 40;
const volatilityCache = new WeakMap<Stock, number | null>();

/**
 * Annualised volatility in %, from the last year's weekly returns: every 5th daily close counted back from the
 * latest, population standard deviation, times the square root of 52. This is the backtests' `vol`
 * (tools/signal-backtest/quality_rules.py), so the validated 45% / 35% risk groups apply to it directly.
 * Null when the price history is missing or shorter than about 40 weeks.
 */
export function volatilityFor(stock: Stock): number | null {
  if (!volatilityCache.has(stock)) {
    volatilityCache.set(stock, computeVolatility(stock));
  }
  return volatilityCache.get(stock)!;
}

function computeVolatility(stock: Stock): number | null {
  const closes = cleanCloses(stock.chart);
  const weekly: number[] = [];
  for (let i = closes.length - 1; i >= 0; i -= 5) {
    weekly.unshift(closes[i]);
  }
  const returns: number[] = [];
  for (let i = 1; i < weekly.length; i++) {
    if (weekly[i - 1] > 0) {
      returns.push(weekly[i] / weekly[i - 1] - 1);
    }
  }
  if (returns.length < MIN_WEEKLY_RETURNS) {
    return null;
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(52) * 100;
}

/**
 * The close on a calendar day (YYYY-MM-DD), or on the last trading day before it. Undefined when the history
 * starts after that day or is missing. Daily bars are stamped with their US trading day.
 */
export function closeOnOrBefore(series: ChartSeries | undefined, day: string): number | undefined {
  if (!series?.prices || !series.timeStamps) {
    return undefined;
  }
  let close: number | undefined;
  const n = Math.min(series.prices.length, series.timeStamps.length);
  for (let i = 0; i < n; i++) {
    if (series.timeStamps[i].slice(0, 10) > day) {
      break;
    }
    if (isNum(series.prices[i])) {
      close = series.prices[i];
    }
  }
  return close;
}
