#!/usr/bin/env node
'use strict';
/**
 * Puts existing files into the database: a folder of <key>.json files (the old data folder) or a copy file.
 *
 *   MONGO_URL=mongodb://... node tools/store/import.js <file or folder> [--replace]
 *
 * A key the database already has is left alone unless --replace is given. Every key put in is read back and
 * compared. It prints one line a key and never a value, and exits 0 only when every key is the same on reading back.
 */
const {openStorage} = require('./open-storage');
const {putIn} = require('./backup');

const SAYS = {
  same: 'same on reading back',
  kept: 'already there, left alone',
  different: 'DIFFERENT on reading back',
};

const USAGE = 'Usage: node tools/store/import.js <file or folder> [--replace]';

/**
 * Why a write stopped, as far as it can be said without the error's message, which may quote a document: the
 * error's code and its name for that code, or the kind of error.
 */
function stoppedBecause(error) {
  const code = error?.code;
  const shownCode = typeof code === 'number' || (typeof code === 'string' && /^[A-Za-z0-9_]+$/.test(code)) ? String(code) : '';
  const kind = [error?.codeName, error?.name].find(word => typeof word === 'string' && /^[A-Za-z]+$/.test(word)) ?? 'error';
  return [shownCode, kind].filter(Boolean).join(' ');
}

/**
 * The command itself, with what it reads and where it writes handed in, so a test can give it a stand-in storage.
 * Resolves the exit code.
 */
async function runImport({args, env, open = openStorage, out = console.log, err = console.error}) {
  // A mistyped --replace must not be passed over: the import would then run without it, or take it for the source.
  if (args.some(arg => arg.startsWith('-') && arg !== '--replace')) {
    err('An option was not understood, so nothing was written.');
    err(USAGE);
    return 2;
  }
  const replace = args.includes('--replace');
  const source = args.find(arg => !arg.startsWith('--'));
  if (!env.MONGO_URL) {
    err('Set MONGO_URL: this puts data into the database.');
    return 1;
  }
  if (!source) {
    err(USAGE);
    return 1;
  }
  let storage;
  try {
    storage = await open(env);
  } catch (error) {
    // The address can hold a password, so only the kind of failure is shown.
    err(`Could not open the database (${error?.name ?? 'error'}).`);
    return 1;
  }
  try {
    const result = await putIn(storage, source, {replace});
    if (result.error) {
      err(result.error);
    }
    for (const {key, state} of result.keys) {
      out(`${key}: ${SAYS[state]}`);
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    // Only key names and the error's code are said, never a value, so the output can be shown to someone else.
    const at = typeof error?.stoppedAt === 'string' ? ` while writing ${error.stoppedAt}` : '';
    err(`The import stopped${at} (${stoppedBecause(error)}).`);
    if (Array.isArray(error?.written)) {
      err(error.written.length > 0 ? `Already put in: ${error.written.join(', ')}.` : 'Nothing was put in yet.');
    }
    return 1;
  } finally {
    await storage.close().catch(() => {});
  }
}

if (require.main === module) {
  runImport({args: process.argv.slice(2), env: process.env}).then(code => { process.exitCode = code; });
}

module.exports = {runImport};
