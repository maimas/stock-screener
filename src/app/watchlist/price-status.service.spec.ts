import {latestQuoteTime, PriceStatusService} from "./price-status.service";
import {makeStock} from "./testing/fixtures";
import {Stock} from "../api/microsoft-money.service";

/** A stock whose quote says when it was last updated and when it last traded (ISO times), as the data source reports them. */
function quoted(symbol: string, times: { updated?: string, traded?: string }): Stock {
  const stock = makeStock({symbol});
  Object.assign(stock.quote, {timeLastUpdated: times.updated, timeLastTraded: times.traded});
  return stock;
}

describe('latestQuoteTime: how fresh the prices on the page are', () => {
  it('is the time of the newest price among the stocks', () => {
    const stocks = [
      quoted('AMD', {updated: '2026-11-20T21:00:00Z'}),
      quoted('NVDA', {updated: '2026-11-20T23:03:00Z'}),
      quoted('MU', {updated: '2026-11-20T22:10:00Z'}),
    ];
    expect(latestQuoteTime(stocks)?.toISOString()).toBe('2026-11-20T23:03:00.000Z');
  });

  it('takes the time of the last trade when the source gives no time of update', () => {
    expect(latestQuoteTime([quoted('AMD', {traded: '2026-11-20T21:00:00Z'})])?.toISOString()).toBe('2026-11-20T21:00:00.000Z');
  });

  it('leaves out a stock without a time, and is unknown when no stock has one', () => {
    expect(latestQuoteTime([quoted('AMD', {}), quoted('NVDA', {updated: '2026-11-20T23:03:00Z'})])?.toISOString())
      .toBe('2026-11-20T23:03:00.000Z');
    expect(latestQuoteTime([quoted('AMD', {})])).toBeUndefined();
    expect(latestQuoteTime([])).toBeUndefined();
  });
});

describe('PriceStatusService: what the top bar and the page tell each other about the prices', () => {
  it('passes a request to load the prices again on to the page, once for each request', () => {
    const status = new PriceStatusService();
    let asked = 0;
    status.reload$.subscribe(() => asked++);
    status.reload();
    status.reload();
    expect(asked).toBe(2);
  });
});
