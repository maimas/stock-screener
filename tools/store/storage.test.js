'use strict';
const {test, after} = require('node:test');
const {MongoClient} = require('mongodb');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {contract} = require('./storage.contract');
const {openStorage} = require('./open-storage');
const {createMemoryStorage} = require('./storage-memory');
const {createMongoStorage} = require('./storage-mongo');

contract('memory', () => createMemoryStorage());

test('opening a storage without MONGO_URL says the store is a database, and does not fall back to files', async () => {
  await assert.rejects(() => openStorage({}), /Set MONGO_URL: the store is a database./);
});

test('memory: says what it is, starts with what it is given, and keeps its own copies', async () => {
  const given = {log: {days: {a: 1}}};
  const storage = createMemoryStorage(given);
  assert.equal(storage.kind, 'memory');
  given.log.days.a = 99;
  const read = (await storage.read('log')).value;
  read.days.a = 98;
  assert.deepEqual(await storage.read('log'), {value: {days: {a: 1}}});
});

test('mongo: says so when the database does not answer', async () => {
  await assert.rejects(() => createMongoStorage({url: 'mongodb://127.0.0.1:1', serverSelectionTimeoutMS: 500}));
});

// The MongoDB tests run only on a database named for them (npm run test:mongo sets it to a throwaway one), never on
// MONGO_URL, which inside the app's container is the real database.
const TEST_MONGO_URL = process.env.TEST_MONGO_URL;
if (TEST_MONGO_URL) {
  const made = [];
  const newName = () => { const name = `contract-${crypto.randomUUID().slice(0, 8)}`; made.push(name); return name; };
  const fresh = () => createMongoStorage({url: TEST_MONGO_URL, dbName: newName()});
  contract('mongo', fresh);

  test('mongo: two programs merging into one key at once both land', async () => {
    const dbName = newName();
    const [one, two] = await Promise.all([1, 2].map(() => createMongoStorage({url: TEST_MONGO_URL, dbName})));
    await Promise.all(Array.from({length: 20}, (_, i) => (i % 2 ? one : two).merge('log', {days: {[`d${i}`]: i}})));
    assert.equal(Object.keys((await one.read('log')).value.days).length, 20);
    await one.close(); await two.close();
  });

  // The test databases are removed at the end, so a run leaves the server as it found it.
  after(async () => {
    const client = new MongoClient(TEST_MONGO_URL);
    try {
      await client.connect();
      for (const name of made) {
        await client.db(name).dropDatabase();
      }
    } finally {
      await client.close();
    }
  });
}
