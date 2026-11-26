import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {catchError, Observable, switchMap, throwError} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebullService {
  defaultHeaders = new HttpHeaders({
    'app': 'global',
    'app-group': 'broker',
    'platform': 'web',
    'ver': '3.39.23'
  });

  constructor(private http: HttpClient) {
  }

  getTicker(symbol: string): Observable<WTicker> {
    const url = `/api/search/pc/tickers?keyword=${symbol}&pageIndex=1&pageSize=20`;
    return this.http.get<WTicker>(url, {headers: this.defaultHeaders});
  }

  getTickerQuote(symbol: string): Observable<WStockData> {
    return this.getTicker(symbol).pipe(
      switchMap((ticker: WTicker) => {
        const tickerData = ticker.data.find(it => it.symbol.toLowerCase() === symbol.toLowerCase());
        const url = `/api/stock/tickerRealTime/getQuote?tickerId=${tickerData?.tickerId}&includeSecu=1&includeQuote=1&more=1`;
        return this.http.get<WStockData>(url, {headers: this.defaultHeaders});
      }),
      catchError(error => {
        console.error(error);
        return throwError(error);
      })
    );
  };

  getTickerQuotes(symbol: string, period: 'd5' | 'm1' | 'm3' | 'y1' | 'y5'): Observable<WStockQuotes[]> {
    return this.getTicker(symbol).pipe(
      switchMap((ticker: WTicker) => {
        const tickerData = ticker.data.find(it => it.symbol.toLowerCase() === symbol.toLowerCase());
        const url = `/api/quote/charts/query?period=${period}&tickerIds=${tickerData?.tickerId}`;
        return this.http.get<WStockQuotes[]>(url, {headers: this.defaultHeaders});
      }),
      catchError(error => {
        console.error(error);
        return throwError(error);
      })
    );
  };

}

export type WTickerData = {
  tickerId: string,
  symbol: string
}

export type WTicker = {
  data: WTickerData[],
}

export type WStockData = {
  tickerId: number;
  exchangeId: number;
  type: number;
  secType: number[];
  regionId: number;
  regionCode: string;
  currencyId: number;
  name: string;
  symbol: string;
  disSymbol: string;
  disExchangeCode: string;
  exchangeCode: string;
  listStatus: number;
  template: string;
  derivativeSupport: number;
  isPTP: number;
  filingsSupport: number;
  futuresSupport: number;
  mkTradeTime: string;
  tradeTime: string;
  status: string;
  close: string;
  change: string;
  changeRatio: string;
  pPrice: string;
  pChange: string;
  pChRatio: string;
  marketValue: string;
  volume: string;
  turnoverRate: string;
  overnight: number;
  nBaSize: number;
  timeZone: string;
  tzName: string;
  preClose: string;
  open: string;
  high: string;
  low: string;
  vibrateRatio: string;
  avgVol10D: string;
  avgVol3M: string;
  negMarketValue: string;
  pe: string;
  forwardPe: string;
  indicatedPe: string;
  peTtm: string;
  eps: string;
  epsTtm: string;
  pb: string;
  totalShares: string;
  outstandingShares: string;
  fiftyTwoWkHigh: string;
  fiftyTwoWkLow: string;
  yield: string;
  baSize: number;
  ntvSize: number;
  currencyCode: string;
  lotSize: string;
  latestDividendDate: string;
  latestSplitDate: string;
  latestEarningsDate: string;
  ps: string;
  bps: string;
  estimateEarningsDate: string;
  tradeStatus: string;
  nextEarningDay: string;
  bboValve: number;
};

export type WStockQuotes = {
  tickerId: string,
  preClose: number,
  realPreClose: number,
  data: any;
}
