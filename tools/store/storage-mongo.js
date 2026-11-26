'use strict';
/**
 * The store in MongoDB. Each key is one document in the collection `store`: {_id: key, value, rev, savedAt}. The value
 * goes in whole and comes out whole, and nothing is ever updated by a path: stock symbols are keys inside the values
 * and some of them contain a dot. The document a write replaced is kept, one back, in `store_previous`.
 */
const {MongoClient} = require('mongodb');
const {assertKey} = require('./keys');
const {mergePatch} = require('./merge-patch');

const TRIES = 10;
const DUPLICATE_KEY = 11000;
const pause = () => new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));

/** The database an address names (mongodb://host/name?options), or undefined when it names none. */
function nameInAddress(url) {
  const match = /^mongodb(?:\+srv)?:\/\/[^/?]*\/([^?]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * @param url the database's address
 * @param dbName the database to use; without it the one the address names, or `screener`
 * @param serverSelectionTimeoutMS how long to wait for the database before saying it does not answer
 * @returns a storage: a plain object of functions (kind, read, previous, write, merge, keys, close)
 */
async function createMongoStorage({url, dbName = undefined, serverSelectionTimeoutMS = 5000}) {
  // A write is answered only once it is in the database's journal on disk, so "saved" survives the database being
  // stopped hard a moment later.
  const client = new MongoClient(url, {serverSelectionTimeoutMS, writeConcern: {w: 1, journal: true}});
  try {
    await client.connect();
  } catch (error) {
    await client.close().catch(() => {});           // nothing may stay open behind a failed start
    throw error;
  }
  const db = client.db(dbName ?? nameInAddress(url) ?? 'screener');
  const store = db.collection('store');
  const previous = db.collection('store_previous');

  /** One try. False means another program changed the key meanwhile: read again and try again. */
  async function replaceIfUnchanged(key, next /* (currentValue) => newValue */) {
    const current = await store.findOne({_id: key});
    const value = next(current ? current.value : null) ?? null;
    if (!current) {
      try {
        await store.insertOne({_id: key, value, rev: 1, savedAt: new Date()});
        return true;
      } catch (error) {
        if (error.code === DUPLICATE_KEY) { return false; }   // created by another program in the meantime
        throw error;
      }
    }
    await previous.replaceOne({_id: key}, {...current, replacedAt: new Date()}, {upsert: true});
    const done = await store.replaceOne({_id: key, rev: current.rev}, {value, rev: current.rev + 1, savedAt: new Date()});
    return done.matchedCount === 1;
  }

  async function change(key, next) {
    for (let attempt = 1; attempt <= TRIES; attempt++) {
      if (await replaceIfUnchanged(key, next)) {
        return;
      }
      if (attempt < TRIES) {
        await pause();
      }
    }
    throw new Error(`The store is busy: ${key}`);
  }

  // Inside this program the operations on one key run one after another, so changes sent together do not fight
  // each other. A failed operation is dropped from the chain, so it does not hold up the ones queued behind it.
  const tails = new Map();
  function inTurn(key, operation) {
    const run = (tails.get(key) ?? Promise.resolve()).then(operation);
    const tail = run.catch(() => {});
    tails.set(key, tail);
    tail.then(() => { if (tails.get(key) === tail) { tails.delete(key); } });
    return run;
  }

  return {
    kind: 'mongo',
    read: async key => {
      assertKey(key);
      const found = await store.findOne({_id: key});
      return {value: found ? found.value : null};
    },
    previous: async key => {
      assertKey(key);
      const found = await previous.findOne({_id: key});
      return {value: found ? found.value : null};
    },
    write: async (key, value) => {
      assertKey(key);
      await inTurn(key, () => change(key, () => value));
    },
    merge: async (key, patch) => {
      assertKey(key);
      await inTurn(key, () => change(key, current => mergePatch(current ?? {}, patch)));
      return {saved: true};
    },
    keys: async () => (await store.find({}, {projection: {_id: 1}}).toArray()).map(document => document._id).sort(),
    close: async () => { await client.close(); },
  };
}

module.exports = {createMongoStorage};
