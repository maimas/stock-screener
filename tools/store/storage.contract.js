'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');

/** Every storage must pass these. `make` gives a new, empty one. All values are made up. */
function contract(name, make) {
  const run = (title, body) => test(`${name}: ${title}`, async () => {
    const storage = await make();
    try { await body(storage); } finally { await storage.close(); }
  });
  const DAY = {spy: 1.5, vix: 20, s: {'BRK.B': {p: 10, n: 3}, 'BF-B': {p: 2.25}, '^VIX': {p: 1}, '$odd': {p: 9}, 'a.b.c': {p: 0}, 'Ünï': {t: 'né'}}};

  run('nothing saved yet reads as null', async s => {
    assert.deepEqual(await s.read('fresh'), {value: null});
    assert.deepEqual(await s.previous('fresh'), {value: null});
    assert.deepEqual(await s.keys(), []);
  });
  run('gives back exactly what was written: awkward key names, their order, the numbers', async s => {
    const value = {v: 1, days: {'2026-01-05': DAY}, list: [3, 1, 2], zero: 0, no: false, none: null, big: 3000000000000};
    await s.write('log', value);
    const back = (await s.read('log')).value;
    assert.deepEqual(back, value);
    assert.equal(JSON.stringify(back), JSON.stringify(value), 'the order of the keys is kept');
  });
  run('a write keeps the version it replaced, one back', async s => {
    await s.write('book', {n: 1}); await s.write('book', {n: 2}); await s.write('book', {n: 3});
    assert.deepEqual(await s.read('book'), {value: {n: 3}});
    assert.deepEqual(await s.previous('book'), {value: {n: 2}});
  });
  run('a merge adds keys, merges objects, removes a key sent as null and replaces the rest', async s => {
    assert.deepEqual(await s.merge('log', {days: {a: {x: 1}}}), {saved: true});
    await s.merge('log', {days: {a: {y: 2}, b: [1]}});
    await s.merge('log', {days: {a: {x: null}, b: [2]}});
    assert.deepEqual(await s.read('log'), {value: {days: {a: {y: 2}, b: [2]}}});
  });
  run('20 merges sent together all land', async s => {
    await Promise.all(Array.from({length: 20}, (_, i) => s.merge('log', {days: {[`d${i}`]: i}})));
    assert.equal(Object.keys((await s.read('log')).value.days).length, 20);
  });
  run('lists what is saved, in order', async s => {
    await s.write('watchlists', {}); await s.write('log', {});
    assert.deepEqual(await s.keys(), ['log', 'watchlists']);
  });
  run('refuses a name that is not a store key', async s => {
    for (const key of ['../x', 'A', 'a.b', '', 'log.previous']) {
      await assert.rejects(() => s.read(key), /key/i);
      await assert.rejects(() => s.write(key, {}), /key/i);
      await assert.rejects(() => s.merge(key, {a: 1}), /key/i);
    }
  });
}

module.exports = {contract};
