import {recordTip, viewRecord} from "./claude-view-record";
import {ViewWord} from "./claude-view";
import {emptyLog, record, SnapshotLog} from "./snapshot-log";

type Days = Record<string, { spy?: number, s: Record<string, number> }>;

/** A daily log from made-up prices: {day: {spy, s: {symbol: price}}}. */
function logOf(days: Days): SnapshotLog {
  let log = emptyLog();
  Object.keys(days).sort().forEach(day => {
    const s = Object.fromEntries(Object.entries(days[day].s).map(([symbol, p]) => [symbol, {p, v: '-' as const}]));
    log = record(log, day, {spy: days[day].spy, s});
  });
  return log;
}

const said = (calls: Record<string, Record<string, ViewWord>>) => Object.fromEntries(
  Object.entries(calls).map(([symbol, days]) => [symbol, Object.fromEntries(Object.entries(days).map(([day, view]) => [day, {view}]))]));

// A view of Claude is an opinion no test stands behind. What the page can show for or against it is how the stocks
// did after each view, from the prices of its own daily log, beside the S&P 500 over the same days.
describe("viewRecord (how Claude's past views turned out)", () => {
  const TODAY = '2026-12-30';

  it('has nothing to say before any view was asked for', () => {
    const none = viewRecord({}, emptyLog(), TODAY);
    expect(none).toEqual({byWord: {}, notFollowed: 0});
    expect(recordTip(none)).toBe('');
  });

  it('says it is too early until a view is 4 weeks old, and from which day the first can be checked', () => {
    const log = logOf({'2026-12-10': {spy: 100, s: {ABCD: 50}}, '2026-12-30': {spy: 110, s: {ABCD: 60}}});
    const early = viewRecord(said({ABCD: {'2026-12-10': 'BUY SOME'}, EFGH: {'2026-12-03': 'WAIT'}}), log, TODAY);
    expect(early.byWord).toEqual({});
    expect(early.firstCheck).toBe('2026-12-31');
    expect(recordTip(early)).toBe('Too early to tell: the first calls can be checked from Dec 31.');
  });

  it('counts a view that is exactly 4 weeks old', () => {
    const log = logOf({'2026-12-02': {spy: 100, s: {ABCD: 50}}, '2026-12-30': {spy: 110, s: {ABCD: 60}}});
    const made = viewRecord(said({ABCD: {'2026-12-02': 'BUY SOME'}}), log, TODAY);
    expect(made.byWord['BUY SOME']!.calls).toBe(1);
    expect(made.byWord['BUY SOME']!.typical).toBeCloseTo(20, 6);
    expect(made.byWord['BUY SOME']!.sp500).toBeCloseTo(10, 6);
    expect(made.since).toBe('2026-12-02');
  });

  it('gives the middle result of each word, not the average: one big winner does not carry the rest', () => {
    const log = logOf({
      '2026-11-26': {spy: 100, s: {AAAA: 100, BBBB: 100, CCCC: 100, DDDD: 100}},
      '2026-12-30': {spy: 102, s: {AAAA: 101, BBBB: 102, CCCC: 130, DDDD: 90}},
    });
    const made = viewRecord(said({
      AAAA: {'2026-11-26': 'BUY SOME'}, BBBB: {'2026-11-26': 'BUY SOME'}, CCCC: {'2026-11-26': 'BUY SOME'}, DDDD: {'2026-11-26': 'AVOID'},
    }), log, TODAY);
    expect(made.byWord['BUY SOME']!.calls).toBe(3);
    expect(made.byWord['BUY SOME']!.typical).toBeCloseTo(2, 6);
    expect(made.byWord['AVOID']!.typical).toBeCloseTo(-10, 6);
    expect(made.byWord['WAIT']).toBeUndefined();
    expect(recordTip(made)).toBe('How its views of 4 weeks ago or more turned out: BUY SOME: 3 calls, typical +2.0% · S&P 500 +2.0%. ' +
      'AVOID: 1 call, typical −10.0% · S&P 500 +2.0%. Since Nov 26. A look, not a test.');
  });

  it('takes both prices from the log: the day asked (or the last logged day up to 3 days before it) and the latest day', () => {
    const log = logOf({
      '2026-11-20': {spy: 200, s: {ABCD: 40, EFGH: 10}},   // a Friday
      '2026-11-22': {spy: 999, s: {}},                     // the stock was not logged on the Sunday it was asked about
      '2026-12-29': {spy: 210, s: {ABCD: 50, EFGH: 10}},
      '2026-12-30': {spy: 220, s: {ABCD: 44, EFGH: 10}},
    });
    const made = viewRecord(said({ABCD: {'2026-11-22': 'WAIT'}, EFGH: {'2026-11-25': 'WAIT'}}), log, TODAY);
    expect(made.byWord['WAIT']!.calls).withContext('EFGH has no price within 3 days before the 25th').toBe(1);
    expect(made.byWord['WAIT']!.typical).toBeCloseTo(10, 6);
    expect(made.byWord['WAIT']!.sp500).withContext('the market over the same two days of the log').toBeCloseTo(10, 6);
    expect(made.notFollowed).toBe(1);
  });

  it('counts apart a stock that is no longer in the log (taken off every list)', () => {
    const log = logOf({
      '2026-11-26': {spy: 100, s: {ABCD: 50, GONE: 20}},
      '2026-12-01': {spy: 101, s: {ABCD: 51, GONE: 25}},
      '2026-12-30': {spy: 110, s: {ABCD: 55}},
    });
    const made = viewRecord(said({ABCD: {'2026-11-26': 'BUY SOME'}, GONE: {'2026-11-26': 'BUY SOME'}}), log, TODAY);
    expect(made.byWord['BUY SOME']!.calls).toBe(1);
    expect(made.notFollowed).toBe(1);
    expect(recordTip(made)).toBe('How its views of 4 weeks ago or more turned out: BUY SOME: 1 call, typical +10.0% · S&P 500 +10.0%. ' +
      'Since Nov 26. 1 no longer followed. A look, not a test.');
  });

  it('leaves the market out, and says so by its absence, where the log has no S&P 500 for those days', () => {
    const log = logOf({'2026-11-26': {s: {ABCD: 50}}, '2026-12-30': {s: {ABCD: 55}}});
    const made = viewRecord(said({ABCD: {'2026-11-26': 'WAIT'}}), log, TODAY);
    expect(made.byWord['WAIT']).toEqual({calls: 1, typical: jasmine.any(Number) as unknown as number});
    expect(recordTip(made)).toBe('How its views of 4 weeks ago or more turned out: WAIT: 1 call, typical +10.0%. Since Nov 26. A look, not a test.');
  });

  it('counts each day a stock was asked about as a call of its own', () => {
    const log = logOf({
      '2026-11-20': {spy: 100, s: {ABCD: 50}}, '2026-11-27': {spy: 100, s: {ABCD: 40}}, '2026-12-30': {spy: 100, s: {ABCD: 60}},
    });
    const made = viewRecord(said({ABCD: {'2026-11-20': 'WAIT', '2026-11-27': 'BUY SOME', '2026-12-20': 'BUY SOME'}}), log, TODAY);
    expect(made.byWord['WAIT']!.typical).toBeCloseTo(20, 6);
    expect(made.byWord['BUY SOME']!.calls).withContext('the one of Dec 20 is too young').toBe(1);
    expect(made.byWord['BUY SOME']!.typical).toBeCloseTo(50, 6);
  });
});
