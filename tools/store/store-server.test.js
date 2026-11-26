'use strict';
// Run with: npm run test:tools
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createStoreServer} = require('./store-server');
const {createMemoryStorage} = require('./storage-memory');

let server, base, port, storage;

/** Starts a server on a free port, runs `body(baseUrl)` and closes it. */
async function withServer(options, body) {
  const started = createStoreServer(options);
  await new Promise(resolve => started.listen(0, '127.0.0.1', resolve));
  try {
    return await body(`http://127.0.0.1:${started.address().port}`);
  } finally {
    started.close();
  }
}

before(async () => {
  storage = createMemoryStorage();
  server = createStoreServer({storage});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

const putAt = (at, key, body, headers = {}) => fetch(`${at}/store/${key}`, {
  method: 'PUT',
  headers: {'content-type': 'application/json', ...headers},
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const patchAt = (at, key, body) => fetch(`${at}/store/${key}`, {
  method: 'PATCH',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify(body),
});
const get = key => fetch(`${base}/store/${key}`);
const put = (key, body, headers = {}) => putAt(base, key, body, headers);

test('says nothing is saved yet for a key that has nothing', async () => {
  const response = await get('fresh');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {store: 'watchlist', value: null, lasting: false});
});

test('keeps what was saved and gives it back', async () => {
  const book = {v: 2, active: 'p1', portfolios: [{id: 'p1', name: 'Brokerage', positions: {}}]};
  const saved = await put('portfolios', book);
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), {store: 'watchlist', saved: true, lasting: false});
  assert.deepEqual(await (await get('portfolios')).json(), {store: 'watchlist', value: book, lasting: false});
});

test('keeps the previous version when a value is overwritten', async () => {
  await put('kept', {version: 1});
  await put('kept', {version: 2});
  assert.deepEqual((await storage.read('kept')).value, {version: 2});
  assert.deepEqual((await storage.previous('kept')).value, {version: 1});
});

test('says so when a saved value cannot be read, and refuses to merge into it', async () => {
  const damaged = {...createMemoryStorage(), read: async () => ({value: null, damaged: true}), merge: async () => ({saved: false, damaged: true})};
  await withServer({storage: damaged}, async at => {
    assert.deepEqual(await (await fetch(`${at}/store/portfolios`)).json(), {store: 'watchlist', value: null, damaged: true, lasting: false});
    assert.equal((await patchAt(at, 'portfolios', {a: 1})).status, 409);
  });
});

test('answers 503 while the database is not answering, and carries on when it is back', async t => {
  t.mock.method(console, 'error', () => {});         // the server notes each failure; the test does not need to show it
  let down = true;
  const real = createMemoryStorage({log: {a: 1}});
  const failing = name => async (...args) => { if (down) { throw new Error('no connection'); } return real[name](...args); };
  const flaky = {...real, read: failing('read'), write: failing('write'), merge: failing('merge')};
  await withServer({storage: flaky}, async at => {
    for (const ask of [() => fetch(`${at}/store/log`), () => putAt(at, 'log', {b: 2}), () => patchAt(at, 'log', {c: 3})]) {
      const response = await ask();
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {store: 'watchlist', error: 'The database is not answering.'});
    }
    assert.equal((await fetch(`${at}/store/Bad_Key`)).status, 400, 'a bad key is still the asker\'s mistake, not the database\'s');
    down = false;
    assert.equal((await fetch(`${at}/store/log`)).status, 200);
  });
});

test('a storage that keeps nothing says so in every answer; one that keeps does not', async () => {
  assert.deepEqual(await (await get('fresh')).json(), {store: 'watchlist', value: null, lasting: false});
  await withServer({storage: {...createMemoryStorage(), kind: 'mongo'}}, async at =>
    assert.deepEqual(await (await fetch(`${at}/store/fresh`)).json(), {store: 'watchlist', value: null}));
});

/** A PUT whose path is sent exactly as written (fetch would tidy up "..", hiding what an attacker can send). */
const rawPut = rawPath => new Promise((resolve, reject) => {
  const request = http.request({host: '127.0.0.1', port, path: rawPath, method: 'PUT', headers: {'content-type': 'application/json'}},
    response => { response.resume(); resolve(response.statusCode); });
  request.on('error', reject);
  request.end('{"a":1}');
});

test('refuses a key that could reach outside the data folder', async () => {
  for (const key of ['..%2Fevil', 'a.b', 'UPPER', '%2e%2e', '..', 'x'.repeat(60)]) {
    assert.equal(await rawPut(`/store/${key}`), 400, key);
  }
  assert.equal(await rawPut('/store/../evil'), 404, 'a path that leaves /store is not the store at all');
  assert.deepEqual((await storage.keys()).filter(name => !/^[a-z0-9-]+$/.test(name) || name === 'evil'), [], 'nothing was kept under a key that is not acceptable');
});

test('refuses a body that is not JSON and writes nothing', async () => {
  assert.equal((await put('notjson', '{"half":')).status, 400);
  assert.equal((await fetch(`${base}/store/notjson`, {method: 'PUT', headers: {'content-type': 'text/plain'}, body: '{"a":1}'})).status, 415);
  assert.equal((await storage.read('notjson')).value, null);
});

test('refuses a body over the size limit', async () => {
  const response = await put('huge', JSON.stringify({blob: 'x'.repeat(6 * 1024 * 1024)})).catch(() => ({status: 413}));
  assert.equal(response.status, 413);
  assert.equal((await storage.read('huge')).value, null);
});

test('refuses requests coming from another website', async () => {
  assert.equal((await put('csrf', {a: 1}, {origin: 'https://evil.example'})).status, 403);
  assert.equal((await put('csrf', {a: 1}, {'sec-fetch-site': 'cross-site'})).status, 403);
  assert.equal((await storage.read('csrf')).value, null);
});

test('accepts the app on this computer, on whatever port it is served', async () => {
  assert.equal((await put('local', {a: 1}, {origin: 'http://localhost:4200'})).status, 200);
  assert.equal((await put('local', {a: 2}, {origin: 'http://127.0.0.1:4300', 'sec-fetch-site': 'same-origin'})).status, 200);
});

test('refuses a request addressed to another host name (a site pretending to be this computer)', async () => {
  const status = await new Promise((resolve, reject) => {
    const request = http.request({host: '127.0.0.1', port, path: '/store/portfolios', method: 'GET', headers: {host: 'evil.example:4301'}},
      response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end();
  });
  assert.equal(status, 403);
});

test('refuses methods other than GET and PUT, and paths that are not the store', async () => {
  assert.equal((await fetch(`${base}/store/portfolios`, {method: 'DELETE'})).status, 405);
  assert.equal((await fetch(`${base}/store/portfolios`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'})).status, 405);
  assert.equal((await fetch(`${base}/elsewhere`)).status, 404);
});

// ---- PATCH: merging a change into what is saved, so two writers (the page and the daily recorder) cannot
// ---- overwrite each other's days in the log.

const patch = (key, body) => patchAt(base, key, body);
const saved = async key => (await (await get(key)).json()).value;

test('PATCH merges into what is saved: new keys are added, objects are merged, the rest is kept', async () => {
  await put('log', {v: 1, days: {'2026-11-20': {spy: 660, s: {NVDA: {p: 130, v: 'D'}}}}});
  const response = await patch('log', {days: {'2026-11-20': {s: {AMD: {p: 200, v: 'W'}}}, '2026-11-21': {spy: 650, s: {NVDA: {p: 125.5, v: 'D'}}}}});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {store: 'watchlist', saved: true, lasting: false});
  assert.deepEqual(await saved('log'), {
    v: 1,
    days: {
      '2026-11-20': {spy: 660, s: {NVDA: {p: 130, v: 'D'}, AMD: {p: 200, v: 'W'}}},
      '2026-11-21': {spy: 650, s: {NVDA: {p: 125.5, v: 'D'}}},
    },
  });
});

test('PATCH replaces a value that is not an object, and removes a key sent as null', async () => {
  await put('trim', {days: {a: {x: 1}, b: {x: 2}}, list: [1, 2], name: 'old'});
  await patch('trim', {days: {a: null}, list: [3], name: 'new'});
  assert.deepEqual(await saved('trim'), {days: {b: {x: 2}}, list: [3], name: 'new'});
});

test('PATCH starts a file that does not exist yet', async () => {
  assert.equal((await patch('started', {v: 1, days: {d: {s: {}}}})).status, 200);
  assert.deepEqual(await saved('started'), {v: 1, days: {d: {s: {}}}});
});

test('PATCH leaves a value it cannot read alone, rather than merging into nothing and losing it', async () => {
  let merged = 0;
  const damaged = {...createMemoryStorage(), merge: async () => { merged++; return {saved: false, damaged: true}; }};
  await withServer({storage: damaged}, async at => {
    const response = await patchAt(at, 'unreadable', {days: {d: {s: {}}}});
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {store: 'watchlist', saved: false, damaged: true, lasting: false});
    assert.equal(merged, 1);
  });
});

test('two PATCHes sent at the same moment both land', async () => {
  await put('both', {days: {}});
  await Promise.all([patch('both', {days: {a: {x: 1}}}), patch('both', {days: {b: {x: 2}}}), patch('both', {days: {c: {x: 3}}})]);
  assert.deepEqual(await saved('both'), {days: {a: {x: 1}, b: {x: 2}, c: {x: 3}}});
});

test('PATCH needs an object: a list or a bare value cannot be merged', async () => {
  await put('typed', {a: 1});
  assert.equal((await patch('typed', [1, 2])).status, 400);
  assert.equal((await patch('typed', 5)).status, 400);
  assert.deepEqual(await saved('typed'), {a: 1});
});

test('hands a path that is not its own to the routes it was given, after checking who is asking', async () => {
  const asked = [];
  const extra = createStoreServer({
    storage,
    routes: [(req, res) => {
      if (!req.url.startsWith('/extra')) {
        return false;
      }
      asked.push(req.url);
      res.writeHead(200, {'content-type': 'application/json'});
      res.end('{"extra":true}');
      return true;
    }],
  });
  await new Promise(resolve => extra.listen(0, '127.0.0.1', resolve));
  const at = `http://127.0.0.1:${extra.address().port}`;
  try {
    assert.deepEqual(await (await fetch(`${at}/extra/thing`)).json(), {extra: true});
    assert.equal((await fetch(`${at}/extra/thing`, {headers: {origin: 'https://evil.example'}})).status, 403);
    assert.equal((await fetch(`${at}/extra/thing`, {headers: {'sec-fetch-site': 'cross-site'}})).status, 403);
    assert.deepEqual(asked, ['/extra/thing'], 'a page of another site never reaches a route');
    assert.equal((await fetch(`${at}/store/fresh`)).status, 200, 'and the store still answers its own paths');
  } finally {
    extra.close();
  }
});
