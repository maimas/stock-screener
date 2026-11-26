'use strict';
/**
 * What the page may ask of Claude Code. In the app, Claude Code runs in a container of its own and is reached through
 * a socket (READER_SOCKET, see tools/server/main.js and reader-client.js); on the development server it is the Claude
 * Code installed on this computer. Either way the routes are served by the store's own server, so the same checks on
 * who is asking apply: only the app on this computer, never a page of another site.
 *
 *   GET  /claude/status              can Claude Code be reached?
 *   GET  /claude/readings/<SYMBOL>   the reading kept for a stock; or that it is being read; or why reading failed
 *   POST /claude/readings            read why a stock fell: {symbol, name, day, percent}
 *
 * The page cannot send a question of its own: it names a stock and a fall, and the question is the recipe's
 * (why-it-dropped.js). One stock is read at a time, because every run uses some of your Claude plan. A reading is
 * kept in the store (under the key "readings"), so it is asked for once and is still there tomorrow; nothing is kept of a run that
 * failed or whose answer names no page its search returned.
 *
 * State of a stock: none | reading | done (with the reading) | failed (with a reason: not-installed, signed-out,
 * wrong-start, timeout, failed, no-answer, no-source, not-saved). A request for another stock while one is being
 * read is answered with "busy".
 */
const {send, receive} = require('../store/store-server');
const {findClaude, runRecipe} = require('./claude-cli');
const {recipe, requestFrom, promptFor, readingFrom} = require('./why-it-dropped');

const SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/;
const KEY = 'readings';
const CHECK_EVERY_MS = 60_000;

/** Whether Claude Code is installed, looked up at most once a minute. */
function installedCheck() {
  let checked = 0, found = false;
  return () => {
    if (Date.now() - checked > CHECK_EVERY_MS) {
      found = !!findClaude();
      checked = Date.now();
    }
    return found;
  };
}

/**
 * @param storage   where readings are kept (the same storage the store answers from)
 * @param run       answers a question with what runRecipe resolves to; only tests replace it
 * @param available whether Claude Code is installed (a boolean, or a promise of one)
 */
function readerRoutes({storage, run = question => runRecipe(recipe, question), available = installedCheck(), now = () => new Date(), log = console}) {
  const beingRead = new Set();
  const failed = new Map();                         // stock -> why its last run did not give a reading

  const kept = async symbol => (await storage.read(KEY)).value?.readings?.[symbol];

  const stateOf = async symbol => {
    if (beingRead.has(symbol)) {
      return {state: 'reading'};
    }
    const reading = await kept(symbol);
    if (failed.has(symbol)) {
      return {state: 'failed', reason: failed.get(symbol), ...(reading ? {reading} : {})};
    }
    return reading ? {state: 'done', reading} : {state: 'none'};
  };

  const read = request => {
    const {symbol, day, percent} = request;
    const fail = (reason, detail) => {
      failed.set(symbol, reason);
      log.warn(`[claude] could not read why ${symbol} fell: ${reason}${detail ? ` (${detail})` : ''}`);
    };
    beingRead.add(symbol);
    failed.delete(symbol);
    Promise.resolve()
      .then(() => run(promptFor(request)))
      .then(async outcome => {
        if (!outcome?.ok) {
          return fail(outcome?.reason ?? 'failed', outcome?.detail);
        }
        const made = readingFrom(outcome.output, outcome.links, now());
        if (!made.ok) {
          return fail(made.reason);
        }
        const reading = {...made.reading, day, percent, model: outcome.model, version: outcome.version};
        let kept;
        try {
          kept = await storage.merge(KEY, {v: 1, readings: {[symbol]: reading}});
        } catch (error) {
          return fail('not-saved', error?.message);
        }
        if (!kept.saved) {
          return fail('not-saved');
        }
        log.log(`[claude] read why ${symbol} fell on ${day} (${outcome.seconds}s)`);
      })
      .catch(error => fail('failed', error?.message))
      .finally(() => beingRead.delete(symbol));
  };

  // the store could not be asked: say so rather than show a state that may not be true
  const failure = (res, error) => {
    log.warn(`[claude] could not ask the store: ${error?.message}`);
    send(res, 503, {error: 'The database is not answering.'});
  };

  const only = (method, req, res) => req.method === method || (send(res, 405, {error: `Only ${method} here.`}), false);

  return (req, res) => {
    const route = String(req.url).split('?')[0];
    if (route !== '/claude' && !route.startsWith('/claude/')) {
      return false;
    }
    if (route === '/claude/status') {
      if (only('GET', req, res)) {
        Promise.resolve().then(available).then(found => send(res, 200, {claude: !!found}), error => failure(res, error));
      }
      return true;
    }
    if (route === '/claude/readings') {
      if (only('POST', req, res)) {
        receive(req, res, async body => {
          const asked = requestFrom(body);
          if (!asked.ok) {
            return [400, {error: asked.error}];
          }
          if (!(await available())) {
            return [503, {state: 'failed', reason: 'not-installed'}];
          }
          const {symbol} = asked.request;
          if (!beingRead.has(symbol)) {
            if (beingRead.size) {
              return [429, {state: 'busy'}];
            }
            read(asked.request);
          }
          return [202, {state: 'reading'}];
        });
      }
      return true;
    }
    const stock = /^\/claude\/readings\/([^/]+)$/.exec(route);
    if (stock) {
      if (only('GET', req, res)) {
        let symbol = '';
        try {
          symbol = decodeURIComponent(stock[1]);
        } catch {
          // not a symbol: answered below
        }
        if (SYMBOL.test(symbol)) {
          stateOf(symbol).then(state => send(res, 200, state), error => failure(res, error));
        } else {
          send(res, 400, {error: 'That is not a stock symbol.'});
        }
      }
      return true;
    }
    send(res, 404, {error: 'Not something Claude Code does for this page.'});
    return true;
  };
}

module.exports = {readerRoutes, installedCheck};
