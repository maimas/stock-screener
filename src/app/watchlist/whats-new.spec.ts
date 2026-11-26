import {changesSince, whatsNew} from "./whats-new";
import {PositionRow} from "./portfolio-view";
import {viewOf} from "./positions";
import {DayLog, emptyLog, SnapshotLog} from "./snapshot-log";

const TODAY = '2026-11-21', YESTERDAY = '2026-11-20';
type Mark = 'D' | 'W' | 'P' | '-';

/** One day of the log: the mark each stock had, and the VIX when given. */
function reading(marks: Record<string, Mark>, vix?: number): DayLog {
  const day: DayLog = {s: {}};
  Object.keys(marks).forEach(symbol => day.s[symbol] = {p: 100, v: marks[symbol]});
  if (vix !== undefined) {
    day.vix = vix;
  }
  return day;
}

const logOf = (days: Record<string, DayLog>): SnapshotLog => ({v: 1, days});

/** A holding bought on that day. */
function holding(symbol: string, bought: string): PositionRow {
  return {symbol, view: viewOf({symbol, shares: 10, price: 100, day: bought}, {price: 100, portfolioValue: 10_000, today: TODAY})};
}

const SAME = {NVDA: 'D', MSFT: 'W', AAPL: 'P'} as const;

describe('whatsNew (what changed since the last day in the log, for the top of the plan)', () => {
  it('has nothing to say without an earlier day to compare with, or before today is recorded', () => {
    expect(whatsNew(emptyLog(), TODAY, [])).toBeUndefined();
    expect(whatsNew(logOf({[TODAY]: reading(SAME)}), TODAY, [])).toBeUndefined();
    expect(whatsNew(logOf({[YESTERDAY]: reading(SAME)}), TODAY, [])).toBeUndefined();
    expect(whatsNew(logOf({[YESTERDAY]: reading({}), [TODAY]: reading(SAME)}), TODAY, [])).withContext('a day without stocks').toBeUndefined();
  });

  it('says so when nothing changed, naming the day it compares with', () => {
    const step = whatsNew(logOf({[YESTERDAY]: reading(SAME, 18), [TODAY]: reading(SAME, 19)}), TODAY, [])!;
    expect(step.kind).toBe('news');
    expect(step.verb).toBe("WHAT'S NEW");
    expect(step.items).toEqual([]);
    expect(step.text).toBe('Nothing changed since yesterday.');
    const older = whatsNew(logOf({'2026-11-17': reading(SAME), [TODAY]: reading(SAME)}), TODAY, [])!;
    expect(older.text).toBe('Nothing changed since Nov 17.');
  });

  it('compares with the latest earlier day, not with an older one', () => {
    const log = logOf({'2026-11-17': reading({NVDA: 'W'}), [YESTERDAY]: reading({NVDA: 'D'}), [TODAY]: reading({NVDA: 'D'})});
    expect(whatsNew(log, TODAY, [])!.text).toBe('Nothing changed since yesterday.');
  });

  it('names the stocks that joined the ones to buy and those that left, A to Z', () => {
    const log = logOf({
      [YESTERDAY]: reading({MRVL: 'P', AMD: 'W', CRWD: 'D', NVDA: 'D', SNDK: '-'}),
      [TODAY]: reading({MRVL: 'D', AMD: 'D', CRWD: 'W', NVDA: 'D', SNDK: 'D'}),
    });
    const step = whatsNew(log, TODAY, [])!;
    expect(step.items).toEqual([
      {symbol: 'AMD', label: 'new to buy'}, {symbol: 'CRWD', label: 'no longer to buy'},
      {symbol: 'MRVL', label: 'new to buy'}, {symbol: 'SNDK', label: 'new to buy'},
    ]);
    expect(step.text).toBe('Since yesterday.');
  });

  it('does not count a stock that was not on the page that day, or one that has left it since', () => {
    const log = logOf({[YESTERDAY]: reading({NVDA: 'D', GONE: 'D'}), [TODAY]: reading({NVDA: 'D', ADDED: 'D'})});
    expect(whatsNew(log, TODAY, [])!.items).toEqual([]);
  });

  it('says which of your stocks passed their 6 months since then', () => {
    // Bought 2026-05-23: held 182 days today, 181 yesterday. Bought 2026-05-03: 202 days, long past.
    const log = logOf({[YESTERDAY]: reading(SAME), [TODAY]: reading(SAME)});
    const step = whatsNew(log, TODAY, [holding('AVGO', '2026-05-23'), holding('OLD', '2026-05-03'), holding('NEW', '2026-11-02')])!;
    expect(step.items).toEqual([{symbol: 'AVGO', label: 'held 6 months'}]);
    expect(step.text).toBe('Since yesterday.');
    // Compared with three days ago, a stock bought two days earlier (184 days today, 181 then) passed them too.
    const since = whatsNew(logOf({'2026-11-18': reading(SAME), [TODAY]: reading(SAME)}), TODAY, [holding('AVGO', '2026-05-23'), holding('GEV', '2026-05-21')])!;
    expect(since.items).toEqual([{symbol: 'AVGO', label: 'held 6 months'}, {symbol: 'GEV', label: 'held 6 months'}]);
    expect(since.text).toBe('Since Nov 18.');
  });

  it('puts two changes of one stock on one item', () => {
    const log = logOf({[YESTERDAY]: reading({AVGO: 'W'}), [TODAY]: reading({AVGO: 'D'})});
    expect(whatsNew(log, TODAY, [holding('AVGO', '2026-05-23')])!.items).toEqual([{symbol: 'AVGO', label: 'new to buy, held 6 months'}]);
  });

  it('says when the market turned fearful, or stopped being so', () => {
    const market = (before?: number, now?: number) => whatsNew(logOf({[YESTERDAY]: reading(SAME, before), [TODAY]: reading(SAME, now)}), TODAY, [])!.text;
    expect(market(22, 27)).toBe('Since yesterday. The market turned fearful.');
    expect(market(27, 22)).toBe('Since yesterday. The market is no longer fearful.');
    expect(market(26, 31)).withContext('fearful on both days').toBe('Nothing changed since yesterday.');
    expect(market(24.9, 25)).withContext('25 counts as fearful').toBe('Since yesterday. The market turned fearful.');
    expect(market(undefined, 31)).withContext('no reading to compare with').toBe('Nothing changed since yesterday.');
  });

  it('keeps the line short and in everyday words, and says in the evidence where it comes from', () => {
    const log = logOf({'2026-09-30': reading({AMD: 'W', CRWD: 'D'}, 22), [TODAY]: reading({AMD: 'D', CRWD: 'P'}, 31)});
    const step = whatsNew(log, TODAY, [holding('AVGO', '2026-04-10')])!;
    expect(step.text).toBe('Since Sep 30. The market turned fearful.');
    [step.text, ...step.items.map(it => it.label ?? '')].forEach(text => {
      expect(text.length).withContext(text).toBeLessThanOrEqual(80);
      expect(text).withContext(text).not.toMatch(/DIP BUY|VIX|S&P|index|position|backtest/i);
    });
    expect(step.verb.length).toBeLessThanOrEqual(10);
    // A reason shows its first sentence, and "more" opens the rest: one sentence of 45 words left nothing to open.
    expect(step.why).toBe(
      'This compares today with Sep 30, the last day before today in the daily log this app keeps. ' +
      'It looks at which stocks were marked DIP BUY then and are now, which of your stocks passed 6 months of being held, and ' +
      'whether the VIX crossed 25. These are facts about what changed, not a tested signal.');
  });
});

describe('changesSince (the facts behind "what\'s new": the page says them in a line)', () => {
  it('has nothing without an earlier day to compare with, or before today is recorded', () => {
    expect(changesSince(emptyLog(), TODAY, [])).toBeUndefined();
    expect(changesSince(logOf({[TODAY]: reading(SAME)}), TODAY, [])).toBeUndefined();
    expect(changesSince(logOf({[YESTERDAY]: reading(SAME)}), TODAY, [])).toBeUndefined();
  });

  it('gives the day compared with, who joined and who left the stocks to buy, which holdings passed 6 months, and the market', () => {
    const log = logOf({'2026-11-18': reading({MRVL: 'P', AMD: 'W', CRWD: 'D', NVDA: 'D'}, 22), [TODAY]: reading({MRVL: 'D', AMD: 'D', CRWD: 'W', NVDA: 'D'}, 31)});
    const rows = [holding('GEV', '2026-05-21'), holding('AVGO', '2026-05-23'), holding('NEW', '2026-11-02')];
    expect(changesSince(log, TODAY, rows)).toEqual({
      earlier: '2026-11-18', daysBetween: 3, joined: ['AMD', 'MRVL'], left: ['CRWD'], passed: ['GEV', 'AVGO'], market: 'fearful',
    });
  });

  it('is empty, with no word on the market, when nothing changed', () => {
    const log = logOf({[YESTERDAY]: reading(SAME, 30), [TODAY]: reading(SAME, 31)});
    expect(changesSince(log, TODAY, [holding('NEW', '2026-11-02')])).toEqual({earlier: YESTERDAY, daysBetween: 1, joined: [], left: [], passed: []});
    const calmer = logOf({[YESTERDAY]: reading(SAME, 30), [TODAY]: reading(SAME, 20)});
    expect(changesSince(calmer, TODAY, [])!.market).toBe('calm');
  });

  it('needs only the name and the time held of a holding, so the daily job can ask without loading prices', () => {
    const log = logOf({[YESTERDAY]: reading(SAME), [TODAY]: reading(SAME)});
    expect(changesSince(log, TODAY, [{symbol: 'AVGO', view: {daysHeld: 182}}, {symbol: 'OLD', view: {daysHeld: 300}}, {symbol: 'UNDATED', view: {}}])!.passed)
      .toEqual(['AVGO']);
  });
});

describe('changesSince, on marks that are not to buy', () => {
  it('does not count a stock that moved between two marks neither of which is to buy', () => {
    const log = logOf({[YESTERDAY]: reading({AMD: 'W', MU: 'P', SMH: '-'}), [TODAY]: reading({AMD: 'P', MU: '-', SMH: 'W'})});
    expect(changesSince(log, TODAY, [])).toEqual({earlier: YESTERDAY, daysBetween: 1, joined: [], left: [], passed: []});
    expect(whatsNew(log, TODAY, [])!.text).toBe('Nothing changed since yesterday.');
  });
});
