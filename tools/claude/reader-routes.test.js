'use strict';
// Run with: npm run test:tools
const {test, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const {createStoreServer} = require('../store/store-server');
const {createMemoryStorage} = require('../store/storage-memory');
const {readerRoutes} = require('./reader-routes');

const NOW = new Date('2026-11-22T21:10:00.000Z');
const asked = {symbol: 'ABCD', name: 'Example Corp', day: '2026-11-03', percent: 12};
const QUESTION = 'Stock: Example Corp (ABCD). Its price fell 12.0% on 2026-11-03, its biggest one-day fall since its highest price of the past ' +
  'year. Why did it fall that day?';
const page = {title: 'Example Corp lowers its sales forecast', url: 'https://news.example.com/forecast'};
const good = {
  ok: true, output: {what: 'The company lowered its sales forecast.', about: 'company', sources: [page]}, links: [page],
  model: 'claude-example-1', version: '9.9.9', costUsd: 0.1, seconds: 9.6,
};
const reading = {
  what: 'The company lowered its sales forecast.', about: 'company', sources: [page], readAt: '2026-11-22T21:10:00.000Z',
  day: '2026-11-03', percent: 12, model: 'claude-example-1', version: '9.9.9',
};

let storage, server, base, runs, installed, availability;

/** Stands in for Claude Code: notes each question and answers when the test says so. */
function start(kept = storage) {
  const store = createStoreServer({
    storage: kept,
    routes: [readerRoutes({
      storage: kept, available: () => availability(), now: () => NOW, log: {log() {}, warn() {}},
      run: question => new Promise((resolve, reject) => runs.push({question, resolve, reject})),
    })],
  });
  return new Promise(resolve => store.listen(0, '127.0.0.1', () => resolve(store)));
}

beforeEach(async () => {
  storage = createMemoryStorage();
  runs = [];
  installed = true;
  availability = () => installed;
  server = await start();
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  server.close();
});

const get = route => fetch(`${base}${route}`).then(async response => ({status: response.status, body: await response.json()}));
const post = (body, headers = {}) => fetch(`${base}/claude/readings`, {
  method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body),
}).then(async response => ({status: response.status, body: await response.json()}));
const stateOf = symbol => get(`/claude/readings/${symbol}`).then(answer => answer.body);

/** Asks until the stock is no longer being read. */
async function settled(symbol) {
  for (let i = 0; i < 200; i++) {
    const state = await stateOf(symbol);
    if (state.state !== 'reading') {
      return state;
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('still reading');
}

test('says whether Claude Code is installed on this computer', async () => {
  assert.deepEqual(await get('/claude/status'), {status: 200, body: {store: 'watchlist', claude: true}});
  installed = false;
  assert.deepEqual((await get('/claude/status')).body, {store: 'watchlist', claude: false});
});

test('has nothing for a stock that was never read', async () => {
  assert.deepEqual(await get('/claude/readings/ABCD'), {status: 200, body: {store: 'watchlist', state: 'none'}});
});

test('reads a stock when asked: says it is reading, then gives the reading and keeps it', async () => {
  assert.deepEqual(await post(asked), {status: 202, body: {store: 'watchlist', state: 'reading'}});
  assert.equal(runs.length, 1);
  assert.equal(runs[0].question, QUESTION);
  assert.deepEqual(await stateOf('ABCD'), {store: 'watchlist', state: 'reading'});

  runs[0].resolve(good);
  assert.deepEqual(await settled('ABCD'), {store: 'watchlist', state: 'done', reading});
  assert.deepEqual((await storage.read('readings')).value, {v: 1, readings: {ABCD: reading}});
});

test('a reading is still there after the app was restarted', async () => {
  await post(asked);
  runs[0].resolve(good);
  await settled('ABCD');
  server.close();
  server = await start(storage);
  base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await stateOf('ABCD'), {store: 'watchlist', state: 'done', reading});
});

test('asking twice for the same stock starts one run', async () => {
  await post(asked);
  assert.deepEqual(await post(asked), {status: 202, body: {store: 'watchlist', state: 'reading'}});
  assert.equal(runs.length, 1);
});

test('reads one stock at a time: another one is told to wait and is not started', async () => {
  await post(asked);
  assert.deepEqual(await post({...asked, symbol: 'WXYZ'}), {status: 429, body: {store: 'watchlist', state: 'busy'}});
  assert.equal(runs.length, 1);
  assert.deepEqual(await stateOf('WXYZ'), {store: 'watchlist', state: 'none'});
  runs[0].resolve(good);
  await settled('ABCD');
  assert.equal((await post({...asked, symbol: 'WXYZ'})).status, 202, 'and can be read once the first is done');
});

test('says why when a run did not work, and tries again when asked again', async () => {
  await post(asked);
  runs[0].resolve({ok: false, reason: 'timeout'});
  assert.deepEqual(await settled('ABCD'), {store: 'watchlist', state: 'failed', reason: 'timeout'});
  assert.equal((await storage.read('readings')).value, null, 'nothing is kept of a run that failed');

  assert.equal((await post(asked)).status, 202);
  assert.deepEqual(await stateOf('ABCD'), {store: 'watchlist', state: 'reading'});
  runs[1].resolve(good);
  assert.equal((await settled('ABCD')).state, 'done');
});

test('shows nothing when the answer names no page the search returned', async () => {
  await post(asked);
  runs[0].resolve({...good, links: []});
  assert.deepEqual(await settled('ABCD'), {store: 'watchlist', state: 'failed', reason: 'no-source'});
  assert.equal((await storage.read('readings')).value, null);
});

test('keeps the earlier reading when reading again fails', async () => {
  await post(asked);
  runs[0].resolve(good);
  await settled('ABCD');
  await post(asked);
  runs[1].reject(new Error('it broke'));
  assert.deepEqual(await settled('ABCD'), {store: 'watchlist', state: 'failed', reason: 'failed', reading});
});

test('says so when the reading cannot be kept, instead of showing one that would be gone tomorrow', async () => {
  const cannot = {
    'a value it cannot read': async () => ({saved: false, damaged: true}),
    'a database that does not answer': async () => { throw new Error('no connection'); },
  };
  for (const [why, merge] of Object.entries(cannot)) {
    server.close();
    storage = {...createMemoryStorage(), merge};
    server = await start(storage);
    base = `http://127.0.0.1:${server.address().port}`;
    runs = [];
    await post(asked);
    runs[0].resolve(good);
    assert.deepEqual(await settled('ABCD'), {store: 'watchlist', state: 'failed', reason: 'not-saved'}, why);
    assert.equal((await storage.read('readings')).value, null, 'and nothing is kept');
  }
});

test('refuses a request that is not about one stock and one day, without starting anything', async () => {
  for (const bad of [{...asked, symbol: 'abcd; rm -rf'}, {...asked, day: 'yesterday'}, {...asked, percent: 'a lot'}, [asked], 'ABCD']) {
    const answer = await post(bad);
    assert.equal(answer.status, 400, JSON.stringify(bad));
    assert.equal(typeof answer.body.error, 'string');
  }
  assert.equal((await post('{"symbol":')).status, 400);
  assert.equal((await post(asked, {'content-type': 'text/plain'})).status, 415);
  assert.equal(runs.length, 0);
});

test('waits for an answer to whether Claude Code is installed', async () => {
  availability = async () => false;
  assert.deepEqual(await get('/claude/status'), {status: 200, body: {store: 'watchlist', claude: false}});
  assert.equal((await post(asked)).status, 503);
  assert.equal(runs.length, 0);
});

test('starts nothing when Claude Code is not installed', async () => {
  installed = false;
  assert.deepEqual(await post(asked), {status: 503, body: {store: 'watchlist', state: 'failed', reason: 'not-installed'}});
  assert.equal(runs.length, 0);
});

test('a page of another site cannot start a run or see a reading', async () => {
  assert.equal((await post(asked, {origin: 'https://evil.example'})).status, 403);
  assert.equal((await post(asked, {'sec-fetch-site': 'cross-site'})).status, 403);
  assert.equal((await fetch(`${base}/claude/readings/ABCD`, {headers: {origin: 'https://evil.example'}})).status, 403);
  assert.equal(runs.length, 0);
});

test('answers only what it knows: the status, a stock\'s reading, and a request to read', async () => {
  assert.equal((await get('/claude/unknown')).status, 404);
  assert.equal((await get('/claude/readings/not a symbol')).status, 400);
  assert.equal((await get('/claude/readings')).status, 405, 'the list of readings is not handed out; a reading is asked for by its stock');
  assert.equal((await fetch(`${base}/claude/readings/ABCD`, {method: 'DELETE'}).then(response => response.status)), 405);
  assert.equal((await fetch(`${base}/claude/status`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'})).status, 405);
});

test('leaves the store itself as it was', async () => {
  assert.deepEqual(await get('/store/fresh'), {status: 200, body: {store: 'watchlist', value: null, lasting: false}});
  assert.equal((await get('/elsewhere')).status, 404);
});
