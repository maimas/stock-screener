import {TestBed} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {MicrosoftMoneyService, Stock} from "./microsoft-money.service";

describe('MicrosoftMoneyService.getIndexHistory', () => {
  let service: MicrosoftMoneyService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(MicrosoftMoneyService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('returns the one-year daily prices of the S&P 500 fund', () => {
    let prices: number[] | undefined;
    service.getIndexHistory().subscribe(series => prices = series?.prices);
    http.expectOne(req => req.url.includes('/Finance/Charts') && req.url.includes('ids=a23hqh') && req.url.includes('type=1Y'))
      .flush([[{instrumentId: 'a23hqh', series: {prices: [750, 690], timeStamps: ['2026-11-19T05:00:00Z', '2026-11-20T05:00:00Z']}}]]);
    expect(prices).toEqual([750, 690]);
  });

  it('gives nothing, rather than an error, when the source does not answer', () => {
    spyOn(console, 'warn');   // the service reports the failure there; keep the test output clean
    let done = false, series: unknown = 'unset';
    service.getIndexHistory().subscribe(result => { series = result; done = true; });
    http.expectOne(req => req.url.includes('/Finance/Charts')).flush('down', {status: 503, statusText: 'Service Unavailable'});
    expect(done).toBe(true);
    expect(series).toBeUndefined();
  });
});

describe('MicrosoftMoneyService.getStocks', () => {
  let service: MicrosoftMoneyService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(MicrosoftMoneyService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the symbol lookups and the quote request for a list of [symbol, id] pairs. */
  function answerLookupsAndQuotes(pairs: [string, string][]): void {
    pairs.forEach(([symbol, id]) => {
      http.expectOne(req => req.url.includes('csautosuggest') && req.url.includes(`query=${symbol.toLowerCase()}`))
        .flush({data: {stocks: [JSON.stringify({RT00S: symbol, LS01Z: 'XNYS', SecId: id})]}});
    });
    http.expectOne(req => req.url.includes('/Finance/QuoteSummary'))
      .flush([pairs.map(([symbol, id]) => ({instrumentId: id, quote: {symbol, price: 100}}))]);
  }

  it('attaches the earnings data when the provider answers with one object instead of a list', () => {
    // What MSN does when only one symbol of the batch has earnings (BLK among six funds on 2026-11-21).
    let stocks: Stock[] = [];
    service.getStocks(['VGT', 'BLK']).subscribe(result => stocks = result);
    answerLookupsAndQuotes([['VGT', 'a25bf2'], ['BLK', 'a1om4c']]);
    http.expectOne(req => req.url.includes('/Finance/Events/Earnings'))
      .flush({InstrumentId: 'a1om4c', EpsForecast: 15.5, ExpectedReportDate: '2027-01-15T21:00:00Z'});
    http.expectOne(req => req.url.includes('/Finance/Charts')).flush([]);

    expect(stocks.find(it => it.quote.symbol === 'BLK')?.forecast?.EpsForecast).toBe(15.5);
    expect(stocks.find(it => it.quote.symbol === 'VGT')?.forecast).toBeUndefined();
  });

  it('attaches the price history when the provider answers with one chart instead of a list', () => {
    let stocks: Stock[] = [];
    service.getStocks(['BLK']).subscribe(result => stocks = result);
    answerLookupsAndQuotes([['BLK', 'a1om4c']]);
    http.expectOne(req => req.url.includes('/Finance/Events/Earnings')).flush([]);
    http.expectOne(req => req.url.includes('/Finance/Charts'))
      .flush({instrumentId: 'a1om4c', series: {prices: [1, 2, 3], timeStamps: ['a', 'b', 'c']}});

    expect(stocks[0].chart?.prices).toEqual([1, 2, 3]);
  });
});
