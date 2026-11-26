'use strict';
/**
 * The store in memory, for tests and for trying things without touching files. It hands out and takes copies, so
 * changing an object after writing it, or after reading it, changes nothing that is stored.
 */
const {assertKey} = require('./keys');
const {mergePatch} = require('./merge-patch');

function createMemoryStorage(initial = {}) {
  const current = new Map(Object.entries(structuredClone(initial)));
  const before = new Map();
  const copy = value => (value === undefined ? null : structuredClone(value));

  function put(key, value) {
    if (current.has(key)) {
      before.set(key, current.get(key));
    }
    current.set(key, structuredClone(value));
  }

  return {
    kind: 'memory',
    read: async key => { assertKey(key); return {value: copy(current.get(key))}; },
    previous: async key => { assertKey(key); return {value: copy(before.get(key))}; },
    write: async (key, value) => { assertKey(key); put(key, value); },
    merge: async (key, patch) => {
      assertKey(key);
      put(key, mergePatch(current.get(key) ?? {}, patch));
      return {saved: true};
    },
    keys: async () => [...current.keys()].sort(),
    close: async () => {},
  };
}

module.exports = {createMemoryStorage};
