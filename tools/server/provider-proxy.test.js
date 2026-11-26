'use strict';
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const {providerProxy} = require('./provider-proxy');


/** One request exactly as given: `headers` replace the defaults (a Host can be forged); the body is not decoded. */
function rawGet(url, headers = {}) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: target.hostname, port: target.port, method: 'GET',
      path: target.pathname + target.search, headers,
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)}));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/** Asks, and hangs up after the first bytes of the answer. */
function abortedGet(url) {
  const target = new URL(url);
  return new Promise(resolve => {
    const req = http.request({host: target.hostname, port: target.port, path: target.pathname + target.search}, res => {
      res.once('data', () => { req.destroy(); resolve(); });
    });
    req.on('error', () => resolve());
    req.end();
  });
}

/** A plain server on a free port of this computer; resolves {server, base}. */
function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, base: `http://127.0.0.1:${server.address().port}`})));
}

const close = server => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); });

const quiet = {warn() {}};
const seen = [];
let standInHost, base, slowBase, deadBase;
const servers = [];

/** A server made of the proxy alone, with a fallback of its own for what the proxy leaves. */
async function around(proxy) {
  const {server, base: address} = await listen((req, res) => {
    if (!proxy(req, res)) {
      res.writeHead(404);
      res.end('elsewhere');
    }
  });
  servers.push(server);
  return address;
}

before(async () => {
  const stand = await listen((req, res) => {
    seen.push({url: req.url, headers: req.headers});
    if (req.url.startsWith('/v1/gzipped')) {
      res.writeHead(203, {'content-type': 'application/json', 'content-encoding': 'gzip', 'set-cookie': 'a=b'});
      return res.end(zlib.gzipSync('{"ok":true}'));
    }
    if (req.url.startsWith('/v1/never')) {
      return;                                          // never answers
    }
    if (req.url.startsWith('/v1/slow-body')) {
      res.writeHead(200, {'content-type': 'text/plain'});
      res.write('x'.repeat(1000));
      const timer = setInterval(() => res.write('x'.repeat(1000)), 20);
      res.on('close', () => clearInterval(timer));
      return;
    }
    if (req.url.startsWith('/v1/dies')) {
      res.writeHead(200, {'content-type': 'text/plain', 'content-length': '100000'});
      res.write('x'.repeat(1000));
      setTimeout(() => req.socket.destroy(), 20);
      return;
    }
    res.writeHead(200, {'content-type': 'application/json'});
    res.end('{"fine":true}');
  });
  servers.push(stand.server);
  standInHost = new URL(stand.base).host;
  const table = {
    '/site': {target: stand.base, pathRewrite: {'^/site': '/v1'}, secure: false},
    '/gnews': {target: stand.base, pathRewrite: {'^/gnews': ''}},
  };
  base = await around(providerProxy({routes: table, log: quiet}));
  slowBase = await around(providerProxy({routes: table, timeoutMs: 200, log: quiet}));
  const closed = await listen(() => {});
  const deadTarget = closed.base;
  await close(closed.server);
  deadBase = await around(providerProxy({routes: {'/site': {target: deadTarget, pathRewrite: {'^/site': '/v1'}}}, log: quiet}));
});

after(async () => {
  for (const server of servers) {
    await close(server);
  }
});

test('asks the site at the rewritten path, with the site\'s own host name and the question kept', async () => {
  const response = await fetch(`${base}/site/quote?ids=a,b&x=1`);
  assert.equal(response.status, 200);
  assert.equal(seen.at(-1).url, '/v1/quote?ids=a,b&x=1');
  assert.equal(seen.at(-1).headers.host, standInHost);
  assert.equal((await fetch(`${base}/gnews/rss/search?q=x`)).status, 200);
  assert.equal(seen.at(-1).url, '/rss/search?q=x');
});

test('hands on the status, the type and a compressed body as they came, and drops cookies', async () => {
  const response = await rawGet(`${base}/site/gzipped`);                // no decoding on this side
  assert.equal(response.statusCode, 203);
  assert.equal(response.headers['content-encoding'], 'gzip');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.deepEqual(zlib.gunzipSync(response.body).toString(), '{"ok":true}');
});

test('hands on the request\'s own headers, except the host', async () => {
  await rawGet(`${base}/site/quote`, {'accept-encoding': 'gzip', 'x-thing': 'one'});
  const headers = seen.at(-1).headers;
  assert.equal(headers['accept-encoding'], 'gzip');
  assert.equal(headers['x-thing'], 'one');
  assert.equal(headers.host, standInHost);
});

test('does not hand on cookies or credentials, and keeps the other headers as they came', async () => {
  await rawGet(`${base}/site/quote`, {cookie: 'session=abc', authorization: 'Bearer xyz', accept: 'application/json', 'user-agent': 'Probe/1'});
  const headers = seen.at(-1).headers;
  assert.equal(headers.cookie, undefined);
  assert.equal(headers.authorization, undefined);
  assert.equal(headers.accept, 'application/json');
  assert.equal(headers['user-agent'], 'Probe/1');
});

test('does not hand on where the request came from: no referer and no origin', async () => {
  await rawGet(`${base}/site/quote`, {referer: 'http://localhost:4200/portfolio/brokerage', origin: 'http://localhost:4200', accept: 'application/json'});
  const headers = seen.at(-1).headers;
  assert.equal(headers.referer, undefined);
  assert.equal(headers.origin, undefined);
  assert.equal(headers.accept, 'application/json');
});

test('gives up on a site that does not answer in time, and says so when it cannot be reached', async () => {
  assert.equal((await fetch(`${slowBase}/site/never`)).status, 504);      // a proxy made with timeoutMs: 200
  assert.equal((await fetch(`${deadBase}/site/x`)).status, 502);          // its target is a closed port
});

test('gives up on a site whose connection never gets made, close to the limit, and goes on', async () => {
  const hanging = await around(providerProxy({
    routes: {'/site': {target: 'http://never-answers.example', pathRewrite: {'^/site': '/v1'}}},
    timeoutMs: 200, log: quiet, lookup: () => {},     // a name lookup that never answers
  }));
  const started = Date.now();
  assert.equal((await fetch(`${hanging}/site/x`)).status, 504);
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
  assert.equal((await fetch(`${hanging}/elsewhere`)).status, 404);
});

test('a caller that leaves in the middle does not bring the server down', async () => {
  await abortedGet(`${base}/site/slow-body`);
  assert.equal((await fetch(`${base}/site/quote`)).status, 200);
});

test('a site that dies in the middle of its answer ends the caller\'s answer too, and the server goes on', async () => {
  await assert.rejects(async () => (await fetch(`${base}/site/dies`)).arrayBuffer());
  assert.equal((await fetch(`${base}/site/quote`)).status, 200);
});

test('takes only reading requests, and leaves other paths to the next handler', async () => {
  assert.equal((await fetch(`${base}/site/quote`, {method: 'POST'})).status, 405);
  assert.equal((await fetch(`${base}/elsewhere`)).status, 404);           // the test server's own fallback
  assert.equal((await fetch(`${base}/sitemap`)).status, 404);             // a prefix is a whole first part of the path
});

test('the caller\'s path cannot name another host', async () => {
  const before = seen.length;
  const response = await rawGet(`${base}/gnews//other.example/x`);
  assert.equal(response.statusCode, 200);
  assert.equal(seen.at(-1).headers.host, standInHost);
  assert.equal(seen.length, before + 1);
});

test('answers HEAD without a body', async () => {
  const response = await fetch(`${base}/site/quote`, {method: 'HEAD'});
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});
