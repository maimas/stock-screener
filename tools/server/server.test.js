'use strict';
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createAppServer, connectWithRetry, putBackThenListen} = require('./server');
const {readerRoutes} = require('../claude/reader-routes');
const {createMemoryStorage} = require('../store/storage-memory');


/** The status of a request whose path is sent untouched (no tidying of dots), as an attacker would send it. */
function rawStatus(url, headers = {}) {
  const [, host, port, path] = /^http:\/\/([^:/]+):(\d+)(.*)$/.exec(url);
  return new Promise((resolve, reject) => {
    const req = http.request({host, port, method: 'GET', path, headers}, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

/** A plain server on a free port of this computer; resolves {server, base}. */
function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, base: `http://127.0.0.1:${server.address().port}`})));
}

const close = server => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); });

let root, app, market, base, marketSeen = 0;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-server-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<app-root></app-root>');
  market = await listen((req, res) => {
    marketSeen++;
    res.writeHead(200, {'content-type': 'application/json'});
    res.end('{"quote":1}');
  });
  const storage = createMemoryStorage();
  app = createAppServer({
    storage, distDir: root,
    providerRoutes: {'/site': {target: market.base, pathRewrite: {'^/site': '/v1'}}},
    routes: [readerRoutes({storage, available: () => false, run: async () => ({ok: false, reason: 'not-installed'}), log: {log() {}, warn() {}}})],
  });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await close(app);
  await close(market.server);
  fs.rmSync(root, {recursive: true, force: true});
});

test('one server answers the page, the store, the reading routes and the market data, in that order of claim', async () => {
  assert.equal((await fetch(`${base}/portfolio`)).status, 200);
  assert.deepEqual(await (await fetch(`${base}/store/fresh`)).json(), {store: 'watchlist', value: null, lasting: false});
  assert.deepEqual(await (await fetch(`${base}/claude/status`)).json(), {store: 'watchlist', claude: false});
  assert.equal((await fetch(`${base}/site/quote`)).status, 200);
});

test('refuses every path to a caller that is not this computer, the page and the market data too', async () => {
  const before = marketSeen;
  for (const address of ['/', '/store/portfolios', '/site/quote', '/claude/status', '/nothing-here.json']) {
    assert.equal(await rawStatus(base + address, {host: 'evil.example:4200'}), 403, address);
    assert.equal(await rawStatus(base + address, {origin: 'https://evil.example'}), 403, address);
    assert.equal(await rawStatus(base + address, {'sec-fetch-site': 'cross-site'}), 403, address);
  }
  assert.equal(marketSeen, before, 'nothing was asked of the market-data site');
});

test('the store takes a write and keeps it', async () => {
  const put = await fetch(`${base}/store/check`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: '{"a":{"B.C":1}}'});
  assert.equal(put.status, 200);
  assert.deepEqual((await (await fetch(`${base}/store/check`)).json()).value, {a: {'B.C': 1}});
});

test('through the real routes, a reader that says the sign-in ended leaves the earlier reading in place', async () => {
  const storage = createMemoryStorage();
  const earlier = {what: 'an earlier reading'};
  await storage.merge('readings', {v: 1, readings: {ABCD: earlier}});
  const server = createAppServer({
    storage, distDir: root, providerRoutes: {},
    routes: [readerRoutes({storage, available: () => true, run: async () => ({ok: false, reason: 'signed-out'}), log: {log() {}, warn() {}}})],
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const at = `http://127.0.0.1:${server.address().port}`;
    const asked = await fetch(`${at}/claude/readings`, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({symbol: 'ABCD', name: 'Example Corp', day: '2026-01-05', percent: 8}),
    });
    assert.equal(asked.status, 202);
    let answer;
    for (let tries = 0; tries < 100; tries++) {
      answer = await (await fetch(`${at}/claude/readings/ABCD`)).json();
      if (answer.state !== 'reading') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.deepEqual(answer, {store: 'watchlist', state: 'failed', reason: 'signed-out', reading: earlier});
  } finally {
    await close(server);
  }
});

test('says so, in JSON, when nothing took the request', async () => {
  const response = await fetch(`${base}/claude`, {method: 'DELETE'});
  assert.ok([404, 405].includes(response.status));
  assert.equal((await response.json()).store, 'watchlist');
});

test('keeps trying until the database answers, and gives up after the tries it was given', async () => {
  let calls = 0;
  const storage = await connectWithRetry(async () => { if (++calls < 3) { throw new Error('not yet'); } return 'storage'; }, {pauseMs: 1, log: () => {}});
  assert.deepEqual([storage, calls], ['storage', 3]);
  await assert.rejects(() => connectWithRetry(async () => { throw new Error('never'); }, {tries: 2, pauseMs: 1, log: () => {}}), /never/);
});

test('says it is waiting once, however long it waits', async () => {
  const said = [];
  let calls = 0;
  await connectWithRetry(async () => { if (++calls < 5) { throw new Error('no'); } return 1; }, {pauseMs: 1, log: line => said.push(line)});
  assert.deepEqual(said, ['Waiting for the database.']);
});

test('starts nothing and says why when the database address is missing', async () => {
  const env = {...process.env};
  delete env.MONGO_URL;
  const child = spawn(process.execPath, [path.join(__dirname, 'main.js')], {env, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => child.kill(), 5000);
  const code = await new Promise(resolve => child.on('close', resolve));
  clearTimeout(timer);
  assert.equal(code, 1);
  assert.match(output, /MONGO_URL is not set\./);
  assert.doesNotMatch(output, /Listening/);
});

test('a start whose put-back fails does not answer, and the next start finishes the put-back, then answers', async () => {
  const copies = fs.mkdtempSync(path.join(os.tmpdir(), 'app-server-copies-'));
  try {
    const keys = {log: {v: 1, days: {}}, portfolios: {v: 2, active: 'p1', portfolios: [{id: 'p1', name: 'Brokerage', cash: 1000}]}, watchlists: {v: 1, lists: []}};
    fs.writeFileSync(path.join(copies, 'screener-2026-01-05.json'), JSON.stringify({v: 1, madeAt: '2026-01-05T18:00:00.000Z', keys}));
    const store = createMemoryStorage();
    let writes = 0;
    const stopsAtTheSecond = {...store, write: async (key, value) => {
      if (++writes === 2) { throw new Error('the database stopped answering'); }
      return store.write(key, value);
    }};
    const first = createAppServer({storage: stopsAtTheSecond, distDir: root, providerRoutes: {}});
    await assert.rejects(putBackThenListen({storage: stopsAtTheSecond, backupDir: copies, server: first, port: 0, host: '127.0.0.1', log: () => {}}),
      /stopped answering/);
    assert.equal(first.listening, false, 'nothing answers on a store whose copy was not put back');
    assert.deepEqual(await store.keys(), ['log']);

    const said = [];
    const second = createAppServer({storage: store, distDir: root, providerRoutes: {}});
    await putBackThenListen({storage: store, backupDir: copies, server: second, port: 0, host: '127.0.0.1', log: line => said.push(line)});
    try {
      assert.equal(second.listening, true);
      assert.deepEqual(said, ['Finished putting back the copy screener-2026-01-05.json (2 keys were missing).']);
      for (const [key, value] of Object.entries(keys)) { assert.deepEqual((await store.read(key)).value, value); }
    } finally {
      await close(second);
    }
  } finally {
    fs.rmSync(copies, {recursive: true, force: true});
  }
});
