'use strict';
// Tests for the daily schedule: when a recording is due, and that a missed day is made up once, never twice.
// The clock and the timer are set by hand, and the recorder and the copy are stand-ins that count their calls.
const {test, beforeEach, afterEach, mock} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {lastDue, nextDue, isDue, startDaily} = require('./daily');
const {createMemoryStorage} = require('../store/storage-memory');
const {writeCopy} = require('../store/backup');

const utc = text => new Date(text);
const iso = date => date.toISOString();

let clock, storage, dir, timers, recorded, copied, handles;
const setTimer = (fire, delay) => { timers.push({delay, fire}); return timers.length; };
const record = async ({now}) => {
  recorded++;
  await storage.write('recorder-status', {ranAt: now.toISOString(), ok: true});
};
const copy = async () => { copied++; };
/** Waits until everything the module started has finished; the stand-ins do no real waiting. */
async function settled() {
  for (let turn = 0; turn < 10; turn++) await new Promise(resolve => setImmediate(resolve));
}
function start(options) {
  const handle = startDaily({storage, setTimer, clearTimer: () => {}, ...options});
  handles.push(handle);
  return handle;
}

beforeEach(() => {
  storage = createMemoryStorage();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-test-'));
  timers = [];
  recorded = 0;
  copied = 0;
  handles = [];
});
afterEach(() => {
  handles.forEach(handle => handle.stop());
  fs.rmSync(dir, {recursive: true, force: true});
});

test('16:30 in New York, in winter and in summer', () => {
  assert.equal(iso(lastDue(utc('2026-01-05T22:00:00Z'))), '2026-01-05T21:30:00.000Z');   // a Monday, winter time
  assert.equal(iso(lastDue(utc('2026-07-06T21:00:00Z'))), '2026-07-06T20:30:00.000Z');   // a Monday, summer time
  assert.equal(iso(lastDue(utc('2026-01-05T21:29:59Z'))), '2026-01-02T21:30:00.000Z');   // not yet: last Friday's
  assert.equal(iso(lastDue(utc('2026-03-08T12:00:00Z'))), '2026-03-06T21:30:00.000Z');   // the Sunday the clocks go forward: last Friday, still winter time
  assert.equal(iso(lastDue(utc('2026-03-09T22:00:00Z'))), '2026-03-09T20:30:00.000Z');   // the Monday after: summer time
  assert.equal(iso(lastDue(utc('2026-11-01T12:00:00Z'))), '2026-10-30T20:30:00.000Z');   // the Sunday the clocks go back: last Friday, still summer time
  assert.equal(iso(lastDue(utc('2026-11-02T22:00:00Z'))), '2026-11-02T21:30:00.000Z');   // the Monday after: winter time
});
test('a weekend has no recording of its own', () => {
  assert.equal(iso(lastDue(utc('2026-01-10T12:00:00Z'))), '2026-01-09T21:30:00.000Z');
  assert.equal(iso(nextDue(utc('2026-01-10T12:00:00Z'))), '2026-01-12T21:30:00.000Z');
  assert.equal(iso(nextDue(utc('2026-01-05T21:30:00Z'))), '2026-01-06T21:30:00.000Z');
});
test('a run is due when none is on record, or the last one was before the last 16:30', () => {
  const now = utc('2026-01-06T08:00:00Z');
  assert.equal(isDue(undefined, now), true);
  assert.equal(isDue({ranAt: 'not a date'}, now), true);
  assert.equal(isDue({ranAt: '2026-01-05T21:00:00.000Z'}, now), true);
  assert.equal(isDue({ranAt: '2026-01-05T21:30:05.000Z', ok: false}, now), false, 'a failed run is not due again by itself: the schedule tries it again after an hour');
});

test('makes up a missed day once when it starts, then never waits longer than a minute', async () => {
  clock = utc('2026-01-06T08:00:00Z');                     // started on Tuesday morning; Monday was missed
  start({backupDir: dir, record, copy, now: () => clock, log: () => {}});
  await settled();
  assert.equal(recorded, 1);
  assert.equal(copied, 1);
  assert.equal(timers.at(-1).delay, 60_000, 'a timer does not count the time the computer sleeps, so it is never set for long');
});
test('a wake before anything is due only sets the timer again: no read of the store, no line', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  const lines = [];
  start({record, copy, now: () => clock, log: line => lines.push(line)});
  await settled();
  let reads = 0;
  const read = storage.read;
  storage.read = async key => { reads++; return read(key); };
  for (const minute of ['08:01', '08:02', '21:29']) {
    clock = utc(`2026-01-06T${minute}:00Z`); timers.at(-1).fire(); await settled();
  }
  assert.deepEqual([reads, lines, recorded], [0, [], 1]);
  assert.ok(timers.every(timer => timer.delay <= 60_000));
});
test('woken a minute after the due time, having slept through it, it records with the clock of that moment', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  const asked = [];
  start({record: async args => { asked.push(iso(args.now)); return record(args); }, now: () => clock, log: () => {}});
  await settled();
  clock = utc('2026-01-06T21:31:00Z'); timers.at(-1).fire(); await settled();   // the computer slept from 08:01
  assert.deepEqual(asked, ['2026-01-06T08:00:00.000Z', '2026-01-06T21:31:00.000Z']);
});
test('a timer that fires early records nothing, and one that fires twice records once', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  start({backupDir: dir, record, copy, now: () => clock, log: () => {}});
  await settled();
  clock = utc('2026-01-06T21:29:00Z'); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 1, 'a minute early: nothing is due yet');
  clock = utc('2026-01-06T21:30:01Z'); timers.at(-1).fire(); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 2);
});
test('woken late after the computer slept, it records once for the days it missed', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  start({backupDir: dir, record, copy, now: () => clock, log: () => {}});
  await settled();
  clock = utc('2026-01-09T03:00:00Z'); timers.at(-1).fire(); await settled();   // three recordings were missed
  assert.equal(recorded, 2);
});
test('a recording that throws is logged, and the next one is still set', async () => {
  const lines = [];
  start({record: async () => { throw new Error('no network'); }, now: () => utc('2026-01-06T08:00:00Z'), log: line => lines.push(line)});
  await settled();
  assert.match(lines.join('\n'), /no network/);
  assert.equal(timers.length, 1);
});
test('with nothing due to record, it still makes the daily copy when that is due; without a folder it makes none', async () => {
  await storage.write('recorder-status', {ranAt: '2026-01-06T07:59:00.000Z', ok: true});
  start({backupDir: dir, record, copy, now: () => utc('2026-01-06T08:00:00Z'), log: () => {}});
  await settled();
  assert.deepEqual([recorded, copied], [0, 1]);
  await storage.write('recorder-status', {ranAt: '2026-01-05T08:00:00.000Z', ok: true});
  start({record, copy, now: () => utc('2026-01-06T08:00:00Z'), log: () => {}});
  await settled();
  assert.deepEqual([recorded, copied], [1, 1], 'recorded, and no copy: there is no folder to put it in');
});

test('a copy that throws, or a folder that cannot be read, is logged and the next timer is still set', async () => {
  const lines = [];
  clock = utc('2026-01-06T08:00:00Z');
  start({backupDir: dir, record, copy: async () => { throw new Error('disk full'); }, now: () => clock, log: line => lines.push(line)});
  await settled();
  assert.match(lines.join('\n'), /disk full/);
  assert.equal(timers.length, 1);
  const file = path.join(dir, 'not-a-folder');
  fs.writeFileSync(file, 'x');
  await storage.write('recorder-status', {ranAt: '2026-01-06T07:59:00.000Z', ok: true});
  start({backupDir: file, record, copy, now: () => clock, log: line => lines.push(line)});
  await settled();
  assert.equal(timers.length, 2, 'the timer is set even when the folder check fails');
  assert.equal((await storage.read('copy-status')).value.message, 'The daily copy could not be written (ENOTDIR).');
});
test('only one timer is pending, and a stopped schedule does nothing more', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  const cleared = [];
  const handle = start({backupDir: dir, record, copy, now: () => clock, clearTimer: id => cleared.push(id), log: () => {}});
  await settled();
  timers.at(-1).fire(); await settled();
  assert.deepEqual(cleared, [1], 'the earlier timer is cleared before a new one is set');
  handle.stop();
  assert.deepEqual(cleared, [1, 2]);
  const before = timers.length;
  clock = utc('2026-01-06T21:31:00Z'); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 1);
  assert.equal(timers.length, before);
});

test('a log that throws cannot stop the schedule: the next timer is set and the queue is not left rejected', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  let working = false;
  const flaky = async args => {
    if (!working) throw new Error('no network');
    return record(args);
  };
  start({backupDir: dir, record: flaky, copy, now: () => clock, log: () => { throw new Error('log is broken'); }});
  await settled();
  assert.equal(timers.length, 1, 'the next timer is set although recording and logging both failed');
  working = true;
  clock = utc('2026-01-06T21:30:01Z'); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 1, 'a later tick still runs');
  assert.equal(timers.length, 2);
});

test('every recording is followed by a copy, also when it was quicker than the one the day before', async () => {
  const made = [];
  const realCopy = async (into, folder, options) => { made.push(iso(options.now)); return writeCopy(into, folder, options); };
  const slow = seconds => async args => { const done = record(args); clock = new Date(clock.getTime() + seconds * 1000); return done; };
  let recordNow = slow(30);
  clock = utc('2026-01-05T21:30:00Z');                     // Monday, 16:30 in New York; it takes 30 seconds
  start({backupDir: dir, record: args => recordNow(args), copy: realCopy, now: () => clock, log: () => {}});
  await settled();
  recordNow = slow(8);                                     // Tuesday it takes 8: the copy is not yet a day old
  clock = utc('2026-01-06T21:30:00Z'); timers.at(-1).fire(); await settled();
  assert.deepEqual([recorded, made], [2, ['2026-01-05T21:30:30.000Z', '2026-01-06T21:30:08.000Z']]);
});
test('without a recording it looks at the copies at most once an hour', async () => {
  await storage.write('recorder-status', {ranAt: '2026-01-06T07:59:00.000Z', ok: true});
  clock = utc('2026-01-06T08:00:00Z');
  const fresh = path.join(dir, 'fresh');
  start({backupDir: fresh, record, copy: writeCopy, now: () => clock, log: () => {}});
  await settled();
  assert.equal(fs.readdirSync(fresh).length, 1, 'no copy yet, so one is made');
  const read = fs.readdirSync;
  let looks = 0;
  const counting = mock.method(fs, 'readdirSync', (...args) => { if (args[0] === fresh) looks++; return read(...args); });
  try {
    for (const minute of ['08:01', '08:30', '08:59']) {
      clock = utc(`2026-01-06T${minute}:00Z`); timers.at(-1).fire(); await settled();
    }
    assert.equal(looks, 0);
    clock = utc('2026-01-06T09:00:00Z'); timers.at(-1).fire(); await settled();
    assert.equal(looks, 1);
  } finally {
    counting.mock.restore();
  }
});

test('a copy that works leaves when it was tried and the name of its file under copy-status', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  start({backupDir: dir, record, copy: writeCopy, now: () => clock, log: () => {}});
  await settled();
  const {value} = await storage.read('copy-status');
  assert.deepEqual(value, {triedAt: '2026-01-06T08:00:00.000Z', ok: true, file: fs.readdirSync(dir)[0]});
  assert.match(value.file, /^screener-\d{4}-\d{2}-\d{2}\.json$/);
});
test('a copy that fails leaves a fixed sentence with at most the error code, and the schedule goes on', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  const denied = Object.assign(new Error('EACCES: permission denied, open /somewhere/screener-2026-01-06.json.tmp'), {code: 'EACCES'});
  start({backupDir: dir, record, copy: async () => { throw denied; }, now: () => clock, log: () => {}});
  await settled();
  assert.deepEqual((await storage.read('copy-status')).value,
    {triedAt: '2026-01-06T08:00:00.000Z', ok: false, message: 'The daily copy could not be written (EACCES).'});
  assert.equal(timers.length, 1);
  storage = createMemoryStorage();
  start({backupDir: dir, record, copy: async () => { throw new Error('the copy {"cash": 1000} was cut'); }, now: () => clock, log: () => {}});
  await settled();
  assert.equal((await storage.read('copy-status')).value.message, 'The daily copy could not be written.');
});
test('when copy-status cannot be written, that is logged and the schedule goes on', async () => {
  clock = utc('2026-01-06T08:00:00Z');
  const lines = [];
  const write = storage.write;
  storage.write = async (key, value) => { if (key === 'copy-status') throw new Error('no answer'); return write(key, value); };
  start({backupDir: dir, record, copy: writeCopy, now: () => clock, log: line => lines.push(line)});
  await settled();
  assert.match(lines.join('\n'), /copy.*could not be kept/i);
  assert.equal(timers.length, 1);
  clock = utc('2026-01-06T21:30:01Z'); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 2);
});

test('a recording that failed is tried again once an hour has passed, and one that worked is never repeated', async () => {
  let works = false;
  const failing = async ({now}) => {
    recorded++;
    const result = works ? {ok: true} : {ok: false, message: 'the data source did not answer'};
    await storage.write('recorder-status', {ranAt: now.toISOString(), ...result});
    return result;
  };
  clock = utc('2026-01-06T21:30:00Z');
  start({record: failing, now: () => clock, log: () => {}});
  await settled();
  assert.equal(recorded, 1);
  clock = utc('2026-01-06T22:29:00Z'); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 1, 'at 59 minutes: no try');
  clock = utc('2026-01-06T22:30:00Z'); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 2, 'at 60 minutes: a try');
  works = true;
  clock = utc('2026-01-06T23:30:00Z'); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 3, 'an hour later again: a try, and it works');
  for (const hour of ['2026-01-07T00:30:00Z', '2026-01-07T01:30:00Z', '2026-01-07T21:29:00Z']) {
    clock = utc(hour); timers.at(-1).fire(); await settled();
  }
  assert.equal(recorded, 3, 'a recording that worked is not repeated before the next 16:30');
});
test('a failure on record from before this start is also tried again only after its hour', async () => {
  await storage.write('recorder-status', {ranAt: '2026-01-06T21:30:00.000Z', ok: false, day: '2026-01-06', message: 'x'});
  clock = utc('2026-01-06T21:45:00Z');
  start({record, now: () => clock, log: () => {}});
  await settled();
  assert.equal(recorded, 0);
  clock = utc('2026-01-06T22:30:00Z'); timers.at(-1).fire(); await settled();
  assert.equal(recorded, 1);
});
test('a recording that throws is tried again after an hour, not at every wake', async () => {
  clock = utc('2026-01-06T21:30:00Z');
  let tries = 0;
  start({record: async () => { tries++; throw new Error('no network'); }, now: () => clock, log: () => {}});
  await settled();
  for (const minute of ['21:31', '22:00', '22:29']) {
    clock = utc(`2026-01-06T${minute}:00Z`); timers.at(-1).fire(); await settled();
  }
  assert.equal(tries, 1);
  clock = utc('2026-01-06T22:30:00Z'); timers.at(-1).fire(); await settled();
  assert.equal(tries, 2);
});
