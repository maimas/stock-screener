import {shortDay, VIEW_WORDS, ViewWord} from "./claude-view";
import {signedPercent} from "./format";
import {SnapshotLog} from "./snapshot-log";

/**
 * How Claude's past views turned out: for every view that is at least 4 weeks old, how the stock has done since the
 * day it was given, beside the S&P 500 over the same days.
 *
 * A view is Claude's opinion and no test stands behind it. This is what the page can show for or against it, and it
 * is a look, not a test: the stocks are the reader's own lists, the weeks are few, and nothing on the page acts on
 * it. Both prices come from the page's daily log, the stock's and the market's alike, so the two are read the same
 * way; the figure given is the middle one, as everywhere on the page, because one big winner moves an average.
 */

/** A view counts once it is this old. */
export const CHECK_AFTER_DAYS = 28;
/** A stock asked about on a day the log has no price for takes the last one logged up to this many days before. */
const NEAR_DAYS = 3;

export type WordRecord = {
  calls: number,
  /** The middle one of the stocks' changes since the day of each view, in percent. */
  typical: number,
  /** The middle one of the S&P 500's changes over the same days; not there when the log has none for them. */
  sp500?: number,
};

export type ViewRecord = {
  byWord: Partial<Record<ViewWord, WordRecord>>,
  /** Views old enough whose stock has no price in the log for the day asked, or is no longer logged. */
  notFollowed: number,
  /** The day of the earliest view counted. */
  since?: string,
  /** While no view is old enough: the day the first one will be. */
  firstCheck?: string,
};

const dayNumber = (day: string): number => Date.parse(`${day}T12:00:00Z`) / 86_400_000;
const daysBetween = (from: string, to: string): number => Math.round(dayNumber(to) - dayNumber(from));
const dayAfter = (day: string, days: number): string => new Date((dayNumber(day) + days) * 86_400_000).toISOString().slice(0, 10);

function middle(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b), half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

/**
 * @param history every view kept, by stock and by day (`history` of what the server said)
 * @param log     the page's daily log
 * @param today   YYYY-MM-DD
 */
export function viewRecord(history: Record<string, Record<string, { view: ViewWord }>>, log: SnapshotLog, today: string): ViewRecord {
  const days = Object.keys(log.days).filter(day => day <= today).sort();
  const lastDay = days[days.length - 1];
  const changes: Partial<Record<ViewWord, { stock: number[], market: number[] }>> = {};
  let notFollowed = 0, since: string | undefined, earliest: string | undefined;

  Object.entries(history).forEach(([symbol, views]) => {
    const logged = days.filter(day => log.days[day].s[symbol]?.p > 0);
    Object.entries(views).forEach(([day, {view}]) => {
      earliest = earliest === undefined || day < earliest ? day : earliest;
      if (daysBetween(day, today) < CHECK_AFTER_DAYS) {
        return;
      }
      const from = [...logged].reverse().find(it => it <= day && daysBetween(it, day) <= NEAR_DAYS);
      const to = logged[logged.length - 1];
      if (!from || !to || to <= from || daysBetween(to, lastDay) > NEAR_DAYS) {
        notFollowed++;
        return;
      }
      const of = changes[view] ??= {stock: [], market: []};
      of.stock.push((log.days[to].s[symbol].p / log.days[from].s[symbol].p - 1) * 100);
      const marketThen = log.days[from].spy, marketNow = log.days[to].spy;
      if (marketThen && marketNow) {
        of.market.push((marketNow / marketThen - 1) * 100);
      }
      since = since === undefined || day < since ? day : since;
    });
  });

  const byWord: ViewRecord['byWord'] = {};
  VIEW_WORDS.forEach(word => {
    const of = changes[word];
    if (of) {
      const sp500 = middle(of.market);
      byWord[word] = {calls: of.stock.length, typical: middle(of.stock)!, ...(sp500 === undefined ? {} : {sp500})};
    }
  });
  const counted = Object.keys(byWord).length > 0;
  return {
    byWord, notFollowed,
    ...(since ? {since} : {}),
    ...(!counted && !notFollowed && earliest ? {firstCheck: dayAfter(earliest, CHECK_AFTER_DAYS)} : {}),
  };
}

/** The record in words, for where the pointer rests on the column's heading. Nothing before any view was asked for. */
export function recordTip(made: ViewRecord): string {
  const words = VIEW_WORDS.filter(word => made.byWord[word]).map(word => {
    const it = made.byWord[word]!;
    return `${word}: ${it.calls} call${it.calls === 1 ? '' : 's'}, typical ${signedPercent(it.typical)}` +
      (it.sp500 === undefined ? '' : ` · S&P 500 ${signedPercent(it.sp500)}`) + '.';
  });
  const apart = made.notFollowed ? [`${made.notFollowed} no longer followed.`] : [];
  if (!words.length) {
    return made.firstCheck ? `Too early to tell: the first calls can be checked from ${shortDay(made.firstCheck)}.` : apart.join(' ');
  }
  return ['How its views of 4 weeks ago or more turned out:', ...words, `Since ${shortDay(made.since!)}.`, ...apart, 'A look, not a test.'].join(' ');
}
