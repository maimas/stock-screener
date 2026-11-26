import type {ChartData, MarketSnapshot, Stock, StockForecast} from "./microsoft-money.service";

/**
 * How the app asks MSN Finance for data: the request paths and how the answers are shaped. There is no Angular
 * in this file, on purpose: the page's service calls these paths through the dev proxy, and the daily recorder
 * (tools/recorder) calls the same paths straight from Node, so the two ask in exactly the same way and read the
 * answers in exactly the same way. Where each path is served from is in proxy.conf.json.
 */
export const API_KEY = "0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM";
/** The CBOE Volatility Index (VIX, the "fear index") and the S&P 500 ETF (SPY). */
export const VIX_ID = 'a33pk2';
export const SPY_ID = 'a23hqh';

const US_EXCHANGES = ['XNAS', 'XNYS', 'ARCX', 'BATS', 'XASE'];
const COMMON = 'ocid=finance-utils-peregrine&cm=en-us&it=web';

/**
 * MSN answers a multi-id request with a list, sometimes a list of lists, and with the bare item when only one
 * of the ids has data (e.g. the one company in a batch of funds). Treat all three the same.
 */
export function asList<T>(response: unknown): T[] {
  if (Array.isArray(response)) {
    return (response as unknown[]).flat(2).filter(it => !!it) as T[];
  }
  return response && typeof response === 'object' ? [response as T] : [];
}

/** The symbol search, which gives the provider's id for a symbol. */
export function stockIdPath(symbol: string): string {
  return `/contentservices-finance.csautosuggest/api/v1/Query?query=${symbol.toLowerCase()}&market=en-us&count=10`;
}

/**
 * The id for a symbol out of the search's answer. The search ranks loosely (e.g. "googl" returns GOOG first), so
 * take the exact symbol match, preferring US listings, and only fall back to the top result.
 */
export function pickStockId(symbol: string, response: any): string | undefined {
  const results = (response?.data?.stocks ?? []).map((raw: string) => JSON.parse(raw));
  const wanted = symbol.toUpperCase();
  const exact = results.filter((r: any) => (r.RT00S ?? r.OS001 ?? '').toUpperCase() === wanted);
  const us = exact.find((r: any) => US_EXCHANGES.includes(r.LS01Z));
  return (us ?? exact[0] ?? results[0])?.SecId;
}

/** Quotes, company details and analyst figures. */
export function quotesPath(ids: string[]): string {
  return `/service/Finance/QuoteSummary?apikey=${API_KEY}&activityId=693E0464-996A-4502-9C47-60D4B4BCFB81&${COMMON}&ids=${ids}&intents=Quotes,Exchanges,QuoteDetails&wrapodata=false`;
}

/** Earnings: reported quarters, the next report date and the forecasts. */
export function forecastsPath(ids: string[]): string {
  return `/service/Finance/Events/Earnings?apikey=${API_KEY}&activityId=71874343-94B6-42E5-9C25-CF434D937CED&${COMMON}&ids=${ids}&wrapodata=false`;
}

/** One year of daily prices (open/high/low/close/volume) per instrument. */
export function chartsPath(ids: string[]): string {
  return `/service/Finance/Charts?apikey=${API_KEY}&${COMMON}&ids=${ids}&type=1Y&wrapodata=false`;
}

/** Puts each earnings record on the stock it belongs to. */
export function attachForecasts(stocks: Stock[], response: unknown): Stock[] {
  asList<StockForecast>(response).forEach(forecast => {
    const stock = stocks.find(it => it.instrumentId === forecast?.InstrumentId);
    if (stock) {
      stock.forecast = forecast;
    }
  });
  return stocks;
}

/** Puts each price history on the stock it belongs to. */
export function attachCharts(stocks: Stock[], charts: ChartData[]): Stock[] {
  charts.forEach(chart => {
    const stock = stocks.find(it => it.instrumentId === chart?.instrumentId);
    if (stock && chart?.series) {
      stock.chart = chart.series;
    }
  });
  return stocks;
}

/** The market backdrop out of the quotes of the VIX and the S&P 500 fund. Fields are undefined when a quote is missing. */
export function marketOf(quotes: Stock[]): MarketSnapshot {
  const spy = quotes.find(it => it.instrumentId === SPY_ID)?.quote;
  return {
    vix: quotes.find(it => it.instrumentId === VIX_ID)?.quote?.price,
    spy: spy?.price,
    spyHigh52: spy?.price52wHigh,
  };
}
