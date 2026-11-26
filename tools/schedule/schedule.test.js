'use strict';
// Tests for what would be registered with Windows. Nothing is registered here: only the definitions are checked.
const test = require('node:test');
const assert = require('node:assert/strict');
const {JOBS, definitionOf, registerScript, removeScript} = require('./schedule');

const WHERE = {node: 'C:\\Program Files\\nodejs\\node.exe', root: 'C:\\projects\\stock-screener', now: new Date('2026-11-23T12:00:00Z')};

test('the backtests are re-run on fresh data every four weeks, on a Saturday morning', () => {
  const job = definitionOf('evidence', WHERE);
  assert.equal(job.task, 'Stock screener - backtests');
  assert.deepEqual(job.days, ['Saturday']);
  assert.equal(job.weeksInterval, 4);
  assert.equal(job.time, '09:00');
  assert.equal(job.firstRun, '2026-11-28 09:00', 'the Saturday after Monday 23 November');
  assert.equal(job.script, 'C:\\projects\\stock-screener\\tools\\evidence\\update.js');
  assert.deepEqual(job.args, ['--refresh']);
});

test('what is registered: a hidden run of node on the script, from the project folder, caught up after a missed start', () => {
  const script = registerScript(definitionOf('evidence', WHERE));
  assert.match(script, /Register-ScheduledTask -TaskName 'Stock screener - backtests'/);
  assert.match(script, /-Execute 'conhost\.exe'/);
  assert.ok(script.includes(`--headless "C:\\Program Files\\nodejs\\node.exe" "C:\\projects\\stock-screener\\tools\\evidence\\update.js" --refresh`));
  assert.match(script, /-WorkingDirectory 'C:\\projects\\stock-screener'/);
  assert.match(script, /-Weekly -WeeksInterval 4 -DaysOfWeek Saturday -At '2026-11-28 09:00'/);
  assert.match(script, /-StartWhenAvailable/);
  assert.match(script, /-Force/, 'installing twice replaces the task instead of failing');
});

test('the backtests task passes --refresh and may run for an hour', () => {
  const script = registerScript(definitionOf('evidence', WHERE));
  assert.ok(script.includes(`tools\\evidence\\update.js" --refresh'`));
  assert.match(script, /-WeeksInterval 4 -DaysOfWeek Saturday -At '2026-11-28 09:00'/);
  assert.match(script, /New-TimeSpan -Minutes 60/);
});

test('a folder name with an apostrophe cannot break out of the command', () => {
  const script = registerScript(definitionOf('evidence', {...WHERE, root: "W:\\it's here"}));
  assert.ok(script.includes("-WorkingDirectory 'W:\\it''s here'"));
});

test('removing asks Windows to forget exactly that task, and is quiet when it is not there', () => {
  const script = removeScript(JOBS.evidence);
  assert.match(script, /Unregister-ScheduledTask -TaskName 'Stock screener - backtests' -Confirm:\$false/);
  assert.match(script, /Get-ScheduledTask -TaskName 'Stock screener - backtests' -ErrorAction SilentlyContinue/);
});

test('the backtests are the only scheduled job: the app records the daily log itself', () => {
  assert.deepEqual(Object.keys(JOBS), ['evidence']);
});

test('an unknown job is refused', () => {
  assert.throws(() => definitionOf('log', WHERE), /Unknown job "log": choose one of evidence\./);
});

test('the backtests task is told exactly which Python to use, so it does not depend on what a scheduled run can find', () => {
  const job = definitionOf('evidence', {...WHERE, python: 'C:/Python312/python.exe'});
  assert.deepEqual(job.args, ['--refresh', '--python', '"C:/Python312/python.exe"']);
  assert.ok(registerScript(job).includes('update.js" --refresh --python "C:/Python312/python.exe"\''));
});

test('the first backtests run is never the moment of registering: registered on a Saturday after 9, it starts a week later', () => {
  // Windows makes up a start that was missed earlier the same day, which would run a 12-minute refresh at once.
  const saturdayNight = new Date(2026, 10, 21, 23, 30), saturdayEarly = new Date(2026, 10, 21, 8, 0);
  assert.equal(definitionOf('evidence', {...WHERE, now: saturdayNight}).firstRun, '2026-11-28 09:00');
  assert.equal(definitionOf('evidence', {...WHERE, now: saturdayEarly}).firstRun, '2026-11-21 09:00');
});

