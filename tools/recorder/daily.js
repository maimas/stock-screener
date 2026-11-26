'use strict';
// Decides when the daily recording is due and runs it. The recording is due on weekdays at 16:30 New York time (the
// time the old Windows task used, with no list of market holidays). Every decision comes from the saved status and
// the clock, never from the fact that a timer fired, so a timer that fires early, twice, or late after the computer
// slept still records each missed stretch once.
const path = require('node:path');
const {recordDay} = require('./record-day');
const {writeCopy, copyIsDue} = require('../store/backup');

const ZONE = 'America/New_York';
const STATUS_KEY = 'recorder-status';
const COPY_STATUS_KEY = 'copy-status';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MIN_DELAY = 1000;
// A timer does not count the time a computer (or Docker's virtual machine) is asleep, so a timer set for the whole
// wait would fire as many hours late as the computer slept. Waking every minute and asking the clock instead makes
// the recording come within a minute of the computer waking up, as the old Windows task did.
const MAX_WAIT = 60 * 1000;

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric',
});

/** The date and time on a wall clock in New York at this instant. */
function newYorkParts(date) {
  const parts = {};
  for (const {type, value} of wallClock.formatToParts(date)) parts[type] = Number(value);
  return parts;
}

/** The instant of 16:30 on a calendar day in New York. The zone's own rules give the offset, so winter and summer time are right. */
function dueInstant(year, month, day) {
  const guess = Date.UTC(year, month - 1, day, 16, 30);
  // The clocks change at 2 in the morning, so at 16:30 the offset is the one of that whole afternoon; the zone is
  // asked at a moment that afternoon (21:30 UTC is after 16:30 on either side of the change).
  const asked = newYorkParts(new Date(guess + 5 * 60 * 60 * 1000));
  const wallAsUtc = Date.UTC(asked.year, asked.month - 1, asked.day, asked.hour, asked.minute, asked.second);
  const offset = wallAsUtc - (guess + 5 * 60 * 60 * 1000);
  return new Date(guess - offset);
}

/** Calendar days around a New York date: the day itself plus `shift` days, as {year, month, day, weekday}. */
function calendarDay(parts, shift) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + shift * DAY);
  return {year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay()};
}

const isWeekday = day => day.weekday >= 1 && day.weekday <= 5;

/** The latest weekday 16:30 in New York that is not after `now`. */
function lastDue(now) {
  const today = newYorkParts(now);
  for (let shift = 0; shift >= -10; shift--) {
    const day = calendarDay(today, shift);
    if (!isWeekday(day)) continue;
    const due = dueInstant(day.year, day.month, day.day);
    if (due.getTime() <= now.getTime()) return due;
  }
  throw new Error('no weekday found in the last ten days');
}

/** The first weekday 16:30 in New York after `now`. */
function nextDue(now) {
  const today = newYorkParts(now);
  for (let shift = 0; shift <= 10; shift++) {
    const day = calendarDay(today, shift);
    if (!isWeekday(day)) continue;
    const due = dueInstant(day.year, day.month, day.day);
    if (due.getTime() > now.getTime()) return due;
  }
  throw new Error('no weekday found in the next ten days');
}

/** True when no run is on record, its time is not a date, or it was before the last 16:30. */
function isDue(status, now) {
  const ranAt = Date.parse(status && status.ranAt);
  return Number.isNaN(ranAt) || ranAt < lastDue(now).getTime();
}

/**
 * Whether to record now, and when to look again, from the saved status, the time of a try that threw (kept in
 * memory, since such a try may have left no status) and the clock. A recording that worked since the last 16:30 is
 * never repeated. One that failed since then is tried again once an hour has passed since that try, and again each
 * hour, until one works or the next 16:30 comes, when that day's run takes over.
 */
function whenToRecord(status, threwAt, now) {
  const last = lastDue(now).getTime();
  const next = nextDue(now).getTime();
  const ranAt = Date.parse(status && status.ranAt);
  if (!isDue(status, now) && status.ok !== false) {
    return {due: false, at: next};
  }
  const failures = [threwAt, status && status.ok === false ? ranAt : NaN].filter(at => at >= last);
  if (failures.length === 0) {
    return {due: true, at: next};
  }
  const again = Math.max(...failures) + HOUR;
  return {due: now.getTime() >= again, at: Math.min(again, next)};
}

/** The sentence kept when a copy failed: fixed words and at most the error's code, never its message or a path. */
function copyFailure(error) {
  const code = error && typeof error.code === 'string' && /^E[A-Z]+$/.test(error.code) ? error.code : '';
  return `The daily copy could not be written${code ? ` (${code})` : ''}.`;
}

/**
 * Starts the schedule: looks at once, and again when something may be due, waking at least once a minute. When a
 * run is due it records, then always makes the daily copy if there is a folder for it; without a recording it looks
 * at most once an hour whether the copy is due. The outcome of every copy is kept under copy-status. Returns
 * {stop()}.
 */
function startDaily({
  storage, backupDir, record = recordDay, copy = writeCopy, now = () => new Date(),
  setTimer = setTimeout, clearTimer = clearTimeout, log: logTo = console.log,
}) {
  // A broken log must never stop the schedule, so every line goes through here.
  const log = line => {
    try {
      logTo(line);
    } catch {
      // nowhere left to report it
    }
  };
  let stopped = false;
  let timer = null;
  let hasTimer = false;
  let queue = Promise.resolve();
  // When the recording and the copy are next worth a look; until then a wake only sets the timer again. Both are
  // due at once at the start.
  let recordAt = -Infinity;
  let copyAt = -Infinity;
  let threwAt;

  const wakeAt = () => Math.min(recordAt, backupDir ? copyAt : Infinity);

  /** Records when a run is due; true when the recorder ran and finished. */
  async function recording(current) {
    if (current.getTime() < recordAt) return false;
    let ran = false;
    try {
      let {value: status} = await storage.read(STATUS_KEY);
      let plan = whenToRecord(status, threwAt, current);
      if (plan.due) {
        try {
          await record({storage, log, now: current});
        } catch (error) {
          threwAt = current.getTime();
          throw error;
        }
        ran = true;
        ({value: status} = await storage.read(STATUS_KEY));
        plan = whenToRecord(status, threwAt, current);
      }
      recordAt = plan.at;
    } catch (error) {
      log(`The daily recording failed: ${error && error.message || error}`);
      recordAt = Math.min(nextDue(current).getTime(), current.getTime() + HOUR);
    }
    return ran;
  }

  async function copying(current, recorded) {
    if (!backupDir || (!recorded && current.getTime() < copyAt)) return;
    copyAt = current.getTime() + HOUR;
    const at = now();
    let outcome;
    try {
      if (!recorded && !copyIsDue(backupDir, at)) return;
      const made = await copy(storage, backupDir, {now: at});
      // An empty store makes no copy, and nothing is written into it, so it stays empty for a copy to be put back.
      if (!made) return;
      outcome = {triedAt: at.toISOString(), ok: true, file: path.basename(made.file)};
    } catch (error) {
      log(`The daily copy failed: ${error && error.message || error}`);
      outcome = {triedAt: at.toISOString(), ok: false, message: copyFailure(error)};
    }
    try {
      await storage.write(COPY_STATUS_KEY, outcome);
    } catch (error) {
      log(`The outcome of the daily copy could not be kept: ${error && error.message || error}`);
    }
  }

  async function work() {
    const current = now();
    if (current.getTime() < wakeAt()) return;
    const recorded = await recording(current);
    await copying(current, recorded);
  }

  function arm() {
    if (hasTimer) clearTimer(timer);
    hasTimer = false;
    const delay = Math.min(MAX_WAIT, Math.max(MIN_DELAY, wakeAt() - now().getTime()));
    timer = setTimer(tick, delay);
    hasTimer = true;
  }

  // Ticks run one after the other: one that arrives while another is still working waits, and then finds nothing due.
  function tick() {
    if (stopped) return queue;
    queue = queue.then(async () => {
      if (stopped) return;
      try {
        await work();
      } finally {
        if (!stopped) {
          try {
            arm();
          } catch (error) {
            log(`The daily schedule could not set its timer: ${error && error.message || error}`);
          }
        }
      }
    }).catch(error => log(`The daily schedule failed: ${error && error.message || error}`));
    return queue;
  }

  tick();
  return {
    stop() {
      stopped = true;
      if (hasTimer) clearTimer(timer);
      hasTimer = false;
    },
  };
}

module.exports = {lastDue, nextDue, isDue, startDaily};
