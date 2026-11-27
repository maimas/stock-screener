'use strict';
/**
 * Claude's view of the stocks of a list, asked for by one button of the page (the recipe is claude-view.js). Served
 * beside what reader-routes.js serves, by the store's own server, so the same checks on who is asking apply.
 *
 *   POST /claude/views   ask about a list: {list: [{symbol, name, facts}]}, 1 to 10 stocks; and, to have the stocks
 *                        that move together compared after it: {groups: [{letter, members: [{symbol, name, facts}]}]}
 *   GET  /claude/views   the views kept (by stock, then by the day asked), the picks kept (by day, then by group),
 *                        which list is being asked about and how far it is, and which stocks got no answer the last
 *                        time they were asked about
 *
 * A list is asked about stock by stock, one run after the other: each stock is judged on its own anyway, a run that
 * fails costs one row and not the list, and every run keeps the limits on time and usage its recipe has. One list
 * at a time; a second one is answered with "busy". When Claude is busy with something else (a reading of why a
 * stock fell), the stock waits and is asked again.
 *
 * After the stocks, each group the request names is put to Claude once (claude-compare.js): the stocks of the group
 * that have a view of the past week, side by side, and which of them it would take first. That needs one question
 * that sees them all: views given apart could each prefer their own stock. A group of which fewer than two stocks
 * have a view is not compared, and a comparison that fails leaves the views as they are.
 *
 * A view is kept in the store (under the key "claude-views") with the day it was given, and the older days stay:
 * the page works out from them, and from the prices of its daily log, how Claude's past views turned out. The run
 * goes on when the page is closed; the page asks again where things stand when it is opened.
 */
const {send, receive} = require('../store/store-server');
const {localDay} = require('../store/day');
const {runRecipe} = require('./claude-cli');
const {installedCheck} = require('./reader-routes');
const {recipe, listFrom, promptFor, testedSummary, viewFrom} = require('./claude-view');
const {readingFrom} = require('./why-it-dropped');
const {recipe: compareRecipe, groupsFrom, comparePrompt, pickFrom, isView} = require('./claude-compare');

const KEY = 'claude-views';
/** Where a reading of why a stock fell is kept (reader-routes.js): "Why it dropped" in a stock's details shows it. */
const READINGS = 'readings';
const ROUTE = '/claude/views';
/** A view counts in a comparison while it is this fresh: as long as the page shows it without calling it old. */
const FRESH_DAYS = 7;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = day => Date.parse(`${day}T12:00:00Z`) / 86_400_000;

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
 * @param compare    the same for the question that compares the stocks of a group
 * @param available  whether Claude Code can be reached (a boolean, or a promise of one)
 * @param figures    the figures the backtests record; only tests replace them
 * @param retryMs    how long a stock waits when Claude is busy with something else, and
 * @param maxRetries how many times it is asked again before it is given up (40 times 5 s: a run can take three minutes)
 */
function viewRoutes({
  storage, run = question => runRecipe(recipe, question), compare = question => runRecipe(compareRecipe, question),
  available = installedCheck(), now = () => new Date(), log = console, figures = recordedFigures(), retryMs = 5000, maxRetries = 40,
}) {
  let queue;                                        // the list being asked about: {symbols, done, failed, comparing?}
  const failed = new Map();                         // stock -> why it got no view the last time it was asked about
  const failedGroups = new Map();                   // group's letter -> why it could not be compared the last time

  /** Asks, and asks again while Claude is busy with something else. */
  const untilFree = async (ask, question) => {
    let outcome = await ask(question);
    for (let tries = 0; outcome?.reason === 'busy' && tries < maxRetries; tries++) {
      await wait(retryMs);
      outcome = await ask(question);
    }
    return outcome;
  };

  /** One stock: asked, asked again while Claude is busy elsewhere, and its view kept. Resolves to why not, or nothing. */
  const askOne = async (asked, headline) => {
    const outcome = await untilFree(run, promptFor(asked, headline));
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
      if (!kept.saved) {
        return 'not-saved';
      }
    } catch {
      return 'not-saved';
    }
    await keepReading(asked, made.fall, outcome);
    return undefined;
  };

  /**
   * The same run said why the stock fell on its worst day: kept as the stock's reading, in the shape and under the
   * rules of a reading asked for on its own (a sentence about what happened, and at least one page the search really
   * returned). The view does not depend on it: a reading that is not usable, or cannot be kept, costs nothing.
   */
  const keepReading = async (asked, fall, outcome) => {
    const {bigDropDay: day, bigDropPercent: size} = asked.facts;
    // "No clear reason" is not kept from a view: it would take the place of the headlines the page found itself, for
    // every stock of a list. A reading asked for on its own may say it.
    if (!fall || fall.about === 'unclear' || !day || typeof size !== 'number') {
      return;
    }
    // Its pages are the ones named for the fall, not the ones the view rests on.
    const made = readingFrom({what: fall.what, about: fall.about, sources: fall.sources}, outcome.links, now());
    if (!made.ok) {
      return;
    }
    const reading = {...made.reading, day, percent: Math.abs(size), model: outcome.model, version: outcome.version};
    try {
      // What is kept stays when it says something about this day or a later one (asked for on its own, or with an
      // earlier view; a page left open with older prices must not take a newer reading away).
      const there = (await storage.read(READINGS)).value?.readings?.[asked.symbol];
      if (there && typeof there.day === 'string' && there.day >= day && !(there.day === day && there.about === 'unclear')) {
        return;
      }
      const kept = await storage.merge(READINGS, {v: 1, readings: {[asked.symbol]: reading}});
      if (!kept.saved) {
        throw new Error('not saved');
      }
      log.log(`[claude] and read why ${asked.symbol} fell on ${day}`);
    } catch (error) {
      log.warn(`[claude] could not keep why ${asked.symbol} fell: ${error?.message}`);
    }
  };

  /**
   * One group: its stocks that have a view of the past week, compared in one question, and the pick kept under the
   * day and the group's letter. Resolves to why there is no pick, or nothing.
   */
  const compareOne = async group => {
    const today = localDay(now());
    const all = (await storage.read(KEY)).value?.views ?? {};
    const views = {};
    const members = group.members.filter(member => {
      // What is kept is read with care: only under a day, only one of the three words.
      const newest = Object.keys(all[member.symbol] ?? {}).filter(day => DAY.test(day)).sort().pop();
      if (!newest || dayNumber(today) - dayNumber(newest) > FRESH_DAYS || !isView(all[member.symbol][newest])) {
        return false;
      }
      views[member.symbol] = all[member.symbol][newest];
      return true;
    });
    if (members.length < 2) {
      return 'too-few';
    }
    const outcome = await untilFree(compare, comparePrompt(group.letter, members, views));
    if (!outcome?.ok) {
      return outcome?.reason ?? 'failed';
    }
    const made = pickFrom(outcome.output, members, now());
    if (!made.ok) {
      return made.reason;
    }
    try {
      const kept = await storage.merge(KEY, {v: 1, picks: {[today]: {[group.letter]: {...made.pick, model: outcome.model, version: outcome.version}}}});
      return kept.saved ? undefined : 'not-saved';
    } catch {
      return 'not-saved';
    }
  };

  const askAll = async (list, groups) => {
    const headline = testedSummary(figures);
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
    for (const group of groups) {
      const started = Date.now();
      // Only a group one of whose stocks got a view just now: otherwise there is nothing new to compare, and a pick
      // dated today would rest on older views alone.
      const fresh = group.members.some(member => queue.done.includes(member.symbol));
      const reason = fresh ? await compareOne(group).catch(() => 'failed') : 'nothing-new';
      queue.comparing = queue.comparing.filter(letter => letter !== group.letter);
      if (reason === 'nothing-new') {
        log.log(`[claude] group ${group.letter} was not compared: none of its stocks got a view this time`);
      } else if (reason === 'too-few') {
        log.log(`[claude] group ${group.letter} was not compared: fewer than two of its stocks have a view`);
      } else if (reason) {
        failedGroups.set(group.letter, reason);
        log.warn(`[claude] no pick in group ${group.letter}: ${reason}`);
      } else {
        log.log(`[claude] compared group ${group.letter} (${Math.round((Date.now() - started) / 1000)}s)`);
      }
    }
  };

  const start = (list, groups) => {
    queue = {symbols: list.map(it => it.symbol), done: [], failed: {}, ...(groups.length ? {comparing: groups.map(it => it.letter)} : {})};
    list.forEach(it => failed.delete(it.symbol));
    groups.forEach(it => failedGroups.delete(it.letter));
    askAll(list, groups).catch(error => log.warn(`[claude] the list was not asked through: ${error?.message}`)).finally(() => {
      queue = undefined;
    });
  };

  /** Where the list being asked about stands, as a copy: which stocks are through, which groups are still to be compared. */
  const standing = () => ({
    symbols: queue.symbols, done: [...queue.done], failed: {...queue.failed},
    ...(queue.comparing ? {comparing: [...queue.comparing]} : {}),
  });

  const state = async () => {
    const kept = (await storage.read(KEY)).value;
    return {
      views: kept?.views ?? {},
      ...(kept?.picks && Object.keys(kept.picks).length ? {picks: kept.picks} : {}),
      ...(queue ? {queue: standing()} : {}),
      failed: Object.fromEntries(failed),
      ...(failedGroups.size ? {failedGroups: Object.fromEntries(failedGroups)} : {}),
    };
  };

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
        const grouped = groupsFrom(body);
        if (!grouped.ok) {
          return [400, {error: grouped.error}];
        }
        if (!(await available())) {
          return [503, {state: 'failed', reason: 'not-installed'}];
        }
        if (queue) {
          return [429, {state: 'busy'}];
        }
        start(asked.list, grouped.groups);
        return [202, {state: 'asking', queue: standing()}];
      });
    } else {
      send(res, 405, {error: 'Only GET and POST here.'});
    }
    return true;
  };
}

module.exports = {viewRoutes, oneAtATime};
