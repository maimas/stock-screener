'use strict';
/**
 * Loads the app's own TypeScript (the verdict, the log, the lists, the requests) into Node, so the recorder does
 * not carry a second copy of any of it and cannot disagree with the page. The files are compiled in memory with
 * the project's own TypeScript the first time they are needed; nothing is written to disk.
 *
 * Only code without Angular in it can be loaded this way. The files used here import nothing from Angular but
 * types, which disappear when compiled; record-day.test.js checks that this stays true.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const APP = path.join(__dirname, '..', '..', 'src', 'app');

function compileOnRequire() {
  if (require.extensions['.ts']) {
    return;
  }
  require.extensions['.ts'] = (module, filename) => {
    const {outputText} = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    });
    module._compile(outputText, filename);
  };
}

/** The parts of the app the recorder uses. */
function loadApp() {
  compileOnRequire();
  const log = require(path.join(APP, 'watchlist', 'snapshot-log.ts'));
  const lists = require(path.join(APP, 'watchlist', 'watchlists.ts'));
  const book = require(path.join(APP, 'watchlist', 'portfolio-book.ts'));
  const requests = require(path.join(APP, 'api', 'msn-requests.ts'));
  return {
    snapshotOf: log.snapshotOf, dayChange: log.dayChange, parseLog: log.parseLog, emptyLog: log.emptyLog,
    parseWatchlists: lists.parseWatchlists, defaultBook: lists.defaultBook, allSymbols: lists.allSymbols,
    parseBook: book.parseBook, symbolsHeld: book.symbolsHeld,
    requests,
  };
}

module.exports = {loadApp};
