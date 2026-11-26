'use strict';
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {readerClient, askAtMostEvery} = require('./reader-client');

let tmp, socketPath, hangingPath, nowhere, standIn, hanging, client;

const pathFor = (name) => process.platform === 'win32' ? `\\\\.\\pipe\\reader-test-${name}-${crypto.randomUUID()}` : path.join(tmp, `${name}.sock`);
const listen = (server, place) => new Promise(resolve => server.listen(place, resolve));
const stop = server => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); });

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-client-'));
  socketPath = pathFor('reader');
  hangingPath = pathFor('hanging');
  nowhere = pathFor('nowhere');
  // A stand-in for the reader: answers by what the question says.
  standIn = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const answer = (status, body) => { res.writeHead(status, {'content-type': 'application/json'}); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
      if (req.url === '/status') {
        return answer(200, {claude: true});
      }
      const {recipe, prompt} = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (recipe !== 'why-it-dropped') {
        return answer(400, {ok: false, reason: 'failed', detail: 'unknown recipe'});
      }
      if (prompt === 'busy') {
        return answer(429, {ok: false, reason: 'busy'});
      }
      if (prompt === 'signed-out') {
        return answer(200, {ok: false, reason: 'signed-out', detail: 'Please log in.'});
      }
      if (prompt === 'garbage') {
        return answer(200, 'not json');
      }
      if (prompt === 'error') {
        return answer(500, {ok: false, reason: 'failed', detail: 'it broke'});
      }
      if (prompt === 'huge') {
        return answer(200, {ok: true, output: {what: 'x'.repeat(2 * 1024 * 1024)}});
      }
      if (prompt === 'endless') {                    // a reader gone wrong that never stops answering
        res.writeHead(200, {'content-type': 'application/json'});
        const more = () => { if (!res.destroyed && res.write('x'.repeat(64 * 1024))) { setImmediate(more); } else if (!res.destroyed) { res.once('drain', more); } };
        return more();
      }
      answer(200, {ok: true, output: {what: 'x'}});
    });
  });
  hanging = http.createServer(() => {});            // takes the request and never answers
  await listen(standIn, socketPath);
  await listen(hanging, hangingPath);
  client = readerClient({socketPath});
});

after(async () => {
  await stop(standIn);
  await stop(hanging);
  fs.rmSync(tmp, {recursive: true, force: true});
});

test('asks the reader and hands back its answer as it is', async () => {
  assert.equal(await client.available(), true);
  assert.deepEqual(await client.run('Why did it fall?'), {ok: true, output: {what: 'x'}});
});

test('with nobody listening it says Claude Code is not there, and never throws', async () => {
  const lost = readerClient({socketPath: nowhere});
  assert.equal(await lost.available(), false);
  assert.deepEqual(await lost.run('x'), {ok: false, reason: 'not-installed'});
});

test('gives up on a reader that hangs, within its time limit', async () => {
  const slow = readerClient({socketPath: hangingPath, timeoutMs: 200, statusTimeoutMs: 200});
  assert.deepEqual(await slow.run('x'), {ok: false, reason: 'timeout'});
  assert.equal(await slow.available(), false);
});

test('hands on that the reader is busy, and that the sign-in ended', async () => {
  assert.deepEqual(await client.run('busy'), {ok: false, reason: 'busy'});
  assert.deepEqual(await client.run('signed-out'), {ok: false, reason: 'signed-out', detail: 'Please log in.'});
});

test('says the run failed when the reader answers with something that is not an outcome', async () => {
  const garbled = await client.run('garbage');
  assert.equal(garbled.ok, false);
  assert.equal(garbled.reason, 'failed');
  assert.match(garbled.detail, /unexpected/);
  assert.deepEqual(await client.run('error'), {ok: false, reason: 'failed', detail: 'it broke'});
});

test('stops reading an answer larger than about a megabyte, and says the run failed', async () => {
  const limited = readerClient({socketPath, timeoutMs: 5000});
  for (const prompt of ['huge', 'endless']) {
    const answer = await limited.run(prompt);
    assert.deepEqual({ok: answer.ok, reason: answer.reason}, {ok: false, reason: 'failed'}, prompt);
    assert.match(answer.detail, /megabyte/);
  }
});

test('asks the far end at most once in the time given, and again after it', async () => {
  let asked = 0, clock = 1_000_000;
  const check = askAtMostEvery(async () => { asked++; return true; }, 60_000, () => clock);
  assert.equal(await check(), true);
  clock += 59_000;
  assert.equal(await check(), true);
  assert.equal(asked, 1);
  clock += 1_000;
  assert.equal(await check(), true);
  assert.equal(asked, 2);
});

test('asks once even when asked twice at the same moment', async () => {
  let asked = 0;
  const check = askAtMostEvery(async () => { asked++; return true; }, 60_000, () => 5);
  assert.deepEqual(await Promise.all([check(), check()]), [true, true]);
  assert.equal(asked, 1);
});

test('counts an ask that failed as "not there", and never rejects', async () => {
  const check = askAtMostEvery(async () => { throw new Error('no'); }, 60_000, () => 5);
  assert.equal(await check(), false);
  const synchronous = askAtMostEvery(() => { throw new Error('no'); }, 60_000, () => 5);
  assert.equal(await synchronous(), false);
});

test('remembers a "yes" for the time given, and a "no" for only five seconds', async () => {
  let asked = 0, answer = false, clock = 1_000_000;
  const check = askAtMostEvery(async () => { asked++; return answer; }, 60_000, () => clock);
  assert.equal(await check(), false);
  clock += 4_900;
  assert.equal(await check(), false);
  assert.equal(asked, 1, 'not asked again at 4.9 s');
  clock += 100;
  answer = true;
  assert.equal(await check(), true);
  assert.equal(asked, 2, 'asked again at 5 s');
  clock += 59_000;
  assert.equal(await check(), true);
  assert.equal(asked, 2, 'a "yes" is not asked again at 59 s');
  clock += 1_000;
  await check();
  assert.equal(asked, 3);
});

test('a failed ask is remembered for the short time too', async () => {
  let asked = 0, clock = 1_000_000;
  const check = askAtMostEvery(async () => { asked++; throw new Error('no'); }, 60_000, () => clock);
  assert.equal(await check(), false);
  clock += 4_900;
  await check();
  assert.equal(asked, 1);
  clock += 100;
  await check();
  assert.equal(asked, 2);
});

/** Makes the next connection fail with this error code, as the system would; the real one cannot be made on every system. */
function failConnectionWith(code) {
  const real = http.request;
  http.request = () => {
    const req = new (require('node:events'))();
    req.destroy = () => {};
    req.end = () => setImmediate(() => req.emit('error', Object.assign(new Error(`connect ${code}`), {code})));
    return req;
  };
  return () => { http.request = real; };
}

test('a socket the app is not allowed to open is a failure to say so about, not "not installed"', async () => {
  const said = [];
  const refused = readerClient({socketPath: nowhere, log: {warn: line => said.push(line)}});
  const undo = failConnectionWith('EACCES');
  try {
    assert.deepEqual(await refused.run('x'), {ok: false, reason: 'failed', detail: 'connect EACCES'});
    assert.equal(await refused.available(), false);
    assert.equal(await refused.available(), false);
    assert.equal(said.length, 1, 'said once, not once per ask');
    assert.match(said[0], /connect EACCES/);
  } finally {
    undo();
  }
});

test('a socket that is not there is still "not installed", and says nothing', async () => {
  const said = [];
  const lost = readerClient({socketPath: nowhere, log: {warn: line => said.push(line)}});
  for (const code of ['ENOENT', 'ECONNREFUSED']) {
    const undo = failConnectionWith(code);
    try {
      assert.deepEqual(await lost.run('x'), {ok: false, reason: 'not-installed'});
      assert.equal(await lost.available(), false);
    } finally {
      undo();
    }
  }
  assert.deepEqual(said, []);
});
