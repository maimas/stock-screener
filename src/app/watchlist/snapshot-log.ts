/**
 * A daily log of what the screener showed. It is kept in the browser and, when the store is answering, in the
 * database, where the daily recorder (tools/recorder) adds the days on which the page was not opened. It gives the
 * page a memory: when a stock became a DIP BUY and what has happened since, whether analysts have cut their targets, and, over time, a live track
 * record of the verdict. It also builds the history that analyst data needs before it can ever be tested.
 *
 * One entry per calendar day (the last reading of the day wins). Kept compact: short keys, about 100 bytes per
 * stock per day, so two years of a 30-stock watchlist stays near 2 MB.
 */

import {Stock} from "../api/microsoft-money.service";
import {computeSignal, growthOutlook, revenueConsensusMillions, SignalVerdict} from "./signal";

/**
 * p price; v verdict (D = DIP BUY, W = WATCH, P = PASS, - = none); t median analyst target; c consensus score
 * (1 = Strong Buy .. 5 = Sell); e EPS outlook %; r revenue growth %; f analysts' mean EPS estimate;
 * y analysts' revenue consensus for the nearest forecast fiscal year, in $ millions.
 */
export type Snap = { p: number, v: 'D' | 'W' | 'P' | '-', t?: number, c?: number, e?: number, r?: number, f?: number, y?: number };
export type DayLog = { spy?: number, vix?: number, s: Record<string, Snap> };
export type SnapshotLog = { v: 1, days: Record<string, DayLog> };
export type LogStorage = { getItem(key: string): string | null, setItem(key: string, value: string): void };

const STORAGE_KEY = 'watchlist.log.v1';

export function emptyLog(): SnapshotLog {
  return {v: 1, days: {}};
}

const VERDICT_CODE: Record<SignalVerdict, Snap['v']> = {'DIP BUY': 'D', 'WATCH': 'W', 'PASS': 'P'};

/** Today's reading of one stock, or undefined when it has no price. */
export function snapshotOf(stock: Stock, now: Date = new Date()): Snap | undefined {
  const price = stock.quote?.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return undefined;
  }
  const signal = computeSignal(stock, now);
  const snap: Snap = {p: price, v: signal ? VERDICT_CODE[signal.verdict] : '-'};
  const growth = growthOutlook(stock, now);
  const estimate = stock.equity?.analysis?.estimate;
  put(snap, 'e', growth?.epsOutlook, 1);
  put(snap, 'r', growth?.revenueGrowth, 1);
  put(snap, 't', estimate?.medianPriceTarget, 2);
  put(snap, 'c', estimate?.recommendationRate, 2);
  put(snap, 'f', estimate?.meanEpsTarget, 4);
  put(snap, 'y', revenueConsensusMillions(stock), 1);
  return snap;
}

function put(snap: Snap, key: 'e' | 'r' | 't' | 'c' | 'f' | 'y', value: number | undefined, decimals: number): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    snap[key] = Number(value.toFixed(decimals));
  }
}

/** Adds readings to a day (YYYY-MM-DD), keeping what other watchlists already recorded that day. */
export function record(log: SnapshotLog, day: string, entry: DayLog, maxDays = 800): SnapshotLog {
  const current = log.days[day];
  const merged: DayLog = {...current, s: {...current?.s, ...entry.s}};
  if (entry.spy !== undefined) {
    merged.spy = entry.spy;
  }
  if (entry.vix !== undefined) {
    merged.vix = entry.vix;
  }
  const days: Record<string, DayLog> = {...log.days, [day]: merged};
  const keys = Object.keys(days).sort();
  keys.slice(0, Math.max(0, keys.length - maxDays)).forEach(key => delete days[key]);
  return {v: 1, days};
}

/** The start of the stock's current unbroken run as a DIP BUY, or undefined if it is not one today. */
export function dipBuySince(log: SnapshotLog, symbol: string, today: string): { day: string, price: number, spy?: number } | undefined {
  let start: { day: string, price: number, spy?: number } | undefined;
  for (const day of daysUpTo(log, today)) {
    const snap = log.days[day].s[symbol];
    if (!snap) {
      continue;   // not recorded that day (the page was not opened, or the list failed to load): the run continues
    }
    if (snap.v !== 'D') {
      start = undefined;
    } else if (!start) {
      start = {day, price: snap.p, spy: log.days[day].spy};
    }
  }
  return start;
}

/** The latest reading of an analyst figure that is at least `minDaysAgo` days older than `today`. */
export function valueBefore(log: SnapshotLog, symbol: string, field: 't' | 'c' | 'f' | 'y', today: string, minDaysAgo: number): { day: string, value: number } | undefined {
  const days = daysUpTo(log, today).reverse();
  for (const day of days) {
    const value = log.days[day].s[symbol]?.[field];
    if (value !== undefined && daysBetween(day, today) >= minDaysAgo) {
      return {day, value};
    }
  }
  return undefined;
}

export type TrackRecord = {
  since?: string, opened: number, averageReturn?: number, averageSpyReturn?: number,
  /**
   * The middle one of the returns, and of the market's over the same days. This is what the page says: one stock
   * with a first price that is wrong (a bad reading, a share split) moves an average of twenty by many points and
   * the middle one not at all.
   */
  typicalReturn?: number, typicalSpyReturn?: number,
};

/**
 * The live track record: every time a stock began a run as a DIP BUY, how it has done from that day's price to
 * its latest recorded price, next to the S&P 500 over the same days. Runs that began on the latest day are
 * counted but not averaged: nothing has happened to them yet.
 */
export function trackRecord(log: SnapshotLog, today: string): TrackRecord {
  const days = daysUpTo(log, today);
  const latestDay = days[days.length - 1];
  const symbols = new Set<string>();
  days.forEach(day => Object.keys(log.days[day].s).forEach(symbol => symbols.add(symbol)));

  let opened = 0, since: string | undefined;
  const returns: number[] = [], spyReturns: number[] = [];
  symbols.forEach(symbol => {
    const recorded = days.filter(day => !!log.days[day].s[symbol]);
    const lastDay = recorded[recorded.length - 1];
    const last = log.days[lastDay].s[symbol];
    let inRun = false;
    for (const day of recorded) {
      const snap = log.days[day].s[symbol];
      if (snap.v !== 'D') {
        inRun = false;
        continue;
      }
      if (inRun) {
        continue;
      }
      inRun = true;
      opened++;
      since = since === undefined || day < since ? day : since;
      if (day === latestDay || !(snap.p > 0)) {
        continue;
      }
      returns.push((last.p / snap.p - 1) * 100);
      const spyThen = log.days[day].spy, spyNow = log.days[lastDay].spy;
      if (spyThen && spyNow) {
        spyReturns.push((spyNow / spyThen - 1) * 100);
      }
    }
  });
  return {
    since, opened, averageReturn: average(returns), averageSpyReturn: average(spyReturns),
    typicalReturn: middle(returns), typicalSpyReturn: middle(spyReturns),
  };
}

/** The middle value (the mean of the two middle ones for an even count); undefined for none. */
function middle(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b), half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

// ---- The log in the database. The page and the daily recorder both write to it, each
// ---- sending only its own readings as a change to merge, so neither can overwrite what the other recorded.

/** The log as the database holds it, or undefined when the value is not a log. */
export function parseLog(value: unknown): SnapshotLog | undefined {
  const raw = value as any;
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || !raw.days || typeof raw.days !== 'object' || Array.isArray(raw.days)) {
    return undefined;
  }
  const days: Record<string, DayLog> = {};
  Object.keys(raw.days).forEach(day => {
    const entry = raw.days[day];
    if (entry && typeof entry === 'object') {
      days[day] = {...entry, s: entry.s && typeof entry.s === 'object' ? entry.s : {}};
    }
  });
  return {v: 1, days};
}

/**
 * The database's log and this browser's copy as one: every day and every stock either has. Where both have a reading
 * the database's is kept (the database is the record; the recorder's reading after the close is the day's last).
 */
export function mergeLogs(inFile: SnapshotLog, inBrowser: SnapshotLog, maxDays = 800): SnapshotLog {
  const days: Record<string, DayLog> = {};
  new Set([...Object.keys(inBrowser.days), ...Object.keys(inFile.days)]).forEach(day => {
    const mine = inBrowser.days[day], theirs = inFile.days[day];
    days[day] = {...mine, ...theirs, s: {...mine?.s, ...theirs?.s}};
  });
  const keys = Object.keys(days).sort();
  keys.slice(0, Math.max(0, keys.length - maxDays)).forEach(key => delete days[key]);
  return {v: 1, days};
}

/** What this browser recorded that the database does not have yet (days, stocks, market readings), to send to it. */
export function missingIn(inFile: SnapshotLog | undefined, inBrowser: SnapshotLog): Record<string, DayLog> | undefined {
  const missing: Record<string, DayLog> = {};
  Object.keys(inBrowser.days).forEach(day => {
    const mine = inBrowser.days[day], theirs = inFile?.days[day];
    if (!theirs) {
      missing[day] = mine;
      return;
    }
    const part: DayLog = {s: {}};
    if (mine.spy !== undefined && theirs.spy === undefined) {
      part.spy = mine.spy;
    }
    if (mine.vix !== undefined && theirs.vix === undefined) {
      part.vix = mine.vix;
    }
    Object.keys(mine.s).filter(symbol => !theirs.s[symbol]).forEach(symbol => part.s[symbol] = mine.s[symbol]);
    if (part.spy !== undefined || part.vix !== undefined || Object.keys(part.s).length) {
      missing[day] = part;
    }
  });
  return Object.keys(missing).length ? missing : undefined;
}

/** One day's readings as a change for the database to merge in: the rest of the log is untouched. */
export function dayChange(day: string, entry: DayLog): { v: 1, days: Record<string, DayLog> } {
  return {v: 1, days: {[day]: entry}};
}

/** The change that drops the oldest days from the log once it holds more than `maxDays`, or undefined. */
export function trimChange(log: SnapshotLog, maxDays = 800): { days: Record<string, null> } | undefined {
  const keys = Object.keys(log.days).sort();
  const old = keys.slice(0, Math.max(0, keys.length - maxDays));
  return old.length ? {days: Object.fromEntries(old.map(day => [day, null]))} : undefined;
}

export function loadLog(storage: LogStorage = localStorage): SnapshotLog {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    return parsed && parsed.v === 1 && parsed.days && typeof parsed.days === 'object' ? parsed : emptyLog();
  } catch {
    return emptyLog();   // damaged text or storage unavailable: start again rather than break the page
  }
}

export function saveLog(log: SnapshotLog, storage: LogStorage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Storage full or unavailable (private mode): the page still works, it just forgets.
  }
}

function daysUpTo(log: SnapshotLog, today: string): string[] {
  return Object.keys(log.days).filter(day => day <= today).sort();
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function average(values: number[]): number | undefined {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}
