'use strict';
const {test, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const {spawn} = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const {createReaderService, listenOn} = require('./reader-service');

let tmp, socketPath, server, asked, release;

/** One request over the socket; resolves {status, body}. `raw` sends the text as it is, without making JSON of it. */
function call(method, route, body, raw) {
  return new Promise((resolve, reject) => {
    const text = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const req = http.request({socketPath, method, path: route, headers: text === undefined ? {} : {'content-type': 'application/json'}}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
    });
    req.on('error', reject);
    req.end(text);
  });
}
const get = route => call('GET', route);
const post = (route, body, raw) => call('POST', route, body, raw);

/** Waits (up to two seconds) until the stand-in holds a run; fails the test, not the whole run, if it never does. */
async function untilHeld() {
  for (let tries = 0; !release; tries++) {
    assert.ok(tries < 400, 'the held run was never started');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const stop = target => new Promise(resolve => { target.closeAllConnections?.(); target.close(() => resolve()); });

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-service-'));
  socketPath = process.platform === 'win32' ? '\\\\.\\pipe\\reader-test-' + crypto.randomUUID() : path.join(tmp, 'reader.sock');
  asked = [];
  // The stand-in answers {ok: true, output: {what: 'x'}} at once, unless the test holds the next run with `hold()`;
  // `release` then lets that run end.
  let held = false;
  release = null;
  const hold = () => { held = true; };
  server = createReaderService({
    available: () => true,
    run: async (recipe, prompt) => {
      asked.push({recipe: recipe.name, prompt});
      if (prompt === 'throw') {
        throw new Error('it broke');
      }
      if (held) {
        held = false;                               // only the next run is held
        await new Promise(resolve => { release = resolve; });
        return {ok: true, output: {}};
      }
      return {ok: true, output: {what: 'x'}};
    },
    recipes: {'why-it-dropped': {name: 'why-it-dropped'}},
  });
  server.hold = hold;
  await listenOn(server, socketPath);
});

afterEach(async () => {
  await stop(server);
  fs.rmSync(tmp, {recursive: true, force: true});
});

test('says whether Claude Code is there, and runs the one recipe it knows', async () => {
  assert.deepEqual(await get('/status'), {status: 200, body: {claude: true}});
  const answer = await post('/run', {recipe: 'why-it-dropped', prompt: 'Why did it fall?'});
  assert.deepEqual(answer, {status: 200, body: {ok: true, output: {what: 'x'}}});
  assert.deepEqual(asked, [{recipe: 'why-it-dropped', prompt: 'Why did it fall?'}]);
});

test('refuses a recipe it does not know, a missing prompt and one that is too long', async () => {
  for (const body of [{recipe: 'other', prompt: 'x'}, {recipe: 'constructor', prompt: 'x'}, {recipe: 'why-it-dropped'}, {recipe: 'why-it-dropped', prompt: 'x'.repeat(4001)}]) {
    const answer = await post('/run', body);
    assert.equal(answer.status, 400);
    assert.equal(answer.body.ok, false);
    assert.equal(answer.body.reason, 'failed');
  }
  assert.deepEqual(asked, []);
});

test('refuses a body that is not JSON, or is very large, without running anything', async () => {
  assert.equal((await post('/run', undefined, 'not json')).status, 400);
  assert.equal((await post('/run', undefined, JSON.stringify({recipe: 'why-it-dropped', prompt: 'x'.repeat(100_000)}))).status, 400);
  assert.deepEqual(asked, []);
});

test('answers 404 to anything else', async () => {
  assert.equal((await get('/nothing')).status, 404);
  assert.equal((await post('/status', {})).status, 404);
  assert.equal((await get('/run')).status, 404);
});

test('runs one at a time', async () => {
  server.hold();
  const first = post('/run', {recipe: 'why-it-dropped', prompt: 'a'});
  await untilHeld();
  assert.deepEqual(await post('/run', {recipe: 'why-it-dropped', prompt: 'b'}), {status: 429, body: {ok: false, reason: 'busy'}});
  release();
  assert.equal((await first).status, 200);
});

test('lets the next run start after one that threw', async () => {
  const broken = await post('/run', {recipe: 'why-it-dropped', prompt: 'throw'});
  assert.equal(broken.status, 500);
  assert.equal(broken.body.reason, 'failed');
  assert.deepEqual(await post('/run', {recipe: 'why-it-dropped', prompt: 'again'}), {status: 200, body: {ok: true, output: {what: 'x'}}});
});

test('lets the next run start after the app stopped waiting for one', async () => {
  server.hold();
  const req = http.request({socketPath, method: 'POST', path: '/run', headers: {'content-type': 'application/json'}});
  req.on('error', () => {});
  req.end(JSON.stringify({recipe: 'why-it-dropped', prompt: 'a'}));
  await untilHeld();
  req.destroy();                                    // the app gave up
  await new Promise(resolve => setTimeout(resolve, 50));
  release();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await post('/run', {recipe: 'why-it-dropped', prompt: 'b'})).status, 200);
});

/** A socket file left by a start that was killed: a child listens there and is killed, so the file is not removed. */
async function leaveSocketFile(place) {
  const child = spawn(process.execPath, ['-e', 'require("net").createServer().listen(process.argv[1], () => console.log("ready"))', place], {stdio: ['ignore', 'pipe', 'inherit']});
  await new Promise(resolve => child.stdout.once('data', resolve));
  const gone = new Promise(resolve => child.once('close', resolve));
  child.kill('SIGKILL');
  await gone;
  assert.ok(fs.lstatSync(place).isSocket(), 'the killed start left its socket file');
}

async function statusAt(place) {
  return new Promise((resolve, reject) => {
    http.get({socketPath: place, path: '/status'}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
    }).on('error', reject);
  });
}

// On Windows the path is a pipe and leaves nothing behind, so this only shows that listening there works; the
// leftover-file case runs where the image runs (Linux).
test('starts where an earlier start left its socket file behind', async () => {
  const place = socketPath + (process.platform === 'win32' ? '-again' : '.again');
  if (process.platform !== 'win32') {
    await leaveSocketFile(place);
  }
  const again = createReaderService({available: () => true});
  try {
    await listenOn(again, place);
    assert.deepEqual(await statusAt(place), {status: 200, body: {claude: true}});
  } finally {
    await stop(again);
  }
});

test('does not remove an ordinary file or a folder that happens to be at the path, and says so', {skip: process.platform === 'win32'}, async () => {
  const file = path.join(tmp, 'ordinary');
  fs.writeFileSync(file, 'mine');
  await assert.rejects(() => listenOn(createReaderService(), file), /not a socket/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'mine');
  const folder = path.join(tmp, 'folder');
  fs.mkdirSync(folder);
  await assert.rejects(() => listenOn(createReaderService(), folder), /not a socket/);
  assert.ok(fs.existsSync(folder));
});

test('as it is started, it runs both jobs the app asks for: why a stock fell, and a view of a stock', async () => {
  const place = socketPath + (process.platform === 'win32' ? '-both' : '.both');
  const ran = [];
  const both = createReaderService({available: () => true, run: async recipe => (ran.push(recipe), {ok: true, output: {}})});
  const usual = socketPath;
  try {
    await listenOn(both, place);
    socketPath = place;
    assert.equal((await post('/run', {recipe: 'why-it-dropped', prompt: 'a'})).status, 200);
    assert.equal((await post('/run', {recipe: 'claude-view', prompt: 'b'})).status, 200);
    assert.deepEqual(ran.map(recipe => recipe.name), ['why-it-dropped', 'claude-view']);
    assert.deepEqual(ran.map(recipe => recipe.tools), [['WebSearch'], ['WebSearch']], 'each with its own, and only, tool');
  } finally {
    socketPath = usual;
    await stop(both);
  }
});
