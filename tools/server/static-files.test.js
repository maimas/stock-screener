'use strict';
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {staticFiles} = require('./static-files');


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

let root, server, base;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'static-files-'));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), {recursive: true});
  fs.writeFileSync(path.join(dist, 'index.html'), '<app-root></app-root>');
  fs.writeFileSync(path.join(dist, 'main.0123456789abcdef.js'), 'console.log(1);');
  fs.writeFileSync(path.join(dist, 'assets', 'a.svg'), '<svg></svg>');
  fs.writeFileSync(path.join(dist, 'blob.xyz'), 'x');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'private');
  fs.mkdirSync(path.join(root, 'dist-twin'));
  fs.writeFileSync(path.join(root, 'dist-twin', 'secret.txt'), 'private');
  const files = staticFiles(dist);
  ({server, base} = await listen((req, res) => {
    if (!files(req, res)) {
      res.writeHead(404);
      res.end('elsewhere');
    }
  }));
});

after(async () => {
  await close(server);
  fs.rmSync(root, {recursive: true, force: true});
});

test('serves a file with its type, and the page for the page\'s own addresses', async () => {
  assert.match((await fetch(`${base}/main.0123456789abcdef.js`)).headers.get('content-type'), /javascript/);
  for (const address of ['/', '/portfolio', '/watchlist']) {
    assert.equal(await (await fetch(base + address)).text(), '<app-root></app-root>');
  }
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
});

test('says what each kind of file is, and calls an unknown kind plain bytes', async () => {
  assert.equal((await fetch(`${base}/assets/a.svg`)).headers.get('content-type'), 'image/svg+xml');
  assert.equal((await fetch(`${base}/index.html`)).headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal((await fetch(`${base}/blob.xyz`)).headers.get('content-type'), 'application/octet-stream');
});

test('a file with a hash in its name is kept by the browser; the page itself is asked for again', async () => {
  assert.equal((await fetch(`${base}/main.0123456789abcdef.js`)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await fetch(`${base}/portfolio`)).headers.get('cache-control'), 'no-cache');
});

test('nothing outside the folder can be reached', async () => {
  for (const address of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt', '/..%2fdist-twin/secret.txt',
    '/%2e%2e%2fsecret.txt', '/..\\secret.txt', '/assets/..%5c..%5csecret.txt', '/%2e%2e/%2e%2e/secret.txt', '/../']) {
    assert.notEqual(await rawStatus(base + address), 200, address);
  }
});

test('refuses a path that cannot be read as a name', async () => {
  for (const address of ['/main.0123456789abcdef.js%00.txt', '/%', '/%E0%A4%A']) {
    assert.notEqual(await rawStatus(base + address), 200, address);
  }
});

test('a folder is not a file, and only reading is allowed', async () => {
  assert.equal(await (await fetch(`${base}/assets`)).text(), '<app-root></app-root>');   // no extension, no file: the page
  assert.equal((await fetch(`${base}/portfolio`, {method: 'POST'})).status, 405);
  assert.equal((await fetch(`${base}/main.0123456789abcdef.js`, {method: 'HEAD'})).status, 200);
});
