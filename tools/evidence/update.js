#!/usr/bin/env node
'use strict';
/**
 * Re-runs the backtests and updates the numbers the app quotes, so no number is ever copied by hand.
 *
 *   npm run evidence                  re-run the backtests on the data already downloaded
 *   npm run evidence -- --refresh     first download fresh prices and earnings for the seven test lists
 *   npm run evidence -- --dry-run     show what would change and write nothing (also with --refresh)
 *   npm run evidence -- --write-only  only rewrite the TypeScript from the figures file (no backtests)
 *   --python <path>                   which Python runs the backtests (default: "python"; the scheduled task passes it)
 *
 * Nothing is replaced unless every step succeeded and the checks in figures.js pass. The backtests record into a
 * scratch file (and a refresh downloads into a scratch folder); only then are the figures, the generated
 * TypeScript and the downloaded data swapped in. The data a refresh replaces is kept in previous_data/.
 * The outcome of the run is handed to the running app, which shows it on the page, so a run that was stopped by a
 * check does not go unnoticed. When the app did not save it, the command says so.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {toFigures, check, render, changes, SECTIONS} = require('./figures');

const ROOT = path.join(__dirname, '..', '..');

/** The scripts whose figures the app quotes. Each works from the data already downloaded. */
const RERUN_SCRIPTS = [
  'backtest_validation3.py', 'backtest_validation4.py', 'backtest_validation5.py', 'backtest_validation6.py', 'backtest_summary.py',
  'backtest_plan.py', 'backtest_regime.py', 'backtest_sentiment.py', 'backtest_several.py',
];
/**
 * For a refresh: each of the first seven downloads its own test list when its data is missing; the summary pools
 * the first six and the plan is replayed on them (the seventh script's list, the eighth, is the take-profit test's
 * alone: pre-registered #9). The three long-history tests (1994 on) cover closed periods, so they are not
 * downloaded again and their figures carry over.
 */
const REFRESH_SCRIPTS = [
  'backtest_holdout.py', 'backtest_validation.py', 'backtest_validation2.py', 'backtest_validation3.py', 'backtest_validation4.py',
  'backtest_validation5.py', 'backtest_validation6.py', 'backtest_summary.py', 'backtest_plan.py',
];
const REFRESHED_DATA = ['holdout', 'validation', 'midcap', 'fresh', 'sixth', 'seventh', 'eighth']
  .flatMap(list => ['prices', 'earn', 'annual'].map(kind => `${list}_${kind}_cache.json`))
  .concat('spy_weekly_cache.json');

function defaultPaths() {
  const tools = path.join(ROOT, 'tools', 'signal-backtest');
  return {
    tools,
    figures: path.join(tools, 'quoted_figures.json'),
    generated: path.join(ROOT, 'src', 'app', 'watchlist', 'evidence.generated.ts'),
  };
}

/** Runs one backtest; it records its figures into `figuresFile`. Throws with the end of its error output. */
function runPython(script, cwd, figuresFile, python = process.env.PYTHON || 'python') {
  const result = spawnSync(python, [path.join(cwd, script)], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 45 * 60 * 1000,
    env: {...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1', QUOTED_FIGURES_FILE: figuresFile},
  });
  if (result.error || result.status !== 0) {
    const detail = (result.error?.message ?? result.stderr ?? '').trim().split('\n').slice(-3).join(' ');
    throw new Error(`${script} failed: ${detail || `exit code ${result.status}`}`);
  }
}

/**
 * @returns {{ok: boolean, updated: boolean, changes: string[], blocking: string[], notes: string[], status?: object}}
 *   `status` is the outcome for the page; a dry run has none.
 */
function update({refresh = false, dryRun = false, writeOnly = false, python = undefined, paths = defaultPaths(), run = runPython, log = console.log, now = new Date()} = {}) {
  const previous = readJson(paths.figures);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
  const result = {ok: false, updated: false, changes: [], blocking: [], notes: []};
  try {
    const scratchFigures = path.join(scratch, 'quoted_figures.json');
    if (previous) {
      fs.copyFileSync(paths.figures, scratchFigures);
    }
    if (!writeOnly) {
      const cwd = refresh ? scratch : paths.tools;
      if (refresh) {
        fs.readdirSync(paths.tools).filter(name => name.endsWith('.py'))
          .forEach(name => fs.copyFileSync(path.join(paths.tools, name), path.join(scratch, name)));
        log('Downloading fresh data for the seven test lists. This takes several minutes.');
      }
      for (const script of refresh ? REFRESH_SCRIPTS : RERUN_SCRIPTS) {
        log(`  running ${script}`);
        run(script, cwd, scratchFigures, python);
      }
    }
    const recorded = readJson(scratchFigures);
    const verdict = check(recorded, previous);
    result.blocking = verdict.blocking;
    result.notes = verdict.notes;
    if (result.blocking.length === 0) {
      const figures = toFigures(recorded);
      const generated = render(figures);
      result.ok = true;
      result.changes = changes(figuresOf(previous), figures);
      result.updated = result.changes.length > 0 || readText(paths.generated) !== generated;
      if (!dryRun) {
        if (refresh) {
          swapData(scratch, paths.tools);
        }
        fs.copyFileSync(scratchFigures, paths.figures);
        fs.writeFileSync(paths.generated, generated, 'utf8');
      }
    }
  } catch (error) {
    result.ok = false;
    result.blocking = [error.message];
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
  report(result, {dryRun, log});
  if (!dryRun) {
    result.status = {ranAt: now.toISOString(), refreshed: refresh, ok: result.ok, updated: result.ok && result.updated,
      changes: result.changes, blocking: result.blocking, notes: result.notes};
  }
  return result;
}

/**
 * Where the app keeps the outcome: the app itself, on port 4200 unless SCREENER_PORT names another. A development
 * server (`npm start`) listens on a port of its own and is not told. "localhost" and not "127.0.0.1": a server may
 * answer on the IPv6 loopback only, the app in Docker answers on the IPv4 one, and "localhost" reaches both.
 */
function statusUrl(env = process.env) {
  return `http://localhost:${env.SCREENER_PORT || 4200}/store/evidence-status`;
}

/**
 * Hands the outcome of a run to the running app, which keeps it for the page. True only when the app answers that
 * it saved it; false when the app is not there or answers anything else. It never throws, so it cannot change the
 * exit code of the update. It gives up after ten seconds, so a program that takes the connection and never answers
 * cannot hold the scheduled job.
 */
async function sendStatus(status, {url = statusUrl(), fetch = globalThis.fetch, timeoutMs = 10_000} = {}) {
  try {
    const answer = await fetch(url, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(status), signal: AbortSignal.timeout(timeoutMs)});
    const body = answer.ok ? await answer.json() : undefined;
    return body?.store === 'watchlist' && body?.saved === true;
  } catch {
    return false;
  }
}

/**
 * What the command does once the update is over: hands the outcome to the app and says so when the app did not save
 * it. A dry run has no outcome, so it sends nothing. Returns the exit code, which only the update decides.
 */
async function afterUpdate(result, {send = sendStatus, log = console.log} = {}) {
  if (result.status && !(await send(result.status))) {
    log('The app did not save this outcome, so the page does not show it. Is the app running?');
  }
  return result.ok ? 0 : 1;
}

/** Puts the freshly downloaded data in place, keeping what it replaces in previous_data/ (one generation). */
function swapData(scratch, tools) {
  const kept = path.join(tools, 'previous_data');
  const fresh = REFRESHED_DATA.filter(name => fs.existsSync(path.join(scratch, name)));
  if (fresh.length) {
    fs.mkdirSync(kept, {recursive: true});
  }
  fresh.forEach(name => {
    const current = path.join(tools, name);
    if (fs.existsSync(current)) {
      fs.copyFileSync(current, path.join(kept, name));
    }
    fs.copyFileSync(path.join(scratch, name), current);   // copy, not rename: the scratch folder may be on another drive
  });
}

function report(result, {dryRun, log}) {
  if (!result.ok) {
    log('\nNOT updated. The app keeps the numbers it had:');
    result.blocking.forEach(line => log(`  - ${line}`));
    return;
  }
  const would = dryRun ? 'would change' : 'changed';
  log(result.changes.length ? `\n${result.changes.length} number${result.changes.length === 1 ? '' : 's'} ${would}:` : '\nNo number changed.');
  result.changes.forEach(line => log(`  ${line}`));
  result.notes.forEach(line => log(`  note: ${line}`));
  if (dryRun) {
    log('Dry run: nothing was written.');
  }
}

/** The app's view of earlier figures, or undefined when they are missing or incomplete. */
function figuresOf(recorded) {
  return recorded && Object.keys(SECTIONS).every(name => recorded[name]) ? toFigures(recorded) : undefined;
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

function readJson(file) {
  const text = readText(file);
  return text === undefined ? undefined : JSON.parse(text);
}

if (require.main === module) {
  const known = ['--refresh', '--dry-run', '--write-only'];
  const args = process.argv.slice(2);
  const at = args.indexOf('--python');
  const python = at >= 0 ? args.splice(at, 2)[1] : undefined;
  if (args.some(arg => !known.includes(arg)) || (at >= 0 && !python)) {
    console.error(`Usage: npm run evidence [-- ${known.join(' | ')}] [--python <path>]`);
    process.exit(2);
  }
  const result = update({refresh: args.includes('--refresh'), dryRun: args.includes('--dry-run'), writeOnly: args.includes('--write-only'), python});
  afterUpdate(result).then(code => process.exit(code));
}

module.exports = {update, sendStatus, statusUrl, afterUpdate, RERUN_SCRIPTS, REFRESH_SCRIPTS, REFRESHED_DATA};
