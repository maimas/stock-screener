import {PlanItem, PlanStep} from "./plan";
import {PositionRow} from "./portfolio-view";
import {TESTED_DAYS} from "./positions";
import {VIX_HIGH} from "./signal";
import {SnapshotLog} from "./snapshot-log";

/**
 * "What's new": what changed since the last day in the daily log, as the first line of the plan card, so that a
 * daily look takes ten seconds. It says which stocks joined the ones to buy and which left, which of the
 * portfolio's stocks passed 6 months of being held, and whether the market turned fearful or stopped being so.
 *
 * It is not a step of the plan and no test stands behind it: these are facts read off the log (the page and the
 * daily recorder write one entry a day). It has the shape of a step so the card shows it, and "How the plan was
 * tested" explains it, like the steps.
 */
const VERB = "WHAT'S NEW";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** A holding as far as this needs it: its name and how long it has been held. */
export type HeldRow = { symbol: string, view: Pick<PositionRow['view'], 'daysHeld'> };

/** What changed between the last earlier day in the daily log and today. */
export type Changes = {
  /** The day compared with, as YYYY-MM-DD, and how many days before today it is. */
  earlier: string
  daysBetween: number
  /** The stocks that are marked to buy now and were not then, and the other way round, each A to Z. */
  joined: string[]
  left: string[]
  /** The holdings that passed 6 months of being held since that day, in the order they were given. */
  passed: string[]
  /** Set when the market turned fearful since that day, or stopped being so. */
  market?: 'fearful' | 'calm'
};

/**
 * The facts themselves, which the page says as the plan's first line (`whatsNew`): one reading of the log, so every
 * place that tells them says the same thing.
 *
 * @param log   the daily log, with today's reading in it
 * @param today today as YYYY-MM-DD
 * @param rows  the holdings as they stand today
 * @returns undefined when there is nothing to compare: today is not recorded yet, or the log has no earlier day
 */
export function changesSince(log: SnapshotLog, today: string, rows: HeldRow[]): Changes | undefined {
  const now = log.days[today];
  const earlier = Object.keys(log.days).filter(day => day < today && Object.keys(log.days[day].s).length > 0).sort().pop();
  if (!now || Object.keys(now.s).length === 0 || !earlier) {
    return undefined;
  }
  const before = log.days[earlier];
  const daysBetween = Math.round((Date.parse(today) - Date.parse(earlier)) / DAY_MS);

  // A stock is compared only when it was on the page on both days: one that was added to a list since, or has
  // left the lists, did not change its mark.
  const joined: string[] = [], left: string[] = [];
  Object.keys(now.s).sort().forEach(symbol => {
    const was = before.s[symbol]?.v, is = now.s[symbol].v;
    if (was !== undefined && (was === 'D') !== (is === 'D')) {
      (is === 'D' ? joined : left).push(symbol);
    }
  });
  const passed = rows.filter(row => {
    const held = row.view.daysHeld;
    return held !== undefined && held >= TESTED_DAYS && held - daysBetween < TESTED_DAYS;
  }).map(row => row.symbol);

  const changes: Changes = {earlier, daysBetween, joined, left, passed};
  const fearful = (vix: number | undefined) => vix === undefined ? undefined : vix >= VIX_HIGH;
  const was = fearful(before.vix), is = fearful(now.vix);
  if (was !== undefined && is !== undefined && was !== is) {
    changes.market = is ? 'fearful' : 'calm';
  }
  return changes;
}

/** "The market turned fearful." or "The market is no longer fearful."; nothing when it did neither. */
export function marketSentence(changes: Changes): string {
  return !changes.market ? '' : changes.market === 'fearful' ? 'The market turned fearful.' : 'The market is no longer fearful.';
}

/** The day compared with, as it is said after "since": "yesterday", or "Nov 18". */
export function sinceWord(changes: Changes): string {
  return changes.daysBetween === 1 ? 'yesterday' : shortDate(changes.earlier);
}

/**
 * @param log   the daily log, with today's reading in it
 * @param today today as YYYY-MM-DD
 * @param rows  the portfolio's holdings as they stand today
 * @returns undefined when there is nothing to compare: today is not recorded yet, or the log has no earlier day
 */
export function whatsNew(log: SnapshotLog, today: string, rows: PositionRow[]): PlanStep | undefined {
  const changes = changesSince(log, today, rows);
  if (!changes) {
    return undefined;
  }
  const labels = new Map<string, string[]>();
  const add = (symbol: string, label: string) => labels.set(symbol, [...labels.get(symbol) ?? [], label]);
  changes.joined.forEach(symbol => add(symbol, 'new to buy'));
  changes.left.forEach(symbol => add(symbol, 'no longer to buy'));
  changes.passed.forEach(symbol => add(symbol, 'held 6 months'));
  const items: PlanItem[] = [...labels.keys()].sort().map(symbol => ({symbol, label: labels.get(symbol)!.join(', ')}));

  const market = marketSentence(changes);
  const since = sinceWord(changes);
  return {
    kind: 'news', verb: VERB, items,
    text: items.length === 0 && !market ? `Nothing changed since ${since}.` : `Since ${since}.${market ? ` ${market}` : ''}`,
    // Two sentences before the last: in "How the plan was tested" a reason shows its first, and "more" opens the rest.
    why: `This compares today with ${shortDate(changes.earlier)}, the last day before today in the daily log this app keeps. ` +
      'It looks at which stocks were marked DIP BUY then and are now, which of your stocks passed 6 months of being held, and ' +
      `whether the VIX crossed ${VIX_HIGH}. These are facts about what changed, not a tested signal.`,
  };
}

/** "Nov 18" for a day written YYYY-MM-DD. */
function shortDate(day: string): string {
  const [, month, date] = day.split('-').map(Number);
  return `${MONTHS[month - 1]} ${date}`;
}
