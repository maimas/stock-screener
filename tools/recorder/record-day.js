#!/usr/bin/env node
'use strict';
/**
 * Records today's reading of every stock in your lists and holdings into the daily log, without the page.
 *
 *   npm run log:record               record now, inside the app's container
 *   npm run log:record -- --dry-run  ask the data source and show what would be recorded; write nothing
 *
 * The app runs it itself every weekday after the US market closes; this is for recording by hand.
 *
 * It does what the page does when it is opened: the same requests (src/app/api/msn-requests.ts), the app's own
 * verdict and reading (snapshot-log.ts, loaded by app-code.js), the same lists (the saved ones in the database, or
 * the starting lists) plus the stocks you hold (your saved portfolios). The day is merged into the log in the
 * database.
 *
 * Unlike the page, it records nothing when part of the data does not come back. A day of readings without
 * earnings data would show every stock without a verdict and break the log's DIP BUY runs, and nobody is
 * watching to notice. The outcome of each run is left in the database under recorder-status, which the page shows.
 */
const {loadApp} = require('./app-code');
const {openStorage} = require('../store/open-storage');
const {localDay} = require('../store/day');
const {providerUrl} = require('../server/provider-url');

const ATTEMPTS = 3;
/** Symbols looked up at the same time, and ids asked for in one request: about what one list on the page does. */
const LOOKUPS_AT_ONCE = 6;
const IDS_PER_REQUEST = 10;

async function fetchFromProvider(appPath) {
  const response = await fetch(providerUrl(appPath), {
    headers: {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'},
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`${response.status} from the data source`);
  }
  return response.json();
}

const chunks = (items, size) => Array.from({length: Math.ceil(items.length / size)}, (_, i) => items.slice(i * size, (i + 1) * size));

/** Every symbol the page would show: your lists (the starting ones until lists are saved) and your holdings. */
async function symbolsToRecord(app, storage) {
  const savedLists = (await storage.read('watchlists')).value;
  const lists = (savedLists && app.parseWatchlists(JSON.stringify(savedLists))) || app.defaultBook();
  const savedBook = (await storage.read('portfolios')).value;
  const book = savedBook && app.parseBook(JSON.stringify(savedBook));
  return [...new Set([...app.allSymbols(lists), ...(book ? app.symbolsHeld(book) : [])])];
}

/** Quotes with earnings and a year of prices attached, as the page loads them. Any request that fails, fails the lot. */
async function loadStocks(symbols, fetchJson, requests) {
  const ids = [];
  for (const group of chunks(symbols, LOOKUPS_AT_ONCE)) {
    ids.push(...await Promise.all(group.map(async symbol => requests.pickStockId(symbol, await fetchJson(requests.stockIdPath(symbol))))));
  }
  const stocks = [];
  for (const group of chunks(ids.filter(Boolean), IDS_PER_REQUEST)) {
    const batch = requests.asList(await fetchJson(requests.quotesPath(group)));
    requests.attachForecasts(batch, await fetchJson(requests.forecastsPath(group)));
    requests.attachCharts(batch, requests.asList(await fetchJson(requests.chartsPath(group))));
    stocks.push(...batch);
  }
  return stocks;
}

/** One attempt: the day's entry for the log, and which symbols had no reading. */
async function readDay(app, symbols, fetchJson, now) {
  const {requests} = app;
  const stocks = await loadStocks(symbols, fetchJson, requests);
  const market = requests.marketOf(requests.asList(await fetchJson(requests.quotesPath([requests.VIX_ID, requests.SPY_ID]))));
  const entry = {spy: market.spy, vix: market.vix, s: {}};
  stocks.forEach(stock => {
    const reading = stock.quote?.symbol && app.snapshotOf(stock, now);
    if (reading) {
      entry.s[stock.quote.symbol] = reading;
    }
  });
  if (Object.keys(entry.s).length === 0) {
    throw new Error('the data source returned no prices');
  }
  return {entry, missing: symbols.filter(symbol => !entry.s[symbol])};
}

/** Merges the day into the log in the database. The database merges one day at a time, so the app can write to the log meanwhile. */
async function writeDay(change, storage) {
  const result = await storage.merge('log', change);
  if (!result.saved) {
    throw new Error('the log could not be read, so nothing was added to it');
  }
}

/**
 * @param storage where the lists, holdings, log and the outcome of the run are kept (tools/store/storage-*.js)
 * @returns {{ok: boolean, day: string, recorded?: number, missing?: string[], message?: string}}
 */
async function recordDay({
  storage,
  fetchJson = fetchFromProvider, now = new Date(), dryRun = false, retryDelayMs = 30_000, log = console.log,
} = {}) {
  if (!storage) {
    throw new Error('recordDay needs a storage');
  }
  const day = localDay(now);
  let result;
  try {
    const app = loadApp();
    const symbols = await symbolsToRecord(app, storage);
    let reading, lastError;
    for (let attempt = 1; attempt <= ATTEMPTS && !reading; attempt++) {
      try {
        reading = await readDay(app, symbols, fetchJson, now);
      } catch (error) {
        lastError = error;
        if (attempt < ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    if (!reading) {
      throw new Error(`the data source did not answer (${lastError.message})`);
    }
    if (!dryRun) {
      await writeDay(app.dayChange(day, reading.entry), storage);
    }
    result = {ok: true, day, recorded: Object.keys(reading.entry.s).length, missing: reading.missing};
    log(`${dryRun ? 'Would record' : 'Recorded'} ${result.recorded} stocks for ${day}` +
      (result.missing.length ? `; no quote for ${result.missing.join(', ')}` : '') + (dryRun ? ' (dry run: nothing written)' : '') + '.');
  } catch (error) {
    result = {ok: false, day, message: error.message};
    log(`Nothing recorded for ${day}: ${error.message}.`);
  }
  if (!dryRun) {
    // Not caught: when the outcome cannot be left, the run must fail, so whoever started it sees it and the page
    // is not left showing an older run as if it were this one.
    await storage.write('recorder-status', {ranAt: now.toISOString(), ...result});
  }
  return result;
}

if (require.main === module) {
  openStorage().then(storage => recordDay({
    storage,
    dryRun: process.argv.includes('--dry-run'),
  })).then(result => process.exit(result.ok ? 0 : 1), error => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {recordDay, localDay};
