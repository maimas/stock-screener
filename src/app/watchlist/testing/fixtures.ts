import {ChartSeries, Stock} from "../../api/microsoft-money.service";

/** Fixed "today" for tests: Saturday 21 Nov 2026. */
export const NOW = new Date('2026-11-21T12:00:00Z');

export type Quarter = { release: string, eps: number | null, revenue: number };

/**
 * `count` reported quarters, oldest first, released 91 days apart and ending 30 days before NOW.
 * Revenue is `baseRevenue` for every quarter except the latest, which is `latestRevenue`
 * (so year-over-year revenue growth = latestRevenue / baseRevenue - 1).
 */
export function reportedQuarters(count: number, o: { eps?: number | null, baseRevenue?: number, latestRevenue?: number } = {}): Quarter[] {
  const last = NOW.getTime() - 30 * 86_400_000;
  return Array.from({length: count}, (_, i) => ({
    release: new Date(last - (count - 1 - i) * 91 * 86_400_000).toISOString(),
    eps: o.eps === undefined ? 1 : o.eps,
    revenue: i === count - 1 ? (o.latestRevenue ?? 100) : (o.baseRevenue ?? 100),
  }));
}

/** Daily closes, oldest first, all at `price`. */
export function flatCloses(bars: number, price = 100): number[] {
  return new Array<number>(bars).fill(price);
}

/**
 * Daily closes whose week-to-week change follows `weeklyReturns` in turn (repeating), ending at `bars` days.
 * Within a week the price does not move, so sampling every 5th close recovers exactly these returns.
 */
export function weeklyPattern(bars: number, weeklyReturns: number[], start = 100): number[] {
  const closes: number[] = [];
  let price = start;
  for (let i = 0; i < bars; i++) {
    // Counting from the end, a new week starts every 5 bars: bars-1, bars-6, ...
    if (i > 0 && (bars - 1 - i) % 5 === 4) {
      const week = Math.floor((i - 1) / 5);
      price *= 1 + weeklyReturns[week % weeklyReturns.length];
    }
    closes.push(price);
  }
  return closes;
}

export function chartOf(closes: number[], o: { volumes?: number[], endDay?: string } = {}): ChartSeries {
  const end = new Date(o.endDay ?? '2026-11-20T05:00:00Z').getTime();
  const timeStamps = closes.map((_, i) => new Date(end - (closes.length - 1 - i) * 86_400_000).toISOString());
  return {
    timeStamps,
    openPrices: [...closes],
    prices: [...closes],
    pricesHigh: [...closes],
    pricesLow: [...closes],
    volumes: o.volumes ?? closes.map(() => 1_000_000),
    startTime: timeStamps[0],
    endTime: timeStamps[timeStamps.length - 1],
  };
}

export type StockSpec = {
  symbol?: string
  price?: number
  high52?: number
  low52?: number
  quarters?: Quarter[]
  /** Consensus EPS for the next (unreported) quarter. */
  nextEps?: number
  closes?: number[]
  sector?: string
  /** The data provider's own growth figures (the app shows them only as context for young companies). */
  providerRevenueGrowth?: number
  providerEpsTtm?: number
  providerForwardEps?: number
  medianTarget?: number
  recommendationRate?: number
  /** Consensus revenue per forecast fiscal year, in dollars, e.g. {'2027': 5.0e9}. */
  annualRevenueForecast?: Record<string, number>
  /** When the analysts' figures were last updated (ISO date). */
  estimatesUpdated?: string
}

function annualForecast(revenue: Record<string, number> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.keys(revenue).forEach(year => out[year] = {RevenueForecast: revenue[year], EpsForecast: 1});
  return out;
}

/** A stock shaped like the MSN response, with only the fields the watchlist reads filled in. */
export function makeStock(o: StockSpec = {}): Stock {
  const quarterly: Record<string, unknown> = {};
  (o.quarters ?? []).forEach((q, i) => {
    quarterly[`q${String(i).padStart(3, '0')}`] = {
      EarningReleaseDate: q.release, EpsActual: q.eps, RevenueActual: q.revenue,
      EpsForecast: q.eps, RevenueForecast: q.revenue, EpsSurprise: 0, EpsSurprisePercent: 0,
      RevenueSurprise: 0, RevenueSurprisePercent: 0,
    };
  });
  const symbol = o.symbol ?? 'TEST';
  return {
    instrumentId: `id-${symbol}`,
    quote: {
      symbol, displayName: `${symbol} Inc`, shortName: symbol, securityType: 'stock',
      price: o.price ?? 100, price52wHigh: o.high52 ?? 100, price52wLow: o.low52 ?? 50,
    },
    equity: {
      company: {sector: o.sector ?? 'Technology', industry: 'Software'},
      analysis: {
        keyMetrics: {eps: o.providerEpsTtm},
        estimate: {
          meanEpsTarget: o.providerForwardEps, medianPriceTarget: o.medianTarget,
          recommendationRate: o.recommendationRate, numberOfPriceTargets: 10, numberOfAnalysts: 10,
          dateLastUpdated: o.estimatesUpdated,
        },
        companyMetrics: {revenueQQLastYearGrowthRate: o.providerRevenueGrowth},
        shareStatistics: {},
      },
      ownershipSummary: {},
    },
    forecast: o.quarters || o.annualRevenueForecast ? {
      History: {quarterly}, EpsForecast: o.nextEps ?? 1,
      Forecast: {annual: annualForecast(o.annualRevenueForecast), quarterly: {}},
    } : undefined,
    keyRatios: undefined,
    chart: o.closes ? chartOf(o.closes) : undefined,
  } as unknown as Stock;
}
