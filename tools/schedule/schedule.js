#!/usr/bin/env node
'use strict';
/**
 * Has Windows run the one job that is left outside the app: the backtests (the app records the daily log itself).
 *
 *   npm run evidence:schedule    re-run the backtests on fresh data every four weeks and update the tested numbers
 *   npm run evidence:unschedule  remove that task
 *   npm run schedule:status      show whether it is registered and when it last ran
 *
 * It is an ordinary task in the Windows Task Scheduler under your own account ("Stock screener - backtests"). It
 * runs while you are logged on, without a window, and a start missed because the computer was off is made up when
 * it is next on. Nothing else on the computer is changed, and unschedule removes the task again.
 */
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const JOBS = {
  evidence: {
    task: 'Stock screener - backtests',
    description: 'Re-runs the stock screener backtests on fresh data (tools/evidence/update.js --refresh). Remove with: npm run evidence:unschedule',
    script: ['tools', 'evidence', 'update.js'], args: ['--refresh'], needsPython: true,
    days: ['Saturday'], weeksInterval: 4,
    time: () => '09:00',
    // Never the day of registering once 9:00 has passed: Windows makes up a start missed earlier the same day,
    // which would run a 12-minute refresh the moment the task is registered.
    firstRun: now => nextOccurrence(now, 6, 9, 0),
    when: (time, firstRun) => `every fourth Saturday at ${time}, first on ${firstRun.slice(0, 10)}`,
    limitMinutes: 60,
  },
};

/** The next time it is that weekday (0 = Sunday) and time on this computer's clock, after `now`: "2026-11-28 09:00". */
function nextOccurrence(now, weekday, hour, minute) {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  at.setDate(at.getDate() + (weekday - at.getDay() + 7) % 7);
  if (at <= now) {
    at.setDate(at.getDate() + 7);
  }
  const pad = n => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(hour)}:${pad(minute)}`;
}

/**
 * Everything about one task, for a given Node program and project folder.
 *
 * @param python where Python is, for the task that runs the backtests: a scheduled run is told exactly, so it
 *               does not depend on what it can find by itself
 */
function definitionOf(name, {node = process.execPath, root = path.join(__dirname, '..', '..'), now = new Date(), python = undefined} = {}) {
  const job = JOBS[name];
  if (!job) {
    throw new Error(`Unknown job "${name}": choose one of ${Object.keys(JOBS).join(', ')}.`);
  }
  const time = job.time(now), firstRun = job.firstRun?.(now);
  return {
    task: job.task, description: job.description, days: job.days, weeksInterval: job.weeksInterval, time, firstRun,
    when: job.when(time, firstRun),
    node, root, script: path.win32.join(root, ...job.script), limitMinutes: job.limitMinutes,
    args: [...job.args, ...(job.needsPython && python ? ['--python', `"${python}"`] : [])],
  };
}

/** A PowerShell single-quoted string: nothing inside it is interpreted, and a quote is doubled. */
const quoted = text => `'${String(text).replace(/'/g, "''")}'`;

/** The PowerShell that registers (or replaces) the task. conhost --headless runs Node without a window. */
function registerScript(d) {
  const argument = ['--headless', `"${d.node}"`, `"${d.script}"`, ...d.args].join(' ');
  return [
    `$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ${quoted(argument)} -WorkingDirectory ${quoted(d.root)}`,
    `$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval ${d.weeksInterval} -DaysOfWeek ${d.days.join(',')} -At ${quoted(d.firstRun ?? d.time)}`,
    '$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries ' +
    `-ExecutionTimeLimit (New-TimeSpan -Minutes ${d.limitMinutes})`,
    `Register-ScheduledTask -TaskName ${quoted(d.task)} -Description ${quoted(d.description)} -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null`,
    `'registered'`,
  ].join('\n');
}

function removeScript(job) {
  return `if (Get-ScheduledTask -TaskName ${quoted(job.task)} -ErrorAction SilentlyContinue) { ` +
    `Unregister-ScheduledTask -TaskName ${quoted(job.task)} -Confirm:$false; 'removed' } else { 'not registered' }`;
}

function statusScript(job) {
  return `$task = Get-ScheduledTask -TaskName ${quoted(job.task)} -ErrorAction SilentlyContinue\n` +
    `if ($task) { $info = $task | Get-ScheduledTaskInfo; ` +
    `$last = if ($info.LastTaskResult -eq 267011) { 'has not run yet' } else { "last run $($info.LastRunTime), result $($info.LastTaskResult)" }; ` +
    `"registered ($($task.State)); next run $($info.NextRunTime); $last" } else { 'not registered' }`;
}

/** The Python program that runs the backtests here, by its full path. */
function findPython() {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', 'import sys; print(sys.executable)'], {encoding: 'utf8'});
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error('Python was not found. The backtests need it: install Python or put it on the PATH, then run this again.');
  }
  return result.stdout.trim();
}

function powershell(script) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {encoding: 'utf8'});
  if (result.error || result.status !== 0) {
    throw new Error((result.error?.message ?? result.stderr ?? '').trim() || `PowerShell exited with ${result.status}`);
  }
  return result.stdout.trim();
}

function main([action, ...names]) {
  const chosen = names.length ? names : Object.keys(JOBS);
  if (!['install', 'remove', 'status'].includes(action) || chosen.some(name => !JOBS[name])) {
    console.error('Usage: node tools/schedule/schedule.js install|remove|status [evidence]');
    return 2;
  }
  if (process.platform !== 'win32') {
    console.error('Scheduling is set up for Windows here. On another system, have cron run "npm run evidence -- --refresh" every few weeks.');
    return 1;
  }
  for (const name of chosen) {
    const d = definitionOf(name, {python: action === 'install' && JOBS[name].needsPython ? findPython() : undefined});
    if (action === 'install') {
      powershell(registerScript(d));
      console.log(`Registered "${d.task}": ${d.when}.`);
      console.log(`  It runs: node ${path.relative(d.root, d.script)}${d.args.length ? ' ' + d.args.join(' ') : ''}  (in ${d.root}, without a window)`);
      console.log(`  Remove it with: npm run ${name}:unschedule`);
    } else if (action === 'remove') {
      console.log(`"${d.task}": ${powershell(removeScript(JOBS[name]))}.`);
    } else {
      console.log(`"${d.task}": ${powershell(statusScript(JOBS[name]))}.`);
    }
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`Could not do that: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {JOBS, definitionOf, registerScript, removeScript, statusScript};
