#!/usr/bin/env node
'use strict';
/**
 * Builds the whole stack and proves, check by check, that it does what it promises.
 *
 *   npm run check:docker
 *
 * It is made to run next to the real app on this computer: its own project name (screener-check), its own port
 * (4290) and a new temporary data folder, set here for every Docker command whatever the caller's environment says.
 * It never touches ports 4200 or 4301. Whatever happens, including a failed check and Ctrl+C, it ends by taking its
 * own stack down with its volumes and removing its own temporary folder.
 *
 * The real app's image (stock-screener:local) is never rebuilt or renamed by this check: a small file written into the
 * temporary folder gives the three services of this project the image name stock-screener:check instead, and every
 * Docker command names its compose files itself. The image stock-screener:check stays after a run on purpose: its
 * layers are shared with the real one, so the next run is quick.
 */
const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');

const ROOT = path.join(__dirname, '..', '..');
const PROJECT = 'screener-check';
const PORT = '4290';
const MARKET_QUERY = '/contentservices-finance.csautosuggest/api/v1/Query?query=msft&market=en-us&count=1';
const PROJECT_LABEL = `label=com.docker.compose.project=${PROJECT}`;

const BASE_FILE = path.join(ROOT, 'compose.yaml');
const CHECK_IMAGE = 'stock-screener:check';

let dataDir = null;             // the temporary data folder, once made
let overrideFile = null;        // inside it: gives this project its own image name
let cleaned = false;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** What every Docker command runs with. The two settings are made here and never taken from the caller. */
function dockerEnv() {
  const env = {...process.env, SCREENER_PORT: PORT, SCREENER_DATA: dataDir.replace(/\\/g, '/')};
  delete env.COMPOSE_PROJECT_NAME;
  delete env.COMPOSE_FILE;
  delete env.COMPOSE_PROFILES;
  return env;
}

/** The start of every compose command: the project, and the two files it is made of, named here and nowhere else. */
const composeArgs = args => ['compose', '-p', PROJECT, '--project-directory', ROOT, '-f', BASE_FILE, '-f', overrideFile, ...args];

/** Docker is started with an argument list, never through a shell, so paths reach it unchanged. */
function compose(args, {input, timeoutMs = 120_000} = {}) {
  return new Promise(resolve => {
    const child = spawn('docker', composeArgs(args), {cwd: ROOT, env: dockerEnv()});
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); resolve({status: -1, stdout, stderr: String(error.message)}); });
    child.on('close', status => { clearTimeout(timer); resolve({status, stdout, stderr}); });
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
}

const lastLines = text => text.trim().split(/\r?\n/).slice(-4).join(' | ');

async function mustCompose(args, options) {
  const result = await compose(args, options);
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed: ${lastLines(result.stderr || result.stdout)}`);
  }
  return result;
}

/** One request to the stack; a different Host header makes it look like a request from another computer. */
function request(urlPath, {method = 'GET', host, body} = {}) {
  return new Promise(resolve => {
    const headers = {};
    if (host) { headers.Host = host; }
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; }
    const req = http.request({host: '127.0.0.1', port: Number(PORT), path: urlPath, method, headers, timeout: 8000}, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({status: res.statusCode, text}));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', error => resolve({status: 0, text: '', error: error.message}));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

const json = text => { try { return JSON.parse(text); } catch { return undefined; } };

/** Asks again and again until `look` returns something other than undefined; fails with `what` when time runs out. */
async function waitFor(what, ms, look, every = 1000) {
  const end = Date.now() + ms;
  for (;;) {
    const found = await look();
    if (found !== undefined) {
      return found;
    }
    if (Date.now() > end) {
      throw new Error(`${what} did not happen within ${Math.round(ms / 1000)} seconds`);
    }
    await pause(every);
  }
}

const VALUE = {a: {'B.C': 1}};
const PUT_BACK = /Put back the copy screener-\d{4}-\d{2}-\d{2}\.json/;

/** True only when the stack answers now with the saved value: nothing remembered is read. */
const hasValue = async () => {
  const got = await request('/store/check');
  return got.status === 200 && isDeepStrictEqual(json(got.text)?.value, VALUE) ? true : undefined;
};

const claudeIs = wanted => async () => {
  const got = await request('/claude/status');
  return got.status === 200 && json(got.text)?.claude === wanted ? true : undefined;
};

async function containerId(service) {
  return (await mustCompose(['ps', '-q', service])).stdout.trim();
}

function startedAt(id) {
  return spawnSync('docker', ['inspect', '-f', '{{.State.StartedAt}}', id], {encoding: 'utf8'}).stdout.trim();
}

/** Deletes a folder only when it is inside the temporary data folder this script made. */
function removeInside(folder) {
  const inside = path.resolve(folder);
  if (!dataDir || !inside.startsWith(path.resolve(dataDir) + path.sep)) {
    throw new Error(`refused to delete ${inside}: it is not inside the temporary data folder`);
  }
  fs.rmSync(inside, {recursive: true, force: true, maxRetries: 5, retryDelay: 500});
}

/** Takes the stack down and removes the temporary folder; safe to run twice and from a signal. Says what is left. */
function removeEverything() {
  if (cleaned || !dataDir) {
    return;
  }
  cleaned = true;
  const down = spawnSync('docker', composeArgs(['down', '-v']), {cwd: ROOT, env: dockerEnv(), stdio: 'ignore', timeout: 180_000});
  if (down.status !== 0) {
    console.error(`The check's stack may still be there. Run: docker compose -p ${PROJECT} down -v`);
  }
  try {
    fs.rmSync(dataDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 500});
  } catch (error) {
    console.error(`The temporary folder could not be removed (${error.message}). Remove it yourself: ${dataDir}`);
  }
}

/** What Docker still holds under this project's label: containers, volumes and networks. */
function leftovers() {
  const ask = args => spawnSync('docker', [...args, '-q', '--filter', PROJECT_LABEL], {encoding: 'utf8'}).stdout.trim();
  return [
    ask(['ps', '-a']) && 'a container',
    ask(['volume', 'ls']) && 'a volume',
    ask(['network', 'ls']) && 'a network',
  ].filter(Boolean);
}

// The thirteen checks. Each throws an Error saying why when it does not hold.

async function buildAndStart() {
  await mustCompose(['up', '-d', '--build'], {timeoutMs: 15 * 60_000});
  await waitFor('the page', 120_000, async () => (await request('/portfolio')).text.includes('<app-root') ? true : undefined);
}

async function saveAndRead() {
  const saved = await request('/store/check', {method: 'PUT', body: VALUE});
  if (saved.status !== 200 || json(saved.text)?.saved !== true) {
    throw new Error(`the save was answered ${saved.status} ${saved.text.slice(0, 80)}`);
  }
  if (!(await hasValue())) {
    throw new Error('what was read back is not what was saved');
  }
}

async function survivesDocker() {
  try {
    await mustCompose(['down', '-v']);
  } finally {
    await mustCompose(['up', '-d']);
  }
  await waitFor('the saved value coming back', 90_000, hasValue);
  // The day's copy may already hold the value: it must have come back from the database, not from the copy.
  if (PUT_BACK.test((await mustCompose(['logs', 'app'])).stdout)) {
    throw new Error('the value came back from the day\'s copy, not from the database: the database did not keep it');
  }
}

async function notForStrangers() {
  const got = await request('/store/check', {host: 'evil.example'});
  if (got.status !== 403) {
    throw new Error(`a request for another host was answered ${got.status}, not 403`);
  }
}

async function marketData() {
  const got = await request(MARKET_QUERY);
  if (got.status === 0) {
    throw new Error(`needs the internet, and there was no answer (${got.error})`);
  }
  if (got.status !== 200 || json(got.text) === undefined) {
    throw new Error(`needs the internet; the answer was ${got.status}, not 200 with JSON`);
  }
}

async function thisComputerOnly() {
  const app = (await compose(['port', 'app', '4200'])).stdout.trim().split(/\r?\n/).filter(Boolean);
  if (app.length !== 1 || app[0] !== `127.0.0.1:${PORT}`) {
    throw new Error(`the app is published as "${app.join(', ')}", not 127.0.0.1:${PORT}`);
  }
  const mongo = (await compose(['port', 'mongo', '27017'])).stdout.trim();
  // Docker says "invalid IP:0" for a port that is not published at all.
  if (mongo !== '' && !mongo.endsWith(':0')) {
    throw new Error(`the database is published as "${mongo}"`);
  }
}

async function mongoGoesAndComesBack() {
  const app = await containerId('app');
  const startedBefore = startedAt(app);
  try {
    await mustCompose(['stop', 'mongo']);
    await waitFor('/store/check answering 503', 15_000, async () => (await request('/store/check')).status === 503 ? true : undefined, 500);
  } finally {
    await mustCompose(['start', 'mongo']);
  }
  await waitFor('the value coming back', 60_000, hasValue);
  if ((await containerId('app')) !== app || startedAt(app) !== startedBefore) {
    throw new Error('the app was restarted');
  }
}

async function dailyCopy() {
  // The app names its copy by its own day (New York's unless told otherwise), which may not be this computer's.
  const asked = await mustCompose(['exec', '-T', 'app', 'node', '-e', "console.log(require('/app/tools/store/day').localDay(new Date()))"]);
  const day = asked.stdout.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`the app did not say which day it is: ${lastLines(asked.stderr || asked.stdout)}`);
  }
  const folder = path.join(dataDir, 'backups');
  const found = `screener-${day}.json`;
  // The day is recorded at the first start, which takes a few seconds of fetching: wait for the copy.
  await waitFor(`backups/${found}`, 90_000, async () => fs.existsSync(path.join(folder, found)) ? true : undefined);
  if (json(fs.readFileSync(path.join(folder, found), 'utf8')) === undefined) {
    throw new Error(`${found} is not valid JSON`);
  }
}

async function putBackByItself() {
  try {
    await mustCompose(['down']);
    removeInside(path.join(dataDir, 'db'));
  } finally {
    await mustCompose(['up', '-d']);
  }
  await waitFor('/store/recorder-status holding a value', 120_000, async () => {
    const got = await request('/store/recorder-status');
    const value = got.status === 200 ? json(got.text)?.value : undefined;
    return value === undefined || value === null ? undefined : true;
  });
  const output = (await mustCompose(['logs', 'app'])).stdout;
  if (!PUT_BACK.test(output)) {
    throw new Error('the output of the app does not say a copy was put back');
  }
}

/** The addresses a container has, per network of this project, as Docker reports them. */
async function addressesOf(service) {
  const id = await containerId(service);
  const shown = spawnSync('docker', ['inspect', '-f', '{{json .NetworkSettings.Networks}}', id], {encoding: 'utf8'}).stdout;
  return json(shown) || {};
}

async function readerReach() {
  const script = fs.readFileSync(path.join(__dirname, 'reader-reach.js'), 'utf8');
  const all = service => addressesOf(service).then(nets => Object.values(nets).map(net => net.IPAddress).filter(Boolean));
  const onReaderNet = service => addressesOf(service).then(nets => nets[`${PROJECT}_reader-net`]?.IPAddress || '');
  const subnet = spawnSync('docker', ['network', 'inspect', `${PROJECT}_reader-net`, '-f', '{{(index .IPAM.Config 0).Subnet}}'], {encoding: 'utf8'}).stdout.trim();
  const env = {
    APP_IPS: (await all('app')).join(','),
    MONGO_IPS: (await all('mongo')).join(','),
    GATE_IP: await onReaderNet('gate'),
    READER_IP: await onReaderNet('reader'),
    READER_SUBNET: subnet,
  };
  const flags = Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]);
  const ran = await compose(['exec', '-T', ...flags, 'reader', 'node', '-'], {input: script});
  const result = json(ran.stdout.trim().split(/\r?\n/).pop());
  if (!result) {
    throw new Error(`the reader's answer could not be read: ${lastLines(ran.stderr || ran.stdout)}`);
  }
  const problem = readerReachProblem(env, result);
  if (problem) {
    throw new Error(problem);
  }
}

/** Why the reader's reach does not hold, from what was handed to the reader and what it answered; undefined when it holds. */
function readerReachProblem(env, result) {
  // A proof must not pass empty-handed: with an address missing, the reader would simply have tried fewer.
  if (!env.APP_IPS) {
    return 'docker inspect gave no address for the app, so the reader could not try it by number';
  }
  if (!env.MONGO_IPS) {
    return 'docker inspect gave no address for Mongo, so the reader could not try it by number';
  }
  if (!env.READER_SUBNET) {
    return 'docker inspect gave no range for the reader\'s network, so the reader could not try this computer\'s address on it';
  }
  const tried = Object.keys(result.byNumber || {});
  if (!tried.some(label => label.startsWith('app address '))) {
    return 'the reader\'s answer holds no attempt by number for the app';
  }
  if (!tried.some(label => label.startsWith('mongo address '))) {
    return 'the reader\'s answer holds no attempt by number for Mongo';
  }
  const reached =Object.entries({...result.direct, ...result.byNumber}).filter(([, what]) => what.answered).map(([label]) => label);
  if (reached.length) {
    return `the reader reached ${reached.join(', ')} directly`;
  }
  const refused = result.gate['example.com:443'];
  const allowed = result.gate['api.anthropic.com:443'];
  if (refused?.status !== 403) {
    return `the gate answered example.com:443 with ${refused?.status ?? refused?.error}, not 403`;
  }
  if (allowed?.status !== 200) {
    return `the gate answered api.anthropic.com:443 with ${allowed?.status ?? allowed?.error}, not 200 (needs the internet)`;
  }
  return undefined;
}

async function claudeCodeIsThere() {
  await waitFor('claude: true', 60_000, claudeIs(true), 2000);
  try {
    await mustCompose(['stop', 'reader']);
    // The app remembers a "yes" for a minute, so the "no" has to be waited for; it is the app's own fresh look.
    await waitFor('claude: false after stopping the reader', 75_000, claudeIs(false), 3000);
  } finally {
    await mustCompose(['start', 'reader']);
  }
  await waitFor('claude: true after starting the reader', 30_000, claudeIs(true), 2000);
}

async function nothingPersonalInTheImage() {
  // The tests stay out too: they are not part of the running app, and older ones hold example values.
  const probe = 'for p in /app/data /app/.git /app/.env; do if [ -e "$p" ]; then echo "present $p"; fi; done; ' +
    'find /app/tools \\( -name "*.test.js" -o -name "*.contract.js" \\) -exec echo present {} \\; ; echo done';
  const ran = await mustCompose(['exec', '-T', 'app', 'sh', '-c', probe]);
  const present = ran.stdout.split(/\r?\n/).filter(line => line.startsWith('present ')).map(line => line.slice(8).trim());
  if (!ran.stdout.includes('done') || present.length) {
    throw new Error(`the image holds ${present.join(', ') || 'what could not be looked at'}`);
  }
}

async function cleanUp() {
  await mustCompose(['down', '-v']);
  removeEverything();
  const left = leftovers();
  if (left.length) {
    throw new Error(`${left.join(', ')} of the check is still there`);
  }
  if (fs.existsSync(dataDir)) {
    throw new Error('the temporary data folder is still there');
  }
}

// Every check in order. `needs` names the checks without which a later one can say nothing.
const CHECKS = [
  {n: 1, name: 'Build and start', run: buildAndStart, needs: []},
  {n: 2, name: 'Save and read', run: saveAndRead, needs: [1]},
  {n: 3, name: 'Survives Docker', run: survivesDocker, needs: [2]},
  {n: 4, name: 'Not for strangers', run: notForStrangers, needs: [1]},
  {n: 5, name: 'Market data', run: marketData, needs: [1]},
  {n: 6, name: 'This computer only', run: thisComputerOnly, needs: [1]},
  {n: 7, name: 'Mongo goes and comes back', run: mongoGoesAndComesBack, needs: [2]},
  {n: 8, name: 'The daily copy', run: dailyCopy, needs: [1]},
  {n: 9, name: 'Put back by itself', run: putBackByItself, needs: [8]},
  {n: 10, name: 'The reader\'s reach', run: readerReach, needs: [1]},
  {n: 11, name: 'Claude Code is there', run: claudeCodeIsThere, needs: [1]},
  {n: 12, name: 'Nothing personal in the image', run: nothingPersonalInTheImage, needs: [1]},
  {n: 13, name: 'Clean up', run: cleanUp, needs: []},
];

async function main() {
  const existing = spawnSync('docker', ['ps', '-a', '-q', '--filter', PROJECT_LABEL], {encoding: 'utf8'});
  if (existing.status !== 0) {
    console.error(`Docker did not answer: ${(existing.stderr || existing.error?.message || '').trim()}`);
    process.exit(1);
  }
  if (existing.stdout.trim()) {
    console.error(`A project named ${PROJECT} is already there. Not touching it. If it is left from an earlier run: docker compose -p ${PROJECT} down -v`);
    process.exit(1);
  }

  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screener-check-'));
  overrideFile = path.join(dataDir, 'compose.check.yaml');
  fs.writeFileSync(overrideFile, ['app', 'reader', 'gate'].reduce((all, name) => `${all}  ${name}:\n    image: ${CHECK_IMAGE}\n`, 'services:\n'));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { removeEverything(); process.exit(130); });
  }

  const failed = new Set();
  try {
    for (const check of CHECKS) {
      const label = `${String(check.n).padStart(2)}  ${check.name}`;
      const blocker = CHECKS.find(other => check.needs.includes(other.n) && failed.has(other.n));
      if (blocker) {
        failed.add(check.n);
        console.log(`FAILED  ${label}: not run: check ${blocker.n} (${blocker.name}) failed`);
        continue;
      }
      try {
        await check.run();
        console.log(`ok      ${label}`);
      } catch (error) {
        failed.add(check.n);
        console.log(`FAILED  ${label}: ${error.message}`);
      }
    }
  } finally {
    removeEverything();
  }
  console.log(failed.size ? `\n${failed.size} of ${CHECKS.length} checks failed.` : `\nAll ${CHECKS.length} checks ok.`);
  process.exit(failed.size ? 1 : 0);
}

// Run as a command it checks; required (by its test) it only hands out the verdict of check 10.
if (require.main === module) {
  main().catch(error => {
    console.error(error);
    removeEverything();
    process.exit(1);
  });
}

module.exports = {readerReachProblem};
