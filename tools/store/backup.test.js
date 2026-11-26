'use strict';
const {test, beforeEach, afterEach, mock} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createMemoryStorage} = require('./storage-memory');
const {writeCopy, newestCopy, copyIsDue, restoreIfEmpty, putIn} = require('./backup');

const BOOK = {v: 2, active: 'p1', portfolios: [{id: 'p1', name: 'Brokerage', cash: 1000}]};
const at = day => new Date(`${day}T18:00:00`);

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screener-backup-test-')); });
afterEach(() => { fs.rmSync(dir, {recursive: true, force: true}); });

test('writes every key into one dated file and can find it again', async () => {
  const storage = createMemoryStorage({portfolios: BOOK, log: {v: 1, days: {'2026-01-05': {s: {'BRK.B': {p: 10}}}}}});
  const made = await writeCopy(storage, dir, {now: at('2026-01-05')});
  assert.deepEqual({file: path.basename(made.file), keys: made.keys}, {file: 'screener-2026-01-05.json', keys: 2});
  assert.deepEqual(newestCopy(dir).keys.portfolios, BOOK);
  assert.deepEqual(fs.readdirSync(dir), ['screener-2026-01-05.json'], 'no temporary file is left behind');
});
test('keeps the newest 30, and an empty store never writes a copy', async () => {
  const storage = createMemoryStorage({portfolios: BOOK});
  for (let day = 1; day <= 31; day++) { await writeCopy(storage, dir, {now: at(`2026-03-${String(day).padStart(2, '0')}`)}); }
  assert.equal(fs.readdirSync(dir).length, 30);
  assert.ok(!fs.existsSync(path.join(dir, 'screener-2026-03-01.json')));
  assert.equal(await writeCopy(createMemoryStorage(), dir, {now: at('2026-04-01')}), undefined);
  assert.equal(fs.readdirSync(dir).length, 30, 'and it removed nothing');
});
test('passes over a newest copy that is half-written, empty or not a copy', async () => {
  await writeCopy(createMemoryStorage({portfolios: BOOK}), dir, {now: at('2026-01-05')});
  fs.writeFileSync(path.join(dir, 'screener-2026-01-06.json'), '{"v":1,"keys":{"portf');
  fs.writeFileSync(path.join(dir, 'screener-2026-01-07.json'), '');
  fs.writeFileSync(path.join(dir, 'screener-2026-01-08.json'), '{"something":"else"}');
  assert.equal(path.basename(newestCopy(dir).file), 'screener-2026-01-05.json');
});
test('a copy is due when there is none or the newest is over a day old', async () => {
  assert.equal(copyIsDue(dir, at('2026-01-05')), true);
  await writeCopy(createMemoryStorage({portfolios: BOOK}), dir, {now: at('2026-01-05')});
  assert.equal(copyIsDue(dir, new Date(at('2026-01-05').getTime() + 23 * 3600e3)), false);
  assert.equal(copyIsDue(dir, new Date(at('2026-01-05').getTime() + 25 * 3600e3)), true);
});
test('puts the newest copy back into an empty store, and never into one that holds anything', async () => {
  await writeCopy(createMemoryStorage({portfolios: BOOK, watchlists: {v: 1, lists: []}}), dir, {now: at('2026-01-05')});
  const empty = createMemoryStorage();
  assert.deepEqual(await restoreIfEmpty(empty, dir, {log: () => {}}), {restored: true, from: 'screener-2026-01-05.json', keys: 2});
  assert.deepEqual((await empty.read('portfolios')).value, BOOK);
  const used = createMemoryStorage({log: {v: 1, days: {}}});
  assert.deepEqual(await restoreIfEmpty(used, dir, {log: () => {}}), {restored: false});
  assert.deepEqual(await used.keys(), ['log']);
  assert.deepEqual(await restoreIfEmpty(createMemoryStorage(), path.join(dir, 'missing'), {log: () => {}}), {restored: false});
});
test('imports a folder of key files, passing over the .previous ones, and reads every key back', async () => {
  fs.writeFileSync(path.join(dir, 'portfolios.json'), JSON.stringify(BOOK));
  fs.writeFileSync(path.join(dir, 'portfolios.previous.json'), '{"old":true}');
  fs.writeFileSync(path.join(dir, 'log.json'), '{"v":1,"days":{}}');
  const storage = createMemoryStorage();
  assert.deepEqual(await putIn(storage, dir), {ok: true, keys: [{key: 'log', state: 'same'}, {key: 'portfolios', state: 'same'}]});
  assert.deepEqual(await storage.keys(), ['log', 'portfolios']);
});
test('leaves a key that is already there alone, unless told to replace it', async () => {
  fs.writeFileSync(path.join(dir, 'portfolios.json'), JSON.stringify(BOOK));
  const storage = createMemoryStorage({portfolios: {v: 2, active: 'x', portfolios: []}});
  assert.deepEqual(await putIn(storage, dir), {ok: false, keys: [{key: 'portfolios', state: 'kept'}]});
  assert.equal((await storage.read('portfolios')).value.active, 'x');
  assert.equal((await putIn(storage, dir, {replace: true})).ok, true);
});
test('writes nothing at all when one file is not JSON', async () => {
  fs.writeFileSync(path.join(dir, 'portfolios.json'), JSON.stringify(BOOK));
  fs.writeFileSync(path.join(dir, 'log.json'), '{"v":1,"days":');
  const storage = createMemoryStorage();
  const result = await putIn(storage, dir);
  assert.equal(result.ok, false);
  assert.match(result.error, /log\.json/);
  assert.deepEqual(await storage.keys(), []);
});
test('says when what was read back is not what was put in', async () => {
  fs.writeFileSync(path.join(dir, 'log.json'), '{"v":1}');
  const lossy = {...createMemoryStorage(), read: async () => ({value: {v: 2}})};
  assert.deepEqual(await putIn(lossy, dir), {ok: false, keys: [{key: 'log', state: 'different'}]});
});

test('a copies folder that cannot be read is an error, while one that is not there is simply empty', async () => {
  const notAFolder = path.join(dir, 'file.txt');
  fs.writeFileSync(notAFolder, 'x');
  assert.throws(() => newestCopy(notAFolder), /file\.txt/);
  await assert.rejects(restoreIfEmpty(createMemoryStorage(), notAFolder, {log: () => {}}), /file\.txt/);
  assert.equal(newestCopy(path.join(dir, 'missing')), undefined);
  assert.deepEqual(await restoreIfEmpty(createMemoryStorage(), path.join(dir, 'missing'), {log: () => {}}), {restored: false});
});
test('a source that holds no keys is not a success', async () => {
  const storage = createMemoryStorage();
  const empty = path.join(dir, 'empty');
  const onlyPrevious = path.join(dir, 'only-previous');
  fs.mkdirSync(empty);
  fs.mkdirSync(onlyPrevious);
  fs.writeFileSync(path.join(onlyPrevious, 'log.previous.json'), '{"old":true}');
  fs.writeFileSync(path.join(dir, 'screener-2026-01-05.json'), '{"v":1,"keys":{}}');
  for (const source of [empty, onlyPrevious, path.join(dir, 'screener-2026-01-05.json')]) {
    const result = await putIn(storage, source);
    assert.equal(result.ok, false);
    assert.deepEqual(result.keys, []);
    assert.match(result.error, /holds no store keys/);
  }
  assert.deepEqual(await storage.keys(), []);
});
test('a copy that was cut short while writing is never put under its final name', async () => {
  await writeCopy(createMemoryStorage({portfolios: BOOK}), dir, {now: at('2026-01-05')});
  const before = fs.readFileSync(path.join(dir, 'screener-2026-01-05.json'), 'utf8');
  const cut = mock.method(fs, 'fsyncSync', handle => fs.ftruncateSync(handle, 10));
  try {
    await assert.rejects(writeCopy(createMemoryStorage({portfolios: BOOK, log: {v: 1, days: {}}}), dir, {now: at('2026-01-05')}));
  } finally {
    cut.mock.restore();
  }
  assert.equal(fs.readFileSync(path.join(dir, 'screener-2026-01-05.json'), 'utf8'), before);
  assert.deepEqual(fs.readdirSync(dir), ['screener-2026-01-05.json']);
});
test('a copy that reaches the disk garbled fails with a fixed sentence that quotes none of it', async () => {
  const garble = mock.method(fs, 'fsyncSync', handle => {
    fs.ftruncateSync(handle, 0);
    fs.writeSync(handle, 'Brokerage cash 1000', 0);
  });
  try {
    await assert.rejects(writeCopy(createMemoryStorage({portfolios: BOOK}), dir, {now: at('2026-01-05')}),
      error => error.message === 'The copy screener-2026-01-05.json was not written completely.');
  } finally {
    garble.mock.restore();
  }
  assert.deepEqual(fs.readdirSync(dir), []);
});
test('a second copy on the same day replaces that day\'s file, whole', async () => {
  await writeCopy(createMemoryStorage({portfolios: BOOK, log: {v: 1, days: {}}}), dir, {now: new Date('2026-01-05T10:00:00')});
  await writeCopy(createMemoryStorage({watchlists: {v: 1, lists: []}}), dir, {now: new Date('2026-01-05T18:00:00')});
  assert.deepEqual(fs.readdirSync(dir), ['screener-2026-01-05.json']);
  const copy = newestCopy(dir);
  assert.deepEqual(Object.keys(copy.keys), ['watchlists'], 'nothing of the earlier copy is left in it');
  assert.equal(copy.madeAt, new Date('2026-01-05T18:00:00').toISOString());
});

const COPY = {log: {v: 1, days: {}}, portfolios: BOOK, watchlists: {v: 1, lists: []}};
/** A store whose writes fail from the given write on, as a database that stops answering. */
function failingFrom(storage, nth) {
  let writes = 0;
  return {...storage, write: async (key, value) => {
    if (++writes >= nth) throw Object.assign(new Error('connection closed'), {name: 'MongoNetworkError'});
    return storage.write(key, value);
  }};
}

test('a put-back cut short is finished at the next start, and says so', async () => {
  await writeCopy(createMemoryStorage(COPY), dir, {now: at('2026-01-05')});
  const store = createMemoryStorage();
  await assert.rejects(restoreIfEmpty(failingFrom(store, 2), dir, {log: () => {}}), /connection closed/);
  assert.deepEqual(await store.keys(), ['log'], 'the first key went in before the database stopped');
  const lines = [];
  assert.deepEqual(await restoreIfEmpty(store, dir, {log: line => lines.push(line)}),
    {restored: true, finished: true, from: 'screener-2026-01-05.json', keys: 2});
  assert.deepEqual(lines, ['Finished putting back the copy screener-2026-01-05.json (2 keys were missing).']);
  for (const [key, value] of Object.entries(COPY)) assert.deepEqual((await store.read(key)).value, value);
});
test('a store that differs from the newest copy in one key, or holds a key the copy lacks, is left exactly as it is', async () => {
  await writeCopy(createMemoryStorage(COPY), dir, {now: at('2026-01-05')});
  const changed = {...BOOK, portfolios: [{id: 'p1', name: 'Brokerage', cash: 2000}]};
  for (const held of [{log: COPY.log, portfolios: changed}, {log: COPY.log, 'recorder-status': {ranAt: 'x', ok: true}}]) {
    const store = createMemoryStorage(held);
    const lines = [];
    assert.deepEqual(await restoreIfEmpty(store, dir, {log: line => lines.push(line)}), {restored: false});
    assert.deepEqual(lines, []);
    assert.deepEqual(await store.keys(), Object.keys(held).sort());
    for (const [key, value] of Object.entries(held)) assert.deepEqual((await store.read(key)).value, value);
  }
});
test('a put-back whose read-back differs stops and says the copy could not be put back faithfully', async () => {
  await writeCopy(createMemoryStorage(COPY), dir, {now: at('2026-01-05')});
  const store = createMemoryStorage();
  const lossy = {...store, read: async key => ({value: {...(await store.read(key)).value, v: 9}})};
  await assert.rejects(restoreIfEmpty(lossy, dir, {log: () => {}}),
    error => error.message === 'The copy screener-2026-01-05.json could not be put back faithfully.');
});
test('one copy file is a source for the import', async () => {
  await writeCopy(createMemoryStorage(COPY), dir, {now: at('2026-01-05')});
  const store = createMemoryStorage();
  assert.deepEqual(await putIn(store, path.join(dir, 'screener-2026-01-05.json')),
    {ok: true, keys: ['log', 'portfolios', 'watchlists'].map(key => ({key, state: 'same'}))});
  for (const [key, value] of Object.entries(COPY)) assert.deepEqual((await store.read(key)).value, value);
});
test('the copies folder is refused as a source: it says to name one copy file, and writes nothing', async () => {
  await writeCopy(createMemoryStorage(COPY), dir, {now: at('2026-01-05')});
  await writeCopy(createMemoryStorage(COPY), dir, {now: at('2026-01-06')});
  const store = createMemoryStorage();
  const result = await putIn(store, dir);
  assert.equal(result.ok, false);
  assert.deepEqual(result.keys, []);
  assert.match(result.error, /name one copy file/);
  assert.deepEqual(await store.keys(), []);
});
test('a write that fails during the import names the key it was writing and the keys already in', async () => {
  fs.writeFileSync(path.join(dir, 'log.json'), '{"v":1,"days":{}}');
  fs.writeFileSync(path.join(dir, 'portfolios.json'), JSON.stringify(BOOK));
  fs.writeFileSync(path.join(dir, 'watchlists.json'), '{"v":1,"lists":[]}');
  const store = createMemoryStorage();
  await assert.rejects(putIn(failingFrom(store, 2), dir), error => {
    assert.deepEqual([error.stoppedAt, error.written], ['portfolios', ['log']]);
    return true;
  });
});
