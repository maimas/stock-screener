#!/usr/bin/env node
'use strict';
/**
 * Says whether the project folder holds anything personal before it is handed to someone else.
 *
 *   npm run share:check
 *
 * It names files, never what is in them: the saved holdings are looked at by name only.
 */
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

/** What a computer's own settings and tools leave in the project folder. */
const OWN_FILES = ['.env', '.superpowers', '.claude', '.idea', '.impeccable'];

/** The names of the .json files in a folder and below it, as paths relative to `base`. Nothing is opened. */
function jsonFilesIn(dir, base) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return jsonFilesIn(full, base);
    }
    return entry.name.endsWith('.json') ? [path.relative(base, full).split(path.sep).join('/')] : [];
  });
}

/** The lines of an ignore file, trimmed, or null when there is no such file. */
function linesOf(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim()) : null;
}

function missingLines(root, name, wanted) {
  const lines = linesOf(path.join(root, name));
  if (lines === null) {
    return [`${name} is missing; it must hold the lines ${wanted.join(', ')}.`];
  }
  const missing = wanted.filter(line => !lines.includes(line));
  return missing.length ? [`${name} does not hold the line ${missing.join(', ')}.`] : [];
}

/** The paths in the output of `git ls-files -z`: split on the zero byte, because git quotes odd letters otherwise. */
function splitPaths(output) {
  return output.split('\0').filter(Boolean);
}

/** @param tracked the paths git tracks, as `git ls-files` prints them */
function findings({root, tracked}) {
  const problems = [];
  for (const file of jsonFilesIn(path.join(root, 'data'), root)) {
    problems.push(`${file} is a saved file of this computer.`);
  }
  for (const file of tracked) {
    const name = file.split('/').pop();
    if (file.startsWith('data/') || name.startsWith('.env')) {
      problems.push(`${file} is tracked by git, so it would travel with the repository.`);
    }
  }
  problems.push(...missingLines(root, '.dockerignore', ['data', '.git', '.env']));
  problems.push(...missingLines(root, '.gitignore', ['/data', '.env']));

  // A copy of the project made before a clean-up can hold the saved records, and it travels with a zip of the folder.
  if (fs.existsSync(path.join(root, '.git', 'cleanup-backup'))) {
    problems.push('.git/cleanup-backup is an old copy of the project and may hold saved records; move it out of the project folder.');
  }

  // These are not data, but they are this computer's own: settings, notes and the tools' files.
  const reminders = [];
  const ownFiles = OWN_FILES.filter(name => fs.existsSync(path.join(root, name)));
  if (ownFiles.length) {
    reminders.push(`${ownFiles.join(', ')} ${ownFiles.length === 1 ? 'is' : 'are'} in the project folder; hand the project over as the repository, not as a copy of this folder.`);
  }
  return {problems, reminders};
}

function main() {
  const tracked = splitPaths(execFileSync('git', ['ls-files', '-z'], {cwd: ROOT, encoding: 'utf8'}));
  const {problems, reminders} = findings({root: ROOT, tracked});
  for (const line of problems) {
    console.log(`PROBLEM  ${line}`);
  }
  if (problems.length === 0) {
    console.log('Nothing personal found in the project folder.');
  }
  for (const line of reminders) {
    console.log(`REMINDER ${line}`);
  }
  process.exit(problems.length ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {findings, splitPaths};
