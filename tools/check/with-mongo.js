#!/usr/bin/env node
'use strict';
/**
 * Runs the storage tests against a real MongoDB that lives only as long as the run: a throwaway container with no
 * folder of this computer attached, on a free port of this computer's own address. The container is removed
 * whatever happens, including a failing test and Ctrl+C.
 *
 *   npm run test:mongo
 */
const {spawnSync, spawn} = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

const IMAGE = 'mongo:8.0';
const name = `screener-test-mongo-${crypto.randomBytes(4).toString('hex')}`;
const ROOT = path.join(__dirname, '..', '..');

/** Docker is started with an argument list, not through a shell, so paths such as /data/db reach it unchanged. */
const docker = (...args) => spawnSync('docker', args, {encoding: 'utf8'});

let started = false;
function removeContainer() {
  if (started) {
    started = false;
    docker('rm', '-f', name);
  }
}

function fail(message) {
  console.error(message);
  removeContainer();
  process.exit(1);
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitUntilAnswering() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ping = docker('exec', name, 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping: 1}).ok');
    if (ping.status === 0 && ping.stdout.trim() === '1') {
      return;
    }
    await pause(1000);
  }
  fail('The test database did not answer within a minute.');
}

async function main() {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { removeContainer(); process.exit(130); });
  }
  const run = docker('run', '-d', '--rm', '--name', name, '--tmpfs', '/data/db', '-p', '127.0.0.1::27017', IMAGE);
  if (run.status !== 0) {
    fail(`Docker could not start ${IMAGE}: ${(run.stderr || run.error?.message || '').trim()}`);
  }
  started = true;
  const published = docker('port', name, '27017/tcp').stdout.split(/\r?\n/).find(line => line.startsWith('127.0.0.1:'));
  if (!published) {
    fail('Could not find the port the test database is on.');
  }
  await waitUntilAnswering();
  const url = `mongodb://${published.trim()}`;
  const tests = spawn(process.execPath, ['--test', 'tools/store/storage.test.js'], {
    // A variable of the tests' own: MONGO_URL is the real database inside the app's container.
    cwd: ROOT, stdio: 'inherit', env: {...process.env, TEST_MONGO_URL: url},
  });
  const code = await new Promise(resolve => tests.on('close', (status, signal) => resolve(signal ? 1 : status)));
  // The tests must leave a server as they found it: run against any other server, they would otherwise leave their
  // databases there.
  const left = docker('exec', name, 'mongosh', '--quiet', '--eval',
    'db.adminCommand({listDatabases: 1}).databases.filter(d => d.name.startsWith("contract-")).length');
  if (left.status !== 0 || left.stdout.trim() !== '0') {
    fail(`The tests left test databases behind (${left.stdout.trim() || 'could not look'}).`);
  }
  removeContainer();
  process.exit(code);
}

main().catch(error => fail(error.message));
