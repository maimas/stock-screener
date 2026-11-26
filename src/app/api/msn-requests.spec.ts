import {
  asList, attachCharts, attachForecasts, chartsPath, forecastsPath, marketOf, pickStockId, quotesPath, SPY_ID, stockIdPath, VIX_ID
} from "./msn-requests";
import {ChartData, Stock} from "./microsoft-money.service";

const found = (...rows: object[]) => ({data: {stocks: rows.map(row => JSON.stringify(row))}});
const stock = (id: string, symbol: string, price = 100) => ({instrumentId: id, quote: {symbol, price}}) as unknown as Stock;

describe('asList (the three shapes the provider answers in)', () => {
  it('takes a list, a list of lists, and a bare item when only one id had data', () => {
    expect(asList([{a: 1}, {a: 2}])).toEqual([{a: 1}, {a: 2}]);
    expect(asList([[{a: 1}], [{a: 2}]])).toEqual([{a: 1}, {a: 2}]);
    expect(asList({a: 1})).toEqual([{a: 1}]);
  });

  it('drops empty entries and gives an empty list for no answer', () => {
    expect(asList([null, {a: 1}, undefined])).toEqual([{a: 1}]);
    expect(asList(null)).toEqual([]);
    expect(asList('down')).toEqual([]);
  });
});

describe('the requests', () => {
  it('looks a symbol up in lower case', () => {
    expect(stockIdPath('GOOGL')).toBe('/contentservices-finance.csautosuggest/api/v1/Query?query=googl&market=en-us&count=10');
  });

  it('asks for quotes, earnings and a year of daily prices for several ids at once', () => {
    expect(quotesPath(['a1', 'b2'])).toContain('/service/Finance/QuoteSummary?');
    expect(quotesPath(['a1', 'b2'])).toContain('&ids=a1,b2&intents=Quotes,Exchanges,QuoteDetails');
    expect(forecastsPath(['a1', 'b2'])).toContain('/service/Finance/Events/Earnings?');
    expect(forecastsPath(['a1', 'b2'])).toContain('&ids=a1,b2&');
    expect(chartsPath(['a1', 'b2'])).toContain('/service/Finance/Charts?');
    expect(chartsPath(['a1', 'b2'])).toContain('&ids=a1,b2&type=1Y');
  });
});

describe('pickStockId', () => {
  it('takes the exact symbol, not the first result: the search ranks loosely', () => {
    const answer = found({RT00S: 'GOOG', LS01Z: 'XNAS', SecId: 'goog'}, {RT00S: 'GOOGL', LS01Z: 'XNAS', SecId: 'googl'});
    expect(pickStockId('GOOGL', answer)).toBe('googl');
  });

  it('prefers the US listing of that symbol', () => {
    const answer = found({RT00S: 'SHOP', LS01Z: 'XTSE', SecId: 'toronto'}, {RT00S: 'SHOP', LS01Z: 'XNYS', SecId: 'newyork'});
    expect(pickStockId('shop', answer)).toBe('newyork');
  });

  it('falls back to the first result when no symbol matches exactly, and to nothing when there is none', () => {
    expect(pickStockId('BRK.B', found({RT00S: 'BRK-B', LS01Z: 'XNYS', SecId: 'brk'}))).toBe('brk');
    expect(pickStockId('ZZZZ', found())).toBeUndefined();
    expect(pickStockId('ZZZZ', undefined)).toBeUndefined();
  });
});

describe('attachForecasts and attachCharts', () => {
  it('puts each earnings record on the stock with that id, whatever shape the answer has', () => {
    const stocks = attachForecasts([stock('a1', 'AAA'), stock('b2', 'BBB')], {InstrumentId: 'b2', EpsForecast: 1.5});
    expect(stocks[0].forecast).toBeUndefined();
    expect(stocks[1].forecast.EpsForecast).toBe(1.5);
  });

  it('puts each price history on the stock with that id and skips charts without prices', () => {
    const series = {prices: [1, 2, 3]} as unknown as ChartData['series'];
    const charts = [{instrumentId: 'a1', series}, {instrumentId: 'b2'}] as ChartData[];
    const stocks = attachCharts([stock('a1', 'AAA'), stock('b2', 'BBB')], charts);
    expect(stocks[0].chart).toBe(series);
    expect(stocks[1].chart).toBeUndefined();
  });
});

describe('marketOf', () => {
  it('reads the VIX and the S&P 500 fund out of their quotes', () => {
    const quotes = [stock(VIX_ID, 'VIX', 31.2), {instrumentId: SPY_ID, quote: {price: 660.1, price52wHigh: 734.5}} as unknown as Stock];
    expect(marketOf(quotes)).toEqual({vix: 31.2, spy: 660.1, spyHigh52: 734.5});
  });

  it('leaves out what did not come back', () => {
    expect(marketOf([])).toEqual({vix: undefined, spy: undefined, spyHigh52: undefined});
  });
});
