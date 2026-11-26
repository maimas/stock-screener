'use strict';
// Tests for the import as a command: what it refuses, and what it says when the database stops in the middle. It
// never opens a database: the command is handed a stand-in storage, or stops before it would open one.
const {test, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createMemoryStorage} = require('./storage-memory');
const {runImport} = require('./import');

const BOOK = {v: 2, active: 'p1', portfolios: [{id: 'p1', name: 'Brokerage', cash: 1000}]};
const COMMAND = path.join(__dirname, 'import.js');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screener-import-test-'));
  fs.writeFileSync(path.join(dir, 'log.json'), '{"v":1,"days":{}}');
  fs.writeFileSync(path.join(dir, 'portfolios.json'), JSON.stringify(BOOK));
  fs.writeFileSync(path.join(dir, 'watchlists.json'), '{"v":1,"lists":[]}');
});
afterEach(() => { fs.rmSync(dir, {recursive: true, force: true}); });

/** Runs the command with the given arguments and a storage of its own; resolves {code, out, err}. */
async function run(args, storage) {
  const out = [];
  const err = [];
  const code = await runImport({
    args, env: {MONGO_URL: 'mongodb://stand-in.invalid/test'}, open: async () => storage,
    out: line => out.push(line), err: line => err.push(line),
  });
  return {code, out: out.join('\n'), err: err.join('\n')};
}

test('an option it does not know is refused with the usage line, before any database is opened', () => {
  const env = {...process.env};
  delete env.MONGO_URL;                                    // so nothing could be opened even if the check came late
  for (const option of ['--replce', '-replace']) {
    const ran = spawnSync(process.execPath, [COMMAND, dir, option], {encoding: 'utf8', env});
    assert.equal(ran.status, 2, `${option}: ${ran.stderr}`);
    assert.match(ran.stderr, /Usage: node tools\/store\/import\.js <file or folder> \[--replace\]/);
  }
});

test('a write that fails names the key, the error code and the keys already in, and never the message', async () => {
  const store = createMemoryStorage();
  let writes = 0;
  const failing = {...store, write: async (key, value) => {
    if (++writes === 2) {
      throw Object.assign(new Error('E11000 duplicate key {"cash": 1000}'), {name: 'MongoServerError', code: 11000, codeName: 'DuplicateKey'});
    }
    return store.write(key, value);
  }};
  const ran = await run([dir], failing);
  assert.equal(ran.code, 1);
  assert.match(ran.err, /The import stopped while writing portfolios \(11000 DuplicateKey\)\./);
  assert.match(ran.err, /Already put in: log\./);
  assert.doesNotMatch(ran.err + ran.out, /cash|E11000|duplicate key/);
});

test('an import that works says each key is the same on reading back and ends with 0', async () => {
  const store = createMemoryStorage();
  const ran = await run([dir, '--replace'], store);
  assert.deepEqual([ran.code, ran.out], [0, ['log', 'portfolios', 'watchlists'].map(key => `${key}: same on reading back`).join('\n')]);
  assert.deepEqual((await store.read('portfolios')).value, BOOK);
});
