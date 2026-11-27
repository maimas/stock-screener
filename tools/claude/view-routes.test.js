'use strict';
// Run with: npm run test:tools
const {test, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const {createStoreServer} = require('../store/store-server');
const {createMemoryStorage} = require('../store/storage-memory');
const {localDay} = require('../store/day');
const {readerRoutes} = require('./reader-routes');
const {viewRoutes, oneAtATime} = require('./view-routes');

const NOW = new Date('2026-11-26T15:10:00.000Z');
const DAY = localDay(NOW);
const FIGURES = {seventh: {stocks: 202, profit: {mean: 9.3, median: 3.6}, market: {sp500: 10.2}}};
const stock = (symbol, facts = {mark: 'DIP BUY', belowHigh: 41.7}) => ({symbol, name: `${symbol} Corp`, facts});
const page = {title: 'Example Corp lowers its sales forecast', url: 'https://news.example.com/forecast'};
const answer = (view = 'WAIT') => ({
  ok: true, output: {view, short: 'Results due next week', why: 'It reports its results next week.', sources: [page]}, links: [page],
  model: 'claude-example-1', version: '9.9.9', costUsd: 0.1, seconds: 9.6,
});
const kept = (view = 'WAIT') => ({
  view, short: 'Results due next week', why: 'It reports its results next week.', sources: [page], asked: NOW.toISOString(),
  model: 'claude-example-1', version: '9.9.9',
});

let storage, server, base, runs, installed, running, mostAtOnce;

/** Stands in for Claude Code: notes each question and answers when the test says so. */
function start(options = {}) {
  const run = question => new Promise((resolve, reject) => {
    running++;
    mostAtOnce = Math.max(mostAtOnce, running);
    const end = settle => value => {
      running--;
      settle(value);
    };
    runs.push({question, resolve: end(resolve), reject: end(reject)});
  });
  const quiet = {log() {}, warn() {}};
  const store = createStoreServer({
    storage,
    routes: [
      viewRoutes({storage, available: () => installed, now: () => NOW, log: quiet, figures: FIGURES, retryMs: 1, run, ...options}),
      readerRoutes({storage, available: () => installed, now: () => NOW, log: quiet, run}),
    ],
  });
  return new Promise(resolve => store.listen(0, '127.0.0.1', () => resolve(store)));
}

beforeEach(async () => {
  storage = createMemoryStorage();
  runs = [];
  installed = true;
  running = 0;
  mostAtOnce = 0;
  server = await start();
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  server.close();
});

const get = (route = '/claude/views') => fetch(`${base}${route}`).then(async response => ({status: response.status, body: await response.json()}));
const post = body => fetch(`${base}/claude/views`, {
  method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body),
}).then(async response => ({status: response.status, body: await response.json()}));

/** Waits until Claude was asked `count` questions in all. */
async function asked(count) {
  for (let i = 0; i < 400 && runs.length < count; i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(runs.length, count, 'questions asked so far');
}

/** Asks until nothing is being asked any more. */
async function finished() {
  for (let i = 0; i < 400; i++) {
    const {body} = await get();
    if (!body.queue) {
      return body;
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('still asking');
}

test('has no views before anything was asked', async () => {
  assert.deepEqual(await get(), {status: 200, body: {store: 'watchlist', views: {}, failed: {}}});
});

test('asks about a list stock by stock, one run at a time, and keeps each answer under its day', async () => {
  const first = await post({list: [stock('ABCD'), stock('EFGH'), stock('IJKL')]});
  assert.deepEqual(first, {status: 202, body: {store: 'watchlist', state: 'asking', queue: {symbols: ['ABCD', 'EFGH', 'IJKL'], done: [], failed: {}}}});
  await asked(1);
  assert.match(runs[0].question, /^Stock: ABCD Corp \(ABCD\)\./);
  assert.match(runs[0].question, /202 stocks/, 'what the tests say is quoted from the recorded figures');
  assert.deepEqual((await get()).body.queue, {symbols: ['ABCD', 'EFGH', 'IJKL'], done: [], failed: {}});

  runs[0].resolve(answer('WAIT'));
  await asked(2);
  assert.deepEqual((await get()).body.queue.done, ['ABCD']);
  assert.deepEqual((await get()).body.views, {ABCD: {[DAY]: kept('WAIT')}}, 'a row fills in as soon as its answer is there');
  runs[1].resolve(answer('BUY SOME'));
  await asked(3);
  runs[2].resolve(answer('AVOID'));

  const end = await finished();
  assert.deepEqual(end, {store: 'watchlist', views: {ABCD: {[DAY]: kept('WAIT')}, EFGH: {[DAY]: kept('BUY SOME')}, IJKL: {[DAY]: kept('AVOID')}}, failed: {}});
  assert.equal(mostAtOnce, 1);
  assert.deepEqual((await storage.read('claude-views')).value, {v: 1, views: end.views});
});

test('a later answer of the same day replaces the earlier one, and another day is kept beside it', async () => {
  await storage.merge('claude-views', {v: 1, views: {ABCD: {'2026-11-01': kept('AVOID'), [DAY]: kept('AVOID')}}});
  await post({list: [stock('ABCD')]});
  await asked(1);
  runs[0].resolve(answer('BUY SOME'));
  assert.deepEqual((await finished()).views.ABCD, {'2026-11-01': kept('AVOID'), [DAY]: kept('BUY SOME')});
});

test('while a list is being asked about, another list is told to wait', async () => {
  await post({list: [stock('ABCD'), stock('EFGH')]});
  assert.deepEqual(await post({list: [stock('WXYZ')]}), {status: 429, body: {store: 'watchlist', state: 'busy'}});
  await asked(1);
  runs[0].resolve(answer());
  await asked(2);
  runs[1].resolve(answer());
  await finished();
  assert.equal(runs.length, 2, 'the list that was told to wait was never started');
  assert.equal((await post({list: [stock('WXYZ')]})).status, 202, 'and can be asked about once the first is through');
});

test('when Claude is busy with something else the stock waits and is asked again', async () => {
  await post({list: [stock('ABCD')]});
  await asked(1);
  runs[0].resolve({ok: false, reason: 'busy'});
  await asked(2);
  assert.equal(runs[1].question, runs[0].question);
  runs[1].resolve(answer());
  assert.deepEqual((await finished()).views, {ABCD: {[DAY]: kept()}});
});

test('a stock Claude stays busy for is given up, with the reason', async () => {
  server.close();
  server = await start({maxRetries: 2});
  base = `http://127.0.0.1:${server.address().port}`;
  await post({list: [stock('ABCD')]});
  for (let i = 0; i < 3; i++) {
    await asked(i + 1);
    runs[i].resolve({ok: false, reason: 'busy'});
  }
  assert.deepEqual(await finished(), {store: 'watchlist', views: {}, failed: {ABCD: 'busy'}});
  assert.equal(runs.length, 3, 'asked once and twice more');
});

test('a stock that failed does not stop the rest, and its reason stays until it is asked about again', async () => {
  await post({list: [stock('ABCD'), stock('EFGH'), stock('IJKL')]});
  await asked(1);
  runs[0].resolve({ok: false, reason: 'timeout'});
  await asked(2);
  runs[1].reject(new Error('the run broke'));
  await asked(3);
  runs[2].resolve({...answer(), output: {view: 'STRONG BUY', short: 'x', why: 'y', sources: []}});
  assert.deepEqual(await finished(), {store: 'watchlist', views: {}, failed: {ABCD: 'timeout', EFGH: 'failed', IJKL: 'no-answer'}});

  await post({list: [stock('ABCD')]});
  await asked(4);
  assert.deepEqual((await get()).body.failed, {EFGH: 'failed', IJKL: 'no-answer'});
  runs[3].resolve(answer());
  assert.deepEqual((await finished()).failed, {EFGH: 'failed', IJKL: 'no-answer'});
});

test('an answer that could not be kept is a failure, not a view', async () => {
  await post({list: [stock('ABCD')]});
  await asked(1);
  storage.merge = async () => {
    throw new Error('the database is gone');
  };
  runs[0].resolve(answer());
  assert.deepEqual((await finished()).failed, {ABCD: 'not-saved'});
});

test('refuses a list that is not one, and starts nothing', async () => {
  for (const bad of [{}, {list: []}, {list: [{symbol: 'abcd'}]}, {list: [stock('ABCD', {held: 'yes'})]}, {list: [stock('ABCD'), stock('ABCD')]}]) {
    const refused = await post(bad);
    assert.equal(refused.status, 400, JSON.stringify(bad));
    assert.equal(typeof refused.body.error, 'string');
  }
  assert.equal(runs.length, 0);
  assert.equal((await get()).body.queue, undefined);
});

test('says so when Claude Code cannot be reached, and starts nothing', async () => {
  installed = false;
  assert.deepEqual(await post({list: [stock('ABCD')]}), {status: 503, body: {store: 'watchlist', state: 'failed', reason: 'not-installed'}});
  assert.equal(runs.length, 0);
});

test('nothing reaches Claude but the stock, its figures and what the tests say', async () => {
  await post({list: [{...stock('ABCD'), shares: 12, portfolio: 'Mine'}], portfolio: 'Mine', cash: 777});
  await asked(1);
  assert.doesNotMatch(runs[0].question, /Mine|portfolio|cash|shares|777/i);
  runs[0].resolve(answer());
  await finished();
});

test('only GET and POST, and only on /claude/views', async () => {
  const put = await fetch(`${base}/claude/views`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: '{}'});
  assert.equal(put.status, 405);
});

test('the readings of why a stock fell are still answered beside the views', async () => {
  assert.deepEqual(await get('/claude/readings/ABCD'), {status: 200, body: {store: 'watchlist', state: 'none'}});
  assert.deepEqual((await get('/claude/status')).body, {store: 'watchlist', claude: true});
  assert.equal((await get('/claude/nothing')).status, 404);
});

test('oneAtATime lets one run through and tells any other it is busy', async () => {
  const gate = oneAtATime();
  let release;
  const slow = gate(() => new Promise(resolve => {
    release = resolve;
  }));
  const other = gate(async () => ({ok: true}));
  const first = slow('a');
  assert.deepEqual(await other('b'), {ok: false, reason: 'busy'});
  release({ok: true, output: 1});
  assert.deepEqual(await first, {ok: true, output: 1});
  assert.deepEqual(await other('b'), {ok: true}, 'free again once the first run ended');
  const failing = gate(async () => {
    throw new Error('broke');
  });
  await assert.rejects(failing('c'));
  assert.deepEqual(await other('d'), {ok: true}, 'and after a run that broke');
});

// The owner: "can the read it for me and AI view be combined?". What the AI finds about the stock's worst day is kept
// as the stock's reading, in the place and the shape "Why it dropped" already reads.
test('keeps what the AI found about the fall as the stock\'s reading', async () => {
  const fell = stock('ABCD', {mark: 'DIP BUY', bigDropDay: '2026-11-03', bigDropPercent: -12});
  await post({list: [fell]});
  await asked(1);
  runs[0].resolve({...answer(), output: {...answer().output, fall: {what: 'The company lowered its sales forecast', about: 'company', sources: [page]}}});
  await finished();
  assert.deepEqual((await storage.read('readings')).value, {v: 1, readings: {ABCD: {
    what: 'The company lowered its sales forecast.', about: 'company', sources: [page], readAt: NOW.toISOString(),
    day: '2026-11-03', percent: 12, model: 'claude-example-1', version: '9.9.9',
  }}});
  assert.deepEqual((await get('/claude/readings/ABCD')).body, {store: 'watchlist', state: 'done', reading: (await storage.read('readings')).value.readings.ABCD});
});

test('keeps no reading for a stock with no such day, for a fall the answer does not explain, or one it names no page for', async () => {
  const said = fall => ({...answer(), output: {...answer().output, fall}});
  await post({list: [stock('ABCD'), stock('EFGH', {bigDropDay: '2026-11-03', bigDropPercent: -12}), stock('IJKL', {bigDropDay: '2026-11-03', bigDropPercent: -12})]});
  await asked(1);
  runs[0].resolve(said({what: 'The company lowered its sales forecast', about: 'company', sources: [page]}));   // no day of a fall was given
  await asked(2);
  runs[1].resolve(said({what: '', about: 'none', sources: []}));
  await asked(3);
  // The view names a page, the fall names none: the view's page is about something else and is not borrowed.
  runs[2].resolve(said({what: 'It fell with the market', about: 'market', sources: []}));
  const end = await finished();
  assert.deepEqual(Object.keys(end.views), ['ABCD', 'EFGH', 'IJKL'], 'each view is kept');
  assert.equal((await storage.read('readings')).value, null);
});

test('a reading that could not be kept does not cost the view', async () => {
  await post({list: [stock('ABCD', {bigDropDay: '2026-11-03', bigDropPercent: -12})]});
  await asked(1);
  const merge = storage.merge;
  storage.merge = async (key, patch) => {
    if (key === 'readings') {
      throw new Error('the database is gone');
    }
    return merge(key, patch);
  };
  runs[0].resolve({...answer(), output: {...answer().output, fall: {what: 'The company lowered its sales forecast', about: 'company', sources: [page]}}});
  const end = await finished();
  assert.deepEqual(end.failed, {});
  assert.deepEqual(Object.keys(end.views), ['ABCD']);
});

test('quotes the tests in full in the question', async () => {
  server.close();
  server = await start({figures: {seventh: {stocks: 202, profit: {mean: 9.3, median: 3.6}, market: {sp500: 10.2}}, regime: {stocks: 424, fromYear: 1994, toYear: 2022, growing: 11, others: 13.5}}});
  base = `http://127.0.0.1:${server.address().port}`;
  await post({list: [stock('ABCD')]});
  await asked(1);
  assert.match(runs[0].question, /202 stocks/);
  assert.match(runs[0].question, /showed no advantage/);
  runs[0].resolve(answer());
  await finished();
});

// A reading the owner asked for on its own ("Read it for me") is a run made for that question alone: a view's
// by-product does not take its place.
test('leaves a reading of the same day as it is, and takes the place of a reading of another day', async () => {
  const own = {what: 'Asked for on its own.', about: 'company', sources: [page], readAt: '2026-11-20T10:00:00.000Z', day: '2026-11-03', percent: 12, model: 'm', version: '1'};
  const older = {...own, what: 'About an earlier fall.', day: '2026-07-01', percent: 17};
  await storage.merge('readings', {v: 1, readings: {ABCD: own, EFGH: older}});
  const fell = symbol => stock(symbol, {bigDropDay: '2026-11-03', bigDropPercent: -12});
  await post({list: [fell('ABCD'), fell('EFGH')]});
  for (let i = 0; i < 2; i++) {
    await asked(i + 1);
    runs[i].resolve({...answer(), output: {...answer().output, fall: {what: 'The company lowered its sales forecast', about: 'company', sources: [page]}}});
  }
  await finished();
  const kept = (await storage.read('readings')).value.readings;
  assert.deepEqual(kept.ABCD, own);
  assert.equal(kept.EFGH.day, '2026-11-03');
  assert.equal(kept.EFGH.what, 'The company lowered its sales forecast.');
});

// A run may take three minutes now; a stock that finds Claude busy with one waits that long and a little more.
test('waits for Claude to be free for as long as a run can take before it gives a stock up', async () => {
  server.close();
  server = await start({maxRetries: undefined});
  base = `http://127.0.0.1:${server.address().port}`;
  await post({list: [stock('ABCD')]});
  for (let i = 0; i < 38; i++) {
    await asked(i + 1);
    runs[i].resolve({ok: false, reason: 'busy'});
  }
  await asked(39);
  runs[38].resolve(answer());
  assert.deepEqual(Object.keys((await finished()).views), ['ABCD']);
});

// Seen on the page, and found by a review: a view that found no clear reason for the fall was kept as the stock's
// reading, and "Claude found no clear reason…" took the place of the headlines the page had found itself.
test('does not keep "no clear reason" from a view: what the page shows of the fall stays as it is', async () => {
  await post({list: [stock('ABCD', {bigDropDay: '2026-11-03', bigDropPercent: -12})]});
  await asked(1);
  runs[0].resolve({...answer(), output: {...answer().output, fall: {what: '', about: 'unclear', sources: []}}});
  await finished();
  assert.equal((await storage.read('readings')).value, null);
});

test('a view\'s reading takes the place of a kept "no clear reason" of that day, and never of a reading of a later day', async () => {
  const unclear = {what: '', about: 'unclear', sources: [], readAt: '2026-11-20T10:00:00.000Z', day: '2026-11-03', percent: 12, model: 'm', version: '1'};
  const later = {what: 'About a later fall.', about: 'market', sources: [page], readAt: '2026-11-25T10:00:00.000Z', day: '2026-11-24', percent: 9, model: 'm', version: '1'};
  await storage.merge('readings', {v: 1, readings: {ABCD: unclear, EFGH: later}});
  const fell = symbol => stock(symbol, {bigDropDay: '2026-11-03', bigDropPercent: -12});
  await post({list: [fell('ABCD'), fell('EFGH')]});
  for (let i = 0; i < 2; i++) {
    await asked(i + 1);
    runs[i].resolve({...answer(), output: {...answer().output, fall: {what: 'The company lowered its sales forecast', about: 'company', sources: [page]}}});
  }
  await finished();
  const kept = (await storage.read('readings')).value.readings;
  assert.equal(kept.ABCD.what, 'The company lowered its sales forecast.');
  assert.deepEqual(kept.EFGH, later, 'a page left open with older prices does not take a newer reading away');
});

test('keeps a sentence about the fall that had to be cut as it is: no full stop after its "…"', async () => {
  await post({list: [stock('ABCD', {bigDropDay: '2026-11-03', bigDropPercent: -12})]});
  await asked(1);
  const long = Array.from({length: 40}, (_, i) => `w${i + 1}`).join(' ');
  runs[0].resolve({...answer(), output: {...answer().output, fall: {what: long, about: 'company', sources: [page]}}});
  await finished();
  const what = (await storage.read('readings')).value.readings.ABCD.what;
  assert.ok(what.endsWith('w25…'), what);
});
