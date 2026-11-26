'use strict';
const {test, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {findings, splitPaths} = require('./safe-to-share');

let root;
let clean;

/** A project folder whose ignore files hold every line they should. */
function makeClean() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-check-'));
  fs.writeFileSync(path.join(dir, '.dockerignore'), 'data\n.git\n.env\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '/data\n.env\n');
  return dir;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'share-check-'));
  clean = makeClean();
});
afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
  fs.rmSync(clean, {recursive: true, force: true});
});

test('a clean project has nothing to report', () => {
  assert.deepEqual(findings({root: clean, tracked: ['README.md', 'src/main.ts']}), {problems: [], reminders: []});
});

test('names a saved file in data/, a tracked one, a tracked settings file, and ignore files that miss a line', () => {
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'portfolios.json'), '{}');
  fs.writeFileSync(path.join(root, '.dockerignore'), 'node_modules\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '/dist\n');
  const {problems} = findings({root, tracked: ['data/log.json', '.env.local', 'README.md']});
  for (const part of ['data/portfolios.json', 'data/log.json', '.env.local', '.dockerignore', '.gitignore']) {
    assert.ok(problems.some(line => line.includes(part)), part);
  }
});

test('an old copy of the project kept inside .git is a problem, and the line says to move it out', () => {
  fs.mkdirSync(path.join(clean, '.git', 'cleanup-backup'), {recursive: true});
  const {problems, reminders} = findings({root: clean, tracked: []});
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('.git/cleanup-backup'));
  assert.ok(problems[0].includes('old copy of the project'));
  assert.ok(problems[0].includes('saved records'));
  assert.ok(problems[0].includes('move it out of the project folder'));
  assert.deepEqual(reminders, []);
});

test('without that folder in .git there is no problem about it', () => {
  fs.mkdirSync(path.join(clean, '.git'), {recursive: true});
  assert.deepEqual(findings({root: clean, tracked: []}), {problems: [], reminders: []});
});

for (const name of ['.env', '.superpowers', '.claude', '.idea', '.impeccable']) {
  test(`${name} in the project folder gives a reminder that names it, never a problem`, () => {
    fs.mkdirSync(path.join(clean, name));
    const {problems, reminders} = findings({root: clean, tracked: []});
    assert.deepEqual(problems, []);
    assert.equal(reminders.length, 1);
    assert.ok(reminders[0].includes(name));
    assert.ok(reminders[0].includes('as the repository, not as a copy of this folder'));
  });
}

test('one reminder names every one of those that is there, and only those', () => {
  fs.writeFileSync(path.join(clean, '.env'), 'SCREENER_TZ=Europe/Berlin\n');
  fs.mkdirSync(path.join(clean, '.idea'));
  const {reminders} = findings({root: clean, tracked: []});
  assert.equal(reminders.length, 1);
  assert.ok(reminders[0].includes('.env') && reminders[0].includes('.idea'));
  assert.ok(!reminders[0].includes('.claude') && !reminders[0].includes('.superpowers'));
});

test('a problem line never holds what is inside a file', () => {
  fs.mkdirSync(path.join(clean, 'data'));
  fs.writeFileSync(path.join(clean, 'data', 'notes.json'), '{"secret":"hunter2"}');
  const {problems} = findings({root: clean, tracked: []});
  assert.equal(problems.length, 1);
  assert.ok(!problems[0].includes('hunter2'));
});

test('a saved file in data/ is named once, as a path from the project folder', () => {
  fs.mkdirSync(path.join(clean, 'data'));
  fs.writeFileSync(path.join(clean, 'data', 'portfolios.json'), '{}');
  const {problems} = findings({root: clean, tracked: []});
  assert.deepEqual(problems, ['data/portfolios.json is a saved file of this computer.']);
});

test('a list of paths from git is split on the zero byte, so a name with odd letters stays whole', () => {
  assert.deepEqual(splitPaths('data/café.json\0README.md\0'), ['data/café.json', 'README.md']);
  assert.deepEqual(splitPaths(''), []);
});
