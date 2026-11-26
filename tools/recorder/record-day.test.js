'use strict';
// Tests for the daily recorder. The data source is replaced by a stand-in that answers like MSN does; everything
// else is the real thing: the app's own TypeScript for the verdict, the lists and the log, and a storage in memory.
const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const {recordDay, localDay} = require('./record-day');
const {loadApp} = require('./app-code');
const {createMemoryStorage} = require('../store/storage-memory');

const app = loadApp();
const fixtures = require('../../src/app/watchlist/testing/fixtures.ts');
const NOW = fixtures.NOW;
const DAY = localDay(NOW);

/** A growing company 20% below its high (a DIP BUY), one at its high (a WATCH), and a fund (no verdict). */
function market() {
  const growing = {quarters: fixtures.reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120})};
  return [
    fixtures.makeStock({symbol: 'NVDA', price: 80, high52: 100, closes: fixtures.flatCloses(250, 80), ...growing}),
    fixtures.makeStock({symbol: 'AMD', price: 100, high52: 100, closes: fixtures.flatCloses(250, 100), ...growing}),
    fixtures.makeStock({symbol: 'COHR', price: 60, high52: 100, closes: fixtures.flatCloses(250, 60), ...growing}),
    fixtures.makeStock({symbol: 'SMH', price: 300, high52: 310}),
  ];
}

/** Answers like the data source does, from a list of stocks. `broken` makes one kind of request fail. */
function provider(stocks = market(), {broken} = {}) {
  const asked = [];
  const bySymbol = new Map(stocks.map(stock => [stock.quote.symbol, stock]));
  const byId = new Map(stocks.map(stock => [stock.instrumentId, stock]));
  const idsIn = url => /[?&]ids=([^&]*)/.exec(url)[1].split(',').filter(Boolean);
  const fetchJson = async url => {
    asked.push(url);
    if (broken && url.includes(broken)) {
      throw new Error('503 from the data source');
    }
    if (url.includes('csautosuggest')) {
      const stock = bySymbol.get(/query=([^&]*)/.exec(url)[1].toUpperCase());
      return {data: {stocks: stock ? [JSON.stringify({RT00S: stock.quote.symbol, LS01Z: 'XNAS', SecId: stock.instrumentId})] : []}};
    }
    if (url.includes('/Finance/QuoteSummary')) {
      return idsIn(url).map(id => {
        if (id === app.requests.VIX_ID) {
          return {instrumentId: id, quote: {price: 31.2}};
        }
        if (id === app.requests.SPY_ID) {
          return {instrumentId: id, quote: {price: 660.1, price52wHigh: 734.5}};
        }
        const stock = byId.get(id);
        return stock && {instrumentId: id, quote: stock.quote, equity: stock.equity};
      });
    }
    if (url.includes('/Finance/Events/Earnings')) {
      return idsIn(url).map(id => byId.get(id)).filter(stock => stock && stock.forecast).map(stock => ({InstrumentId: stock.instrumentId, ...stock.forecast}));
    }
    if (url.includes('/Finance/Charts')) {
      return idsIn(url).map(id => byId.get(id)).filter(stock => stock && stock.chart).map(stock => ({instrumentId: stock.instrumentId, series: stock.chart}));
    }
    throw new Error(`unexpected request: ${url}`);
  };
  return {fetchJson, asked};
}

const LISTS = {v: 1, lists: [{id: 'l1', title: 'CHIPS', symbols: ['NVDA', 'AMD']}, {id: 'l2', title: 'FUNDS', symbols: ['SMH']}]};
let storage;
const readJson = async key => (await storage.read(key)).value;
const writeJson = (key, value) => storage.write(key, value);
const quiet = () => undefined;

beforeEach(() => {
  storage = createMemoryStorage({watchlists: LISTS});
});

const run = (options = {}) => recordDay({storage, now: NOW, log: quiet, retryDelayMs: 0, ...provider(), ...options});

test('needs a storage to work on', async () => {
  await assert.rejects(() => recordDay({now: NOW, log: quiet}), /recordDay needs a storage/);
});

test('records today\'s price and verdict of every stock in your lists, with the S&P 500 and the VIX', async () => {
  const result = await run();
  assert.equal(result.ok, true);
  assert.equal(result.day, DAY);
  assert.equal(result.recorded, 3);
  const day = (await readJson('log')).days[DAY];
  assert.equal(day.spy, 660.1);
  assert.equal(day.vix, 31.2);
  assert.deepEqual(Object.keys(day.s).sort(), ['AMD', 'NVDA', 'SMH']);
  assert.equal(day.s.NVDA.p, 80);
  assert.equal(day.s.NVDA.v, 'D', 'a growing company 20% below its high is a DIP BUY');
  assert.equal(day.s.NVDA.r, 20, 'with its revenue growth');
  assert.equal(day.s.AMD.v, 'W', 'the same company at its high is a WATCH');
  assert.equal(day.s.SMH.v, '-', 'a fund has no verdict');
});

test('records exactly what the page would: the reading is the app\'s own', async () => {
  await run();
  const nvda = market()[0];
  assert.deepEqual((await readJson('log')).days[DAY].s.NVDA, app.snapshotOf(nvda, NOW));
});

test('also records the stocks you hold that are in none of your lists', async () => {
  await writeJson('portfolios', {v: 2, active: 'p1', portfolios: [{id: 'p1', name: 'Retirement', positions: {
    COHR: {symbol: 'COHR', shares: 2.5, price: 180.25}, NVDA: {symbol: 'NVDA', shares: 40, price: 150.5},
  }}]});
  const result = await run();
  assert.equal(result.recorded, 4);
  assert.deepEqual(Object.keys((await readJson('log')).days[DAY].s).sort(), ['AMD', 'COHR', 'NVDA', 'SMH']);
});

test('uses the starting lists until lists have been saved', async () => {
  const {fetchJson, asked} = provider();
  await run({storage: createMemoryStorage(), fetchJson});
  const lookedUp = asked.filter(url => url.includes('csautosuggest')).map(url => /query=([^&]*)/.exec(url)[1].toUpperCase());
  assert.deepEqual(lookedUp.sort(), app.allSymbols(app.defaultBook()).sort());
});

test('adds the day to the log that is there, keeping its other days and stocks', async () => {
  await writeJson('log', {v: 1, days: {'2026-11-20': {spy: 670, s: {NVDA: {p: 85, v: 'D'}}}, [DAY]: {s: {OLD: {p: 5, v: 'P'}}}}});
  await run();
  const log = await readJson('log');
  assert.deepEqual(log.days['2026-11-20'], {spy: 670, s: {NVDA: {p: 85, v: 'D'}}});
  assert.deepEqual(Object.keys(log.days[DAY].s).sort(), ['AMD', 'NVDA', 'OLD', 'SMH']);
  assert.deepEqual((await storage.previous('log')).value.days['2026-11-20'].s.NVDA, {p: 85, v: 'D'}, 'and the version it replaced is kept');
});

test('says which listed stocks had no quote, and still records the others', async () => {
  await writeJson('watchlists', {v: 1, lists: [{id: 'l1', title: 'CHIPS', symbols: ['NVDA', 'GONE']}]});
  const result = await run();
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, ['GONE']);
  assert.deepEqual(Object.keys((await readJson('log')).days[DAY].s), ['NVDA']);
});

test('leaves a record of the run for the page to show', async () => {
  await run();
  assert.deepEqual(await readJson('recorder-status'), {ranAt: NOW.toISOString(), ok: true, day: DAY, recorded: 3, missing: []});
});

test('fails loudly when the outcome of the run cannot be left, so whoever started it sees it', async () => {
  const storage = {...createMemoryStorage({watchlists: LISTS}), write: async () => { throw new Error('disk full'); }};
  await assert.rejects(() => recordDay({storage, fetchJson: provider().fetchJson, now: NOW, retryDelayMs: 0, log: quiet}), /disk full/);
  assert.deepEqual(Object.keys((await storage.read('log')).value.days[DAY].s).sort(), ['AMD', 'NVDA', 'SMH'], 'the day itself was merged first');
});

test('says so and writes its outcome when the log cannot be merged into', async () => {
  const storage = {...createMemoryStorage(), merge: async () => ({saved: false, damaged: true})};
  const result = await recordDay({storage, fetchJson: provider().fetchJson, now: NOW, retryDelayMs: 0, log: () => {}});
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be read/);
  const status = (await storage.read('recorder-status')).value;
  assert.equal(status.ok, false);
  assert.match(status.message, /could not be read/);
});

for (const [what, broken] of [['quotes', '/Finance/QuoteSummary'], ['earnings', '/Finance/Events/Earnings'], ['price history', '/Finance/Charts']]) {
  test(`records nothing when the ${what} do not come back: a day of half readings would break the log's DIP BUY runs`, async () => {
    const {fetchJson, asked} = provider(market(), {broken});
    const result = await run({fetchJson});
    assert.equal(result.ok, false);
    assert.match(result.message, /data source/);
    assert.equal((await readJson('log')), null);
    const status = await readJson('recorder-status');
    assert.equal(status.ok, false);
    assert.equal(status.day, DAY);
    assert.match(status.message, /data source/);
    assert.ok(asked.filter(url => url.includes(broken)).length >= 3, 'after trying three times');
  });
}

test('tries again when the data source fails once', async () => {
  const real = provider();
  let failures = 1;
  const fetchJson = async url => {
    if (url.includes('/Finance/Charts') && failures-- > 0) {
      throw new Error('503 from the data source');
    }
    return real.fetchJson(url);
  };
  const result = await run({fetchJson});
  assert.equal(result.ok, true);
  assert.equal(result.recorded, 3);
});

test('a dry run asks the data source and writes nothing', async () => {
  const result = await run({dryRun: true});
  assert.equal(result.ok, true);
  assert.equal(result.recorded, 3);
  assert.deepEqual(await storage.keys(), ['watchlists']);
});

test('loads the app\'s verdict code without loading Angular', () => {
  const loaded = Object.keys(require.cache).map(file => file.replace(/\\/g, '/'));
  assert.ok(loaded.some(file => file.endsWith('src/app/watchlist/signal.ts')), 'the verdict comes from the app');
  assert.deepEqual(loaded.filter(file => file.includes('@angular') || file.includes('microsoft-money.service')), []);
});
