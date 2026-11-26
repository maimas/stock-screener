'use strict';
/**
 * A dated copy of everything in the store as plain JSON, a way to put the newest copy back into an empty store,
 * and the import of existing files into a store. These handle the only copy of someone's records, so the rules
 * are strict: a key that is already saved is never written over unless asked, a copy file only ever appears
 * complete, nothing is written when any source file could not be read, and no message ever holds a value, only
 * key names, file names and counts.
 */
const fs = require('node:fs');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const {KEY} = require('./keys');
const {localDay} = require('./day');

const COPY_NAME = /^screener-\d{4}-\d{2}-\d{2}\.json$/;
const DAY = 24 * 3600e3;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const soundCopy = copy => isObject(copy) && copy.v === 1 && isObject(copy.keys);

function copyNames(dir) {
  try {
    return fs.readdirSync(dir).filter(name => COPY_NAME.test(name)).sort();
  } catch (error) {
    // No folder yet is just no copies. Any other failure must not look the same, or a store would start empty
    // without a word when its copies could not be read.
    if (error.code === 'ENOENT') {
      return [];
    }
    // The code goes along, so the daily copy's status can name it without the path.
    throw Object.assign(new Error(`The copies folder ${path.basename(dir)} could not be read (${error.code}).`), {code: error.code});
  }
}

/**
 * Writes under another name first, so a crash can never leave a half-written file under the final one, and
 * checks what reached the disk is a whole copy before it takes the final name.
 */
function writeWhole(file, text) {
  const temporary = `${file}.tmp`;
  try {
    const handle = fs.openSync(temporary, 'w');
    try {
      fs.writeFileSync(handle, text);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    const onDisk = fs.readFileSync(temporary, 'utf8');
    let whole = false;
    try {
      whole = soundCopy(JSON.parse(onDisk));
    } catch {
      // The parser's own message quotes the text, which is someone's records: only the fixed sentence below is said.
    }
    if (!whole) {
      throw new Error(`The copy ${path.basename(file)} was not written completely.`);
    }
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, {force: true});
    throw error;
  }
}

async function writeCopy(storage, dir, {now = new Date(), keep = 30} = {}) {
  const values = {};
  for (const key of await storage.keys()) {
    const {value} = await storage.read(key);
    if (value !== null && value !== undefined) {
      values[key] = value;
    }
  }
  const count = Object.keys(values).length;
  if (count === 0) {
    return undefined;
  }
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `screener-${localDay(now)}.json`);
  writeWhole(file, JSON.stringify({v: 1, madeAt: now.toISOString(), keys: values}));
  // Thinning happens only after the new copy is safely in place, so it never leaves fewer copies than before.
  const names = copyNames(dir);
  for (const old of names.slice(0, Math.max(0, names.length - keep))) {
    fs.rmSync(path.join(dir, old), {force: true});
  }
  return {file, keys: count};
}

function newestCopy(dir) {
  for (const name of copyNames(dir).reverse()) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
      throw new Error(`The copy ${name} could not be opened (${error.code}).`);
    }
    try {
      const copy = JSON.parse(text);
      if (soundCopy(copy)) {
        return {file: path.join(dir, name), madeAt: copy.madeAt, keys: copy.keys};
      }
    } catch {
      // Half-written or not JSON: pass over it and try the one before.
    }
  }
  return undefined;
}

function copyIsDue(dir, now) {
  const newest = newestCopy(dir);
  const made = newest ? Date.parse(newest.madeAt) : NaN;
  return Number.isNaN(made) || now.getTime() - made > DAY;
}

/**
 * Writes the wanted entries (key to value), leaving alone any key in `existing` unless `replace`, then reads
 * every written key back and compares it with what was given. When a write or a read fails, the error is passed on
 * with `stoppedAt` (the key it was at) and `written` (the keys already written), so whoever ran it can tell what is in.
 */
async function writeAndCheck(storage, entries, existing, replace) {
  const result = [];
  for (const key of Object.keys(entries).sort()) {
    if (existing.has(key) && !replace) {
      result.push({key, state: 'kept'});
      continue;
    }
    try {
      await storage.write(key, entries[key]);
      const {value} = await storage.read(key);
      result.push({key, state: isDeepStrictEqual(value, entries[key]) ? 'same' : 'different'});
    } catch (error) {
      const stopped = error !== null && typeof error === 'object' ? error : new Error(String(error));
      throw Object.assign(stopped, {stoppedAt: key, written: result.filter(entry => entry.state !== 'kept').map(entry => entry.key)});
    }
  }
  return result;
}

/**
 * A store whose every key is in the newest copy with an equal value, and that lacks some of the copy's keys, is a
 * put-back that was cut short: keys are never removed and nothing is answered before the put-back is done, so no
 * other store looks like that. The missing keys are written and checked. Any other store is left exactly as it is.
 */
async function finishIfCutShort(storage, dir, present, log) {
  let copy;
  try {
    copy = newestCopy(dir);
  } catch {
    // Copies that cannot be read cannot show a put-back was cut short; a store in use is not stopped for that, and
    // the daily copy's status tells of the folder.
    return {restored: false};
  }
  const missing = copy ? Object.keys(copy.keys).filter(key => !present.includes(key)) : [];
  if (missing.length === 0) {
    return {restored: false};
  }
  for (const key of present) {
    if (!Object.hasOwn(copy.keys, key) || !isDeepStrictEqual((await storage.read(key)).value, copy.keys[key])) {
      return {restored: false};
    }
  }
  const from = path.basename(copy.file);
  if (!missing.every(key => KEY.test(key))) {
    throw new Error(`The copy ${from} holds a name that is not a store key, so it was not put back.`);
  }
  const outcome = await writeAndCheck(storage, copy.keys, new Set(present), false);
  if (outcome.some(entry => entry.state === 'different')) {
    throw new Error(`The copy ${from} could not be put back faithfully.`);
  }
  log(`Finished putting back the copy ${from} (${missing.length} keys were missing).`);
  return {restored: true, finished: true, from, keys: missing.length};
}

async function restoreIfEmpty(storage, dir, {log = console.log} = {}) {
  const present = await storage.keys();
  if (present.length > 0) {
    return finishIfCutShort(storage, dir, present, log);
  }
  const copy = newestCopy(dir);
  const names = copy ? Object.keys(copy.keys).sort() : [];
  if (names.length === 0) {
    return {restored: false};
  }
  const from = path.basename(copy.file);
  if (!names.every(key => KEY.test(key))) {
    throw new Error(`The copy ${from} holds a name that is not a store key, so it was not put back.`);
  }
  const outcome = await writeAndCheck(storage, copy.keys, new Set(), false);
  if (outcome.some(entry => entry.state !== 'same')) {
    throw new Error(`The copy ${from} could not be put back faithfully.`);
  }
  log(`Put back the copy ${from} (${names.length} keys).`);
  return {restored: true, from, keys: names.length};
}

/** What to put in: the key to value entries of a copy file or of a folder of <key>.json files. */
function readSource(source) {
  const name = path.basename(source);
  const unreadable = what => ({error: `Could not read ${what} as JSON, so nothing was written.`});
  let stat;
  try {
    stat = fs.statSync(source);
  } catch {
    return unreadable(name);
  }
  const parse = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  if (stat.isFile()) {
    let copy;
    try {
      copy = parse(source);
    } catch {
      return unreadable(name);
    }
    return soundCopy(copy) ? {entries: copy.keys} : {error: `${name} is not a copy of the store, so nothing was written.`};
  }
  const entries = {};
  let files;
  try {
    files = fs.readdirSync(source);
  } catch {
    return unreadable(name);
  }
  // The names of daily copies fit the key pattern, so the copies folder would go in as keys named after them.
  if (files.some(file => COPY_NAME.test(file))) {
    return {error: `${name} holds daily copies, so nothing was written: name one copy file in it instead.`};
  }
  for (const file of files.sort()) {
    const key = file.endsWith('.json') ? file.slice(0, -5) : '';
    if (!KEY.test(key)) {
      continue;
    }
    try {
      entries[key] = parse(path.join(source, file));
    } catch {
      return unreadable(file);
    }
  }
  return {entries};
}

async function putIn(storage, source, {replace = false} = {}) {
  const read = readSource(source);
  if (read.error) {
    return {ok: false, keys: [], error: read.error};
  }
  if (Object.keys(read.entries).length === 0) {
    return {ok: false, keys: [], error: `${path.basename(source)} holds no store keys, so nothing was written.`};
  }
  if (!Object.keys(read.entries).every(key => KEY.test(key))) {
    return {ok: false, keys: [], error: `${path.basename(source)} holds a name that is not a store key, so nothing was written.`};
  }
  const existing = new Set(await storage.keys());
  const keys = await writeAndCheck(storage, read.entries, existing, replace);
  return {ok: keys.every(entry => entry.state === 'same'), keys};
}

module.exports = {writeCopy, newestCopy, copyIsDue, restoreIfEmpty, putIn};
