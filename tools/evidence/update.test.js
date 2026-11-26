'use strict';
// Tests for the command that re-runs the backtests and updates the app's numbers. The backtests themselves are
// replaced by a stand-in here: what is tested is that nothing is replaced unless everything succeeded.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {update, sendStatus, statusUrl, afterUpdate, RERUN_SCRIPTS, REFRESH_SCRIPTS, REFRESHED_DATA} = require('./update');
const {toFigures} = require('./figures');
const {recorded} = require('./testing/recorded');

let dir, paths;

test.beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  paths = {
    tools: path.join(dir, 'tools'),
    figures: path.join(dir, 'tools', 'quoted_figures.json'),
    generated: path.join(dir, 'app', 'evidence.generated.ts'),
  };
  fs.mkdirSync(paths.tools, {recursive: true});
  fs.mkdirSync(path.dirname(paths.generated), {recursive: true});
  [...new Set([...RERUN_SCRIPTS, ...REFRESH_SCRIPTS]), 'quality_rules.py'].forEach(name => fs.writeFileSync(path.join(paths.tools, name), `# ${name}\n`));
  REFRESHED_DATA.forEach(name => fs.writeFileSync(path.join(paths.tools, name), 'old data'));
  fs.writeFileSync(path.join(paths.tools, 'monthly_cache.json'), 'long history');
  fs.writeFileSync(paths.figures, JSON.stringify(recorded(), null, 2));
  fs.writeFileSync(paths.generated, '// old generated file\n');
});

test.afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

const read = file => fs.readFileSync(file, 'utf8');
const readJson = file => JSON.parse(read(file));
const NOW = new Date('2026-12-21T18:00:00Z');

/** Stands in for the backtests: records each call and lets a test change what the scripts "measure". */
function backtests(change = () => undefined) {
  const calls = [];
  const run = (script, cwd, figuresFile) => {
    calls.push({script, cwd});
    const figures = fs.existsSync(figuresFile) ? readJson(figuresFile) : {};
    change(figures, script, cwd);
    fs.writeFileSync(figuresFile, JSON.stringify(figures, null, 2));
  };
  return {run, calls};
}

const quiet = () => undefined;

test('a re-run runs the four backtests where the data is and updates the figures, the generated module and the status', () => {
  const {run, calls} = backtests((figures, script) => {
    if (script === 'backtest_summary.py') {
      figures.summary.dipBuy.mean = 11.64;
    }
  });
  const result = update({paths, run, log: quiet, now: NOW});

  assert.deepEqual(calls.map(it => it.script), RERUN_SCRIPTS);
  assert.ok(calls.every(it => it.cwd === paths.tools));
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes, ['dipBuy.mean: 12.1 → 11.6']);
  assert.equal(readJson(paths.figures).summary.dipBuy.mean, 11.64);
  assert.match(read(paths.generated), /GENERATED/);
  assert.match(read(paths.generated), /dipBuy: \{mean: 11\.6,/);
  assert.deepEqual(result.status, {
    ranAt: '2026-12-21T18:00:00.000Z', refreshed: false, ok: true, updated: true,
    changes: ['dipBuy.mean: 12.1 → 11.6'], blocking: [], notes: [],
  });
});

test('a re-run that measures the same leaves the same files and says nothing was updated', () => {
  const {run} = backtests();
  update({paths, run, log: quiet, now: NOW});            // brings the generated module up to date
  const generated = read(paths.generated);
  const result = update({paths, run, log: quiet, now: NOW});
  assert.equal(result.ok, true);
  assert.equal(result.updated, false);
  assert.deepEqual(result.changes, []);
  assert.equal(read(paths.generated), generated);
});

test('when a statement the app makes no longer holds, nothing is replaced and the status says why', () => {
  const before = {figures: read(paths.figures), generated: read(paths.generated)};
  const {run} = backtests((figures, script) => {
    if (script === 'backtest_validation3.py') {
      figures.fresh.verdicts.H3 = 'FAIL';
    }
  });
  const result = update({paths, run, log: quiet, now: NOW});

  assert.equal(result.ok, false);
  assert.match(result.blocking[0], /H3/);
  assert.equal(read(paths.figures), before.figures);
  assert.equal(read(paths.generated), before.generated);
  const status = result.status;
  assert.equal(status.ok, false);
  assert.equal(status.updated, false);
  assert.match(status.blocking[0], /H3/);
});

test('when a backtest fails, nothing is replaced and the status carries the error', () => {
  const before = {figures: read(paths.figures), generated: read(paths.generated)};
  const run = script => {
    if (script === 'backtest_regime.py') {
      throw new Error('backtest_regime.py failed: no network');
    }
  };
  const result = update({paths, run, log: quiet, now: NOW});

  assert.equal(result.ok, false);
  assert.match(result.blocking[0], /no network/);
  assert.equal(read(paths.figures), before.figures);
  assert.equal(read(paths.generated), before.generated);
  assert.equal(result.status.ok, false);
});

test('a dry run reports what would change and writes nothing at all', () => {
  const before = {figures: read(paths.figures), generated: read(paths.generated)};
  const {run} = backtests(figures => figures.summary.dipBuy.mean = 11.64);
  const result = update({paths, run, log: quiet, now: NOW, dryRun: true});

  assert.equal(result.ok, true);
  assert.deepEqual(result.changes, ['dipBuy.mean: 12.1 → 11.6']);
  assert.equal(read(paths.figures), before.figures);
  assert.equal(read(paths.generated), before.generated);
  assert.equal(result.status, undefined);
});

test('a refresh downloads into a scratch copy of the scripts, then swaps the new data in and keeps the old', () => {
  const {run, calls} = backtests((figures, script, cwd) => {
    assert.ok(fs.existsSync(path.join(cwd, 'quality_rules.py')), 'the scratch folder has the scripts');
    if (script === REFRESH_SCRIPTS[0]) {
      assert.equal(fs.existsSync(path.join(cwd, 'holdout_prices_cache.json')), false, 'and none of the old data, so it is downloaded again');
    }
    if (script === 'backtest_summary.py') {
      REFRESHED_DATA.forEach(name => fs.writeFileSync(path.join(cwd, name), 'new data'));
      figures.summary.lastBuy = '2026-06-19';
    }
  });
  const result = update({paths, run, log: quiet, now: NOW, refresh: true});

  assert.deepEqual(calls.map(it => it.script), REFRESH_SCRIPTS);
  assert.ok(calls.every(it => it.cwd !== paths.tools));
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes, ['lastBuy: 2026-05-22 → 2026-06-19']);
  REFRESHED_DATA.forEach(name => {
    assert.equal(read(path.join(paths.tools, name)), 'new data', name);
    assert.equal(read(path.join(paths.tools, 'previous_data', name)), 'old data', name);
  });
  assert.equal(read(path.join(paths.tools, 'monthly_cache.json')), 'long history');
  const figures = readJson(paths.figures);
  assert.equal(figures.summary.lastBuy, '2026-06-19');
  assert.deepEqual(figures.regime, recorded().regime, 'the long-history tests are not refreshed: their figures carry over');
  assert.deepEqual(figures.sentiment, recorded().sentiment);
  assert.deepEqual(figures.several, recorded().several);
  assert.ok(RERUN_SCRIPTS.includes('backtest_several.py') && !REFRESH_SCRIPTS.includes('backtest_several.py'),
    'the test of how many to hold is re-run from its saved 30 years of prices, never downloaded again');
  assert.ok(REFRESH_SCRIPTS.indexOf('backtest_plan.py') > REFRESH_SCRIPTS.indexOf('backtest_validation5.py'), 'the plan is replayed once all six lists are downloaded');
  assert.ok(REFRESH_SCRIPTS.indexOf('backtest_summary.py') > REFRESH_SCRIPTS.indexOf('backtest_validation5.py'), 'and the summary pools them after that too');
  assert.ok(REFRESH_SCRIPTS.indexOf('backtest_validation5.py') > REFRESH_SCRIPTS.indexOf('backtest_validation3.py'), 'the seventh list is sized from the fresh list\'s bad cases');
  assert.ok(REFRESHED_DATA.includes('sixth_prices_cache.json') && REFRESHED_DATA.includes('seventh_prices_cache.json'), 'the newest lists are downloaded again like the others');
  assert.ok(RERUN_SCRIPTS.includes('backtest_validation6.py') && REFRESH_SCRIPTS.includes('backtest_validation6.py'),
    'the take-profit test of the eighth list is re-run with the others, and its list is downloaded again on a refresh');
  assert.ok(['prices', 'earn', 'annual'].every(kind => REFRESHED_DATA.includes(`eighth_${kind}_cache.json`)), 'with its three files of data');
  assert.equal(result.status.refreshed, true);
  assert.equal(fs.existsSync(calls[0].cwd), false, 'the scratch folder is removed');
});

test('a refresh that fails a check leaves the downloaded data and the figures as they were', () => {
  const {run} = backtests((figures, script, cwd) => {
    if (script === 'backtest_summary.py') {
      REFRESHED_DATA.forEach(name => fs.writeFileSync(path.join(cwd, name), 'new data'));
      figures.summary.stocks = 410;          // a third of the stocks did not come back
    }
  });
  const result = update({paths, run, log: quiet, now: NOW, refresh: true});

  assert.equal(result.ok, false);
  assert.match(result.blocking[0], /410/);
  REFRESHED_DATA.forEach(name => assert.equal(read(path.join(paths.tools, name)), 'old data', name));
  assert.equal(fs.existsSync(path.join(paths.tools, 'previous_data')), false);
  assert.equal(readJson(paths.figures).summary.stocks, 636);
});

test('write-only rewrites the generated module from the figures file without running a backtest', () => {
  const {run, calls} = backtests();
  const result = update({paths, run, log: quiet, now: NOW, writeOnly: true});
  assert.equal(calls.length, 0);
  assert.equal(result.ok, true);
  assert.match(read(paths.generated), /  stocks: 636,/);
});

test('the first run, with no figures recorded yet, writes them', () => {
  fs.rmSync(paths.figures);
  const all = recorded();
  const bySection = {
    'backtest_summary.py': 'summary', 'backtest_validation3.py': 'fresh', 'backtest_validation4.py': 'sixth', 'backtest_plan.py': 'plan',
    'backtest_validation5.py': 'seventh', 'backtest_validation6.py': 'eighth',
    'backtest_regime.py': 'regime', 'backtest_sentiment.py': 'sentiment', 'backtest_several.py': 'several',
  };
  const {run} = backtests((figures, script) => figures[bySection[script]] = all[bySection[script]]);
  const result = update({paths, run, log: quiet, now: NOW});
  assert.equal(result.ok, true);
  assert.deepEqual(toFigures(readJson(paths.figures)), toFigures(all));
  assert.match(read(paths.generated), /stocks: 636,/);
});

test('runs the backtests with the Python it is given', () => {
  const used = [];
  const run = (script, cwd, figuresFile, python) => used.push(python);
  update({paths, run, log: quiet, now: NOW, python: 'C:/Python312/python.exe'});
  assert.deepEqual([...new Set(used)], ['C:/Python312/python.exe']);
});

test('hands the outcome to the running app, and only says so when the app is not there', async () => {
  const sent = [];
  const answering = async (url, options) => {
    sent.push({url, method: options.method, body: JSON.parse(options.body)});
    return {ok: true, json: async () => ({store: 'watchlist', saved: true})};
  };
  assert.equal(await sendStatus({ok: true, ranAt: '2026-01-10T17:00:00.000Z'}, {url: 'http://127.0.0.1:1/store/evidence-status', fetch: answering}), true);
  assert.deepEqual(sent, [{url: 'http://127.0.0.1:1/store/evidence-status', method: 'PUT', body: {ok: true, ranAt: '2026-01-10T17:00:00.000Z'}}]);
  assert.equal(await sendStatus({ok: true}, {fetch: async () => { throw new Error('refused'); }}), false);
  assert.equal(await sendStatus({ok: true}, {fetch: async () => ({ok: true, json: async () => ({title: 'another page'})})}), false);
});

test('the app is looked for on localhost, on the port the app was started with', () => {
  assert.equal(statusUrl({}), 'http://localhost:4200/store/evidence-status');
  assert.equal(statusUrl({SCREENER_PORT: '4290'}), 'http://localhost:4290/store/evidence-status');
});

/** Starts a small server on one address only that answers like the app does, and collects what it was sent. */
async function fakeApp(host) {
  const received = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => {
      let sent;
      try {
        sent = JSON.parse(body);
      } catch {
        sent = body;   // not JSON: keep what came, so the comparison fails and not the whole run
      }
      received.push({method: request.method, url: request.url, body: sent});
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({store: 'watchlist', saved: true}));
    });
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, host, resolve));
  return {received, port: server.address().port, close: () => { server.closeAllConnections(); server.close(); }};
}

test('"localhost" reaches an app that listens on 127.0.0.1 only (the app in Docker)', async () => {
  const app = await fakeApp('127.0.0.1');
  try {
    const status = {ok: true, ranAt: '2026-01-10T17:00:00.000Z'};
    assert.equal(await sendStatus(status, {url: `http://localhost:${app.port}/store/evidence-status`}), true);
    assert.deepEqual(app.received, [{method: 'PUT', url: '/store/evidence-status', body: status}]);
  } finally {
    app.close();
  }
});

test('"localhost" reaches an app that listens on ::1 only (the development server)', async t => {
  let app;
  try {
    app = await fakeApp('::1');
  } catch (error) {
    if (['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error.code)) {
      return t.skip('this computer has no IPv6 loopback');
    }
    throw error;
  }
  try {
    const status = {ok: true, ranAt: '2026-01-10T17:00:00.000Z'};
    assert.equal(await sendStatus(status, {url: `http://localhost:${app.port}/store/evidence-status`}), true);
    assert.deepEqual(app.received, [{method: 'PUT', url: '/store/evidence-status', body: status}]);
  } finally {
    app.close();
  }
});

test('without an address of its own, the send goes to the app on localhost', async () => {
  const urls = [];
  const fetch = async url => {
    urls.push(url);
    return {ok: true, json: async () => ({store: 'watchlist', saved: true})};
  };
  assert.equal(await sendStatus({ok: true}, {fetch}), true);
  assert.deepEqual(urls, [statusUrl()]);
  assert.ok(urls[0].startsWith('http://localhost:'));
});

test('the send is given a time limit', async () => {
  let options;
  const fetch = async (url, given) => {
    options = given;
    return {ok: true, json: async () => ({store: 'watchlist', saved: true})};
  };
  assert.equal(await sendStatus({ok: true}, {url: 'http://localhost:1/store/evidence-status', fetch}), true);
  assert.ok(options.signal instanceof AbortSignal);
});

test('a program that accepts the connection and never answers does not hold the command: the send gives up and says false', async () => {
  const server = http.createServer(() => undefined);   // never answers
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let timer;
  try {
    const gaveUp = sendStatus({ok: true}, {url: `http://127.0.0.1:${server.address().port}/store/evidence-status`, timeoutMs: 200});
    const stuck = new Promise((resolve, reject) => timer = setTimeout(() => reject(new Error('the send did not give up within 3 seconds')), 3000));
    assert.equal(await Promise.race([gaveUp, stuck]), false);
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  }
});

test('after an update the outcome is handed over; only a send that did not save is reported, and the exit code stays the update\'s', async () => {
  const SENTENCE = 'The app did not save this outcome, so the page does not show it. Is the app running?';
  const status = {ok: true, ranAt: '2026-01-10T17:00:00.000Z'};
  const run = async (result, saved) => {
    const handed = [];
    const lines = [];
    const code = await afterUpdate(result, {send: async given => { handed.push(given); return saved; }, log: line => lines.push(line)});
    return {handed, lines, code};
  };

  assert.deepEqual(await run({ok: true, status}, true), {handed: [status], lines: [], code: 0});
  assert.deepEqual(await run({ok: true, status}, false), {handed: [status], lines: [SENTENCE], code: 0});
  assert.deepEqual(await run({ok: false, status}, false), {handed: [status], lines: [SENTENCE], code: 1});
  assert.deepEqual(await run({ok: false, status}, true), {handed: [status], lines: [], code: 1});
  assert.deepEqual(await run({ok: true}, false), {handed: [], lines: [], code: 0}, 'a dry run sends nothing and says nothing');
  assert.deepEqual(await run({ok: false}, false), {handed: [], lines: [], code: 1});
});

test('a dry run has no outcome to hand over, and a real run writes no status file', () => {
  const {run} = backtests();
  assert.equal(update({paths, run, log: quiet, now: NOW, dryRun: true}).status, undefined);
  const result = update({paths, run, log: quiet, now: NOW});
  assert.equal(result.status.ok, true);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['app', 'tools'], 'nothing was written beside the figures and the generated module');
});
