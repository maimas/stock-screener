import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {catchError, forkJoin, from, map, mergeMap, Observable, of, switchMap, tap, toArray} from 'rxjs';
import {
  API_KEY, asList, attachCharts, attachForecasts, chartsPath, forecastsPath, marketOf, pickStockId, quotesPath, SPY_ID,
  stockIdPath, VIX_ID
} from './msn-requests';

// The request paths and the shaping of the answers are in msn-requests.ts, shared with the daily recorder
// (tools/recorder), which asks for the same data without the page.

export type MarketSnapshot = { vix?: number, spy?: number, spyHigh52?: number };

@Injectable({
  providedIn: 'root'
})
export class MicrosoftMoneyService {
  apiKey = API_KEY;

  defaultHeaders = new HttpHeaders({
    'Content-Type': 'application/json;charset=UTF-8',
  });

  constructor(private http: HttpClient) {
  }

  getStockIds(symbols: string[]): Observable<string[]> {
    return forkJoin(symbols.map(symbol => this.getStockId(symbol).pipe(
      map(answer => pickStockId(symbol, answer) as string)
    )));
  }

  getStockId(symbol: string): Observable<any> {
    return this.http.get<any>(stockIdPath(symbol), {headers: this.defaultHeaders});
  }

  getKeyRatios(id: string): Observable<any> {
    const url = `/contentservices-finance.financedataservice/api/v1/KeyRatios?stockId=${id}`;
    return this.http.get<any>(url, {headers: this.defaultHeaders});
  }

  getForecasts(ids: string[]): Observable<StockForecast[]> {
    return this.http.get<any>(forecastsPath(ids), {headers: this.defaultHeaders});
  }

  /** One year of daily prices (open/high/low/close/volume) per instrument. */
  getCharts(ids: string[]): Observable<ChartData[]> {
    return this.http.get<unknown>(chartsPath(ids), {headers: this.defaultHeaders}).pipe(
      map(response => asList<ChartData>(response))
    );
  }

  getStocks(symbols: string[]): Observable<Stock[]> {
    return this.getStockIds(symbols).pipe(
      switchMap(ids => this.getQuotes(ids.filter(it => !!it))),
      switchMap(stocks => this.addForecastsToStocks(stocks)),
      switchMap(stocks => this.addChartsToStocks(stocks)),
      // switchMap(stocks => this.addStockKeyRatios(stocks))
    );
  }

  /**
   * The market backdrop: the CBOE Volatility Index (VIX, the "fear index") and the S&P 500 ETF (SPY).
   * Fields are undefined when the source does not answer; the page works without them.
   */
  getMarket(): Observable<MarketSnapshot> {
    return this.getQuotes([VIX_ID, SPY_ID]).pipe(
      map(quotes => marketOf(quotes)),
      catchError(error => {
        console.warn('Market data unavailable', error);
        return of({});
      })
    );
  }

  /** One year of daily closes of the S&P 500 ETF (SPY), to compare a position with the index since it was bought. */
  getIndexHistory(): Observable<ChartSeries | undefined> {
    return this.getCharts([SPY_ID]).pipe(
      map(charts => charts.find(it => it?.instrumentId === SPY_ID)?.series),
      catchError(error => {
        console.warn('S&P 500 history unavailable', error);
        return of(undefined);
      })
    );
  }

  /**
   * Google News RSS search between two days (inclusive of `from`, exclusive of `to`), served through the dev proxy
   * (/gnews). Personal, non-commercial feed-reader use, per Google's feed terms. Returns raw RSS XML, or '' on error.
   */
  getNewsRss(query: string, from: string, to: string): Observable<string> {
    const q = encodeURIComponent(`${query} after:${from} before:${to}`);
    return this.http.get(`/gnews/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, {responseType: 'text'}).pipe(
      catchError(error => {
        console.warn('News unavailable', error);
        return of('');
      })
    );
  }

  private getQuotes(ids: string[]): Observable<Stock[]> {
    return this.http.get<unknown>(quotesPath(ids), {headers: this.defaultHeaders}).pipe(
      map(response => asList<Stock>(response))
    );
  }

  /** Attaches earnings data (next report date, EPS forecast). Quotes still load if this call fails. */
  private addForecastsToStocks(stocks: Stock[]): Observable<Stock[]> {
    const ids = stocks.map(stock => stock.instrumentId).filter(it => !!it);
    if (ids.length === 0) {
      return of(stocks);
    }
    return this.getForecasts(ids).pipe(
      map(forecasts => attachForecasts(stocks, forecasts)),
      catchError(error => {
        console.warn('Earnings data unavailable', error);
        return of(stocks);
      })
    );
  }

  /** Attaches daily price history (used for trend and cost distribution). Quotes still load if this fails. */
  private addChartsToStocks(stocks: Stock[]): Observable<Stock[]> {
    const ids = stocks.map(stock => stock.instrumentId).filter(it => !!it);
    if (ids.length === 0) {
      return of(stocks);
    }
    return this.getCharts(ids).pipe(
      map(charts => attachCharts(stocks, charts)),
      catchError(error => {
        console.warn('Price history unavailable', error);
        return of(stocks);
      })
    );
  }

  // private addStockKeyRatios(stocks: Stock[]): Observable<Stock[]> {
  //   return from(stocks).pipe(
  //     mergeMap(stock => {
  //       if (!stock.equity) {
  //         return of(stock);
  //       }
  //       return this.getKeyRatios(stock.instrumentId).pipe(
  //         map(keyRatios => {
  //           stock.keyRatios = keyRatios;
  //           return stock;
  //         })
  //       )
  //     }),
  //     toArray()
  //   );
  // }
}

// getStocks(symbols: string[]): Observable<Stock[]> {
//   return this.getStockIds(symbols)
//     .pipe(switchMap(ids => {
//         const url = `/service/Finance/QuoteSummary?apikey=${this.apiKey}&activityId=693E0464-996A-4502-9C47-60D4B4BCFB81&ocid=finance-utils-peregrine&cm=en-us&it=web&ids=${ids}&intents=Quotes,Exchanges,QuoteDetails&wrapodata=false`;
//         return this.http.get<[][]>(url, {headers: this.defaultHeaders});
//       }
//     ))
//     .pipe(switchMap(response => {
//       const stocks = response.flat() as Stock[];
//       return of(stocks)
//     }))
//     .pipe(switchMap(stocks => {
//       const ids = stocks.map(it => it.instrumentId)
//       this.getForecast(ids).subscribe(data => {
//         console.log('forecast', data)
//         const stock = stocks.filter(it => it.instrumentId === data.instrumentId)[0]
//         stock.forecast = data;
//       })
//       return of(stocks)
//     }))
// }

// }

export type Stock = {
  instrumentId: string,
  quote: Quote,
  // exchange: any,
  equity: Equity
  forecast: StockForecast
  keyRatios: any
  /** Daily price history for the last year (attached separately from the quote). */
  chart?: ChartSeries
}

export type ChartSeries = {
  timeStamps: string[]
  openPrices: number[]
  prices: number[]       // closes
  pricesHigh: number[]
  pricesLow: number[]
  volumes: number[]
  startTime: string
  endTime: string
}

export type ChartData = {
  instrumentId: string
  symbol: string
  chartType: string
  series: ChartSeries
}


export type Quote = {
  price: number;
  priceChange: number;
  priceDayHigh: number;
  priceDayLow: number;
  timeLastTraded: string;
  priceDayOpen: number;
  pricePreviousClose: number;
  datePreviousClose: string;
  priceAsk: number;
  askSize: number;
  priceBid: number;
  bidSize: number;
  accumulatedVolume: number;
  averageVolume: number;
  peRatio: number;
  priceChangePercent: number;
  price52wHigh: number;
  price52wLow: number;
  pricePostMarket: number;
  priceChangePostMarket: number;
  priceChangePostMarketPercent: number;
  pricePreMarket: number;
  priceChangePreMarket: number;
  priceChangePreMarketPercent: number;
  priceClose: number;
  priceChange1Week: number;
  priceChange1Month: number;
  priceChange3Month: number;
  priceChange6Month: number;
  priceChangeYTD: number;
  priceChange1Year: number;
  return1Week: number;
  return1Month: number;
  return3Month: number;
  return6Month: number;
  returnYTD: number;
  return1Year: number;
  sourceExchangeCode: string;
  sourceExchangeName: string;
  icon: string;
  marketCap: number;
  marketCapCurrency: string;
  exchangeId: string;
  exchangeCode: string;
  exchangeName: string;
  offeringStatus: string;
  displayName: string;
  shortName: string;
  securityType: string;
  instrumentId: string;
  symbol: string;
  country: string;
  market: string;
  localizedAttributes: any;
  timeLastUpdated: string;
  currency: string;
  yieldPercent: number;
}

export type Equity = {
  analysis: Analysis,
  ownershipSummary: OwnershipSummary
  company: Company
}


export type  Analysis = {
  annualStatements: AnnualStatements;
  keyMetrics: KeyMetrics;
  estimate: Estimate;
  industryMetrics: Metrics;
  companyMetrics: Metrics;
  shareStatistics: ShareStatistics;
  beta: number;
  company: Company;
  relatedStocks: RelatedStock[];
  ownershipSummary: OwnershipSummary;
  optionChainMaturityDates: string[];
  securityDescription: string;
  assetCategory: string;
  assetClass: string;
  exchangeId: string;
  exchangeCode: string;
  exchangeName: string;
  offeringStatus: string;
  displayName: string;
  shortName: string;
  securityType: string;
  instrumentId: string;
  symbol: string;
  country: string;
  market: string;
  localizedAttributes: LocalizedAttributes;
  timeLastUpdated: string;
  currency: string;
}

interface RelatedStock {
  instrumentId: string;
  displayName: string;
  shortName: string;
  exchangeId: string;
  exchangeCode: string;
  securityType: string;
  symbol: string;
}

interface Entity {
  displayName: string;
  instrumentId?: string;
  shortName?: string;
  securityType?: string;
  symbol?: string;
}

interface Ownership {
  shares: number;
  sharesChange: number;
  rank: number;
  change: number;
  changePercent: number;
  entity: Entity;
  outstandingPercent: number;
  marketValue: number;
  reportDate: string;
}

export type OwnershipSummary = {
  floatOwnershipPercent: number;
  insiderOwnershipPercent: number;
  institutionalOwnership: Ownership[];
  institutionalOwnershipPercent: number;
  mutualFundOwnership: Ownership[];
  mutualFundOwnershipPercent: number;
  top10InstitutesPercent: number;
}

interface LocalizedAttributes {
  [key: string]: {
    displayName: string;
    description: string;
  };
}

interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  countryCode: string;
  phone: string;
  fax: string;
}

interface Director {
  asOfDate: string;
  name: string;
  title: string;
}

interface Company {
  address: Address;
  directors: Director[];
  description: string;
  employees: number;
  establishedYear: number;
  industry: string;
  name: string;
  sector: string;
  style: string;
  type: string;
  website: string;
  icon: string;
}

export type ShareStatistics = {
  lastSplitFactor: string;
  lastSplitDate: string;
  dividendYield: number;
  exDividendAmount: number;
  sharesOutstanding: number;
  enterpriseValue: number;
}

export type Metrics = {
  assetTurnover: number;
  averageGrossMargin5Year: number;
  averageNetProfitMargin5Year: number;
  averagePreTaxMargin5Year: number;
  bookValueShareRatio: number;
  currentRatio: number;
  debtEquityRatio: number;
  dividendYield: number;
  dividendYield5YearAverage: number;
  grossMargin: number;
  interestCoverage: number;
  inventoryTurnover: number;
  netIncomeQQLastYearGrowthRate: number;
  netIncomeYTDYTDGrowthRate: number;
  netProfitMargin: number;
  pEGrowthRatio: number;
  preTaxMargin: number;
  priceBookRatio: number;
  priceCashFlowRatio: number;
  priceSalesRatio: number;
  quickRatio: number;
  returnOnAsset5YearAverage: number;
  returnOnAssetCurrent: number;
  returnOnCapital5YearAverage: number;
  returnOnCapitalCurrent: number;
  returnOnEquity5YearAverage: number;
  returnOnEquityCurrent: number;
  revenueEmployee: number;
  revenueQQLastYearGrowthRate: number;
  revenueYTDYTD: number;
  receivableTurnover: number;
  leverageRatio: number;
  pE5YearHighRatio?: number;
  pE5YearLowRatio?: number;
  revenue5YearAverageGrowthRate?: number;
  debtAssetRatio?: number;
  revenue3YearAverage?: number;
  trailingAnnualDividendYield?: number;
  operatingCashFlow?: number;
  payoutRatio?: number;
  current?: number;
  dilutedEPS3YearGrowth?: number;
  operatingMargin?: number;
  netMarginPercent?: number;
  incomeEmployee?: number;
  roaTTM?: number;
}

interface Model {
  industryMetrics: Metrics;
  companyMetrics: Metrics;
}

export type AnalystRecommendation = {
  strongBuy: number;
  sell: number;
  hold: number;
  buy: number;
  underperform: number;
}

export type PriceVolatility = {
  high: number;
  aboveAverage: number;
  average: number;
  belowAverage: number;
  low: number;
}

export type  Estimate = {
  numberOfAnalysts: number;
  recommendationRate: number;
  recommendation: string;
  currency: string;
  numberOfPriceTargets: number;
  meanPriceTarget: number;
  highPriceTarget: number;
  lowPriceTarget: number;
  medianPriceTarget: number;
  medianEpsTarget: number;
  analystRecommendation: AnalystRecommendation;
  stdDeviationPriceTarget: number;
  meanEpsTarget: number;
  industryRecommendation: AnalystRecommendation;
  industryRecommendationRate: number;
  consensusIndustryRecommendation: string;
  priceVolatility: PriceVolatility;
  dateLastUpdated: string;
  industryDateLastUpdated: string;
  pricevolatilityDateLastUpdated: string;
}

export type  KeyMetrics = {
  bookValuePerShare: number;
  currentRatio: number;
  debtToEquityRatio: number;
  eps: number;
  forwardPriceToEPS: number;
  payoutRatio: number;
  priceToBookRatio: number;
  profitability: string;
  returnOnAssets: number;
  returnOnCapital: number;
  returnOnEquity: number;
  stockGrowth: number;
  latestRevenue: number;
  latestIncome: number;
  latestNetProfitMargin: number;
  latestRevenuePerShare: number;
}

export type  AnnualStatements = {
  [year: string]: {
    averagePE: number;
    bookValuePerShare: number;
    debtToEquityRatio: number;
    ebit: number;
    eps: number;
    netIncome: number;
    operatingIncome: number;
    netProfitMargin: number;
    priceToBookRatio: number;
    priceToSalesRatio: number;
    returnOnAssets: number;
    returnOnEquity: number;
    revenue: number;
    taxRate: number;
    depreciation: number;
    interestCoverage: number;
    assets: number;
    liabilities: number;
    longTermDebt: number;
    sharesOutstanding: number;
    currency: string;
    source: string;
    sourceDate: string;
    reportDate: string;
    endDate: string;
    fiscalYearEndMonth: number;
  };


}
//----------FORECAST TYPES-------------

type ForecastDetail = {
  EpsForecast: number;
  RevenueForecast: number;
  EarningReleaseDate?: string;
  EPSGAAPConsensusMedian: number;
  EPSNormalizedConsensusMedian: number;
  CiqFiscalPeriodType?: string;
  CalendarPeriodType?: string;
  PrimaryEPS: string;
}

type HistoryDetail = ForecastDetail & {
  EpsActual: number;
  EpsSurprise: number;
  EpsSurprisePercent: number;
  RevenueActual: number;
  RevenueSurprise: number;
  RevenueSurprisePercent: number;
  ForecastSource: string;
}

type Forecast = {
  annual: Record<string, ForecastDetail>;
  quarterly: Record<string, ForecastDetail>;
}

type History = {
  annual: Record<string, HistoryDetail>;
  /** Reported quarters, keyed by fiscal period (e.g. "202608"); used for point-in-time growth. */
  quarterly?: Record<string, HistoryDetail>;
}

type LastActual = HistoryDetail & {
  CiqFiscalPeriodType: string;
  CalendarPeriodType: string;
  EarningReleaseDate?: string;
}

export type StockForecast = {
  EpsLastYear: number;
  RevenueLastYear: number;
  Forecast: Forecast;
  History: History;
  FiscalPeriodType: number;
  FiscalPeriodEndDate: string;
  ExpectedReportDate: string;
  Timeslot: number;
  EpsForecast: number;
  RevenueForecast: number;
  LastActualFiscalPeriod: string;
  LastActual: LastActual;
  AssetCategory: string;
  CiqFiscalPeriodType: string;
  MarketCap: number;
  MarketCapSort: number;
  MarketCapCurrency: string;
  ExchangeId: string;
  ExchangeCode: string;
  OfferingStatus: number;
  DisplayName: string;
  ShortName: string;
  SecurityType: number;
  InstrumentId: string;
  Symbol: string;
  FriendlySymbol: string;
  Market: string;
  TimeLastUpdated: string;
  Currency: string;
  _p: string;
  id: string;
  _t: string;
  _ts: number;
}


