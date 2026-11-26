'use strict';
/**
 * Claude's view of the stocks of a list, asked for by one button of the page (the recipe is claude-view.js). Served
 * beside what reader-routes.js serves, by the store's own server, so the same checks on who is asking apply.
 *
 *   POST /claude/views   ask about a list: {list: [{symbol, name, facts}]}, 1 to 10 stocks
 *   GET  /claude/views   the views kept (by stock, then by the day asked), which list is being asked about and how
 *                        far it is, and which stocks got no answer the last time they were asked about
 *
 * A list is asked about stock by stock, one run after the other: each stock is judged on its own anyway, a run that
 * fails costs one row and not the list, and every run keeps the limits on time and usage its recipe has. One list
 * at a time; a second one is answered with "busy". When Claude is busy with something else (a reading of why a
 * stock fell), the stock waits and is asked again.
 *
 * A view is kept in the store (under the key "claude-views") with the day it was given, and the older days stay:
 * the page works out from them, and from the prices of its daily log, how Claude's past views turned out. The run
 * goes on when the page is closed; the page asks again where things stand when it is opened.
 */
const {send, receive} = require('../store/store-server');
const {localDay} = require('../store/day');
const {runRecipe} = require('./claude-cli');
const {installedCheck} = require('./reader-routes');
const {recipe, listFrom, promptFor, testedHeadline, viewFrom} = require('./claude-view');

const KEY = 'claude-views';
const ROUTE = '/claude/views';

/** The figures the backtests record, or nothing when they are not there: then nothing is quoted as tested. */
function recordedFigures() {
  try {
    return require('../signal-backtest/quoted_figures.json');
  } catch {
    return {};
  }
}

/**
 * Makes ways of asking Claude Code share one turn: while one run is going on, any other is answered "busy" and is
 * not started. Where Claude Code runs in a container of its own, its service does this already; on the development
 * server nothing else would keep a reading and a view from running at the same moment.
 */
function oneAtATime() {
  let busy = false;
  return run => async (...args) => {
    if (busy) {
      return {ok: false, reason: 'busy'};
    }
    busy = true;
    try {
      return await run(...args);
    } finally {
      busy = false;
    }
  };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param storage    where views are kept (the same storage the store answers from)
 * @param run        answers a question with what runRecipe resolves to; only tests replace it
 * @param available  whether Claude Code can be reached (a boolean, or a promise of one)
 * @param figures    the figures the backtests record; only tests replace them
 * @param retryMs    how long a stock waits when Claude is busy with something else, and
 * @param maxRetries how many times it is asked again before it is given up
 */
function viewRoutes({
  storage, run = question => runRecipe(recipe, question), available = installedCheck(), now = () => new Date(), log = console,
  figures = recordedFigures(), retryMs = 5000, maxRetries = 24,
}) {
  let queue;                                        // the list being asked about: {symbols, done, failed}
  const failed = new Map();                         // stock -> why it got no view the last time it was asked about

  /** One stock: asked, asked again while Claude is busy elsewhere, and its view kept. Resolves to why not, or nothing. */
  const askOne = async (asked, headline) => {
    const question = promptFor(asked, headline);
    let outcome = await run(question);
    for (let tries = 0; outcome?.reason === 'busy' && tries < maxRetries; tries++) {
      await wait(retryMs);
      outcome = await run(question);
    }
    if (!outcome?.ok) {
      return outcome?.reason ?? 'failed';
    }
    const made = viewFrom(outcome.output, outcome.links, now());
    if (!made.ok) {
      return made.reason;
    }
    const view = {...made.view, model: outcome.model, version: outcome.version};
    try {
      const kept = await storage.merge(KEY, {v: 1, views: {[asked.symbol]: {[localDay(now())]: view}}});
      return kept.saved ? undefined : 'not-saved';
    } catch {
      return 'not-saved';
    }
  };

  const askAll = async list => {
    const headline = testedHeadline(figures);
    for (const asked of list) {
      const started = Date.now();
      const reason = await askOne(asked, headline).catch(() => 'failed');
      if (reason) {
        queue.failed[asked.symbol] = reason;
        failed.set(asked.symbol, reason);
        log.warn(`[claude] no view of ${asked.symbol}: ${reason}`);
      } else {
        queue.done.push(asked.symbol);
        log.log(`[claude] gave its view of ${asked.symbol} (${Math.round((Date.now() - started) / 1000)}s)`);
      }
    }
  };

  const start = list => {
    queue = {symbols: list.map(it => it.symbol), done: [], failed: {}};
    list.forEach(it => failed.delete(it.symbol));
    askAll(list).catch(error => log.warn(`[claude] the list was not asked through: ${error?.message}`)).finally(() => {
      queue = undefined;
    });
  };

  const state = async () => ({
    views: (await storage.read(KEY)).value?.views ?? {},
    ...(queue ? {queue: {symbols: queue.symbols, done: [...queue.done], failed: {...queue.failed}}} : {}),
    failed: Object.fromEntries(failed),
  });

  return (req, res) => {
    if (String(req.url).split('?')[0] !== ROUTE) {
      return false;
    }
    if (req.method === 'GET') {
      state().then(body => send(res, 200, body), error => {
        // the store could not be asked: say so rather than show a state that may not be true
        log.warn(`[claude] could not ask the store: ${error?.message}`);
        send(res, 503, {error: 'The database is not answering.'});
      });
    } else if (req.method === 'POST') {
      receive(req, res, async body => {
        const asked = listFrom(body);
        if (!asked.ok) {
          return [400, {error: asked.error}];
        }
        if (!(await available())) {
          return [503, {state: 'failed', reason: 'not-installed'}];
        }
        if (queue) {
          return [429, {state: 'busy'}];
        }
        start(asked.list);
        return [202, {state: 'asking', queue: {symbols: queue.symbols, done: [], failed: {}}}];
      });
    } else {
      send(res, 405, {error: 'Only GET and POST here.'});
    }
    return true;
  };
}

module.exports = {viewRoutes, oneAtATime};
