import {
  dayChange, dipBuySince, emptyLog, loadLog, mergeLogs, missingIn, parseLog, record, saveLog, SnapshotLog, snapshotOf, trackRecord,
  trimChange, valueBefore
} from "./snapshot-log";
import {flatCloses, makeStock, NOW, reportedQuarters} from "./testing/fixtures";

function logOf(days: Record<string, { spy?: number, s: Record<string, { p: number, v: 'D' | 'W' | 'P', t?: number }> }>): SnapshotLog {
  let log = emptyLog();
  Object.keys(days).sort().forEach(day => log = record(log, day, days[day]));
  return log;
}

describe('record', () => {
  it('adds stocks from a second watchlist to the same day instead of replacing the first', () => {
    let log = record(emptyLog(), '2026-11-21', {spy: 689.81, s: {NVDA: {p: 125.53, v: 'D'}}});
    log = record(log, '2026-11-21', {s: {AMD: {p: 424.39, v: 'D'}}});
    expect(Object.keys(log.days['2026-11-21'].s).sort()).toEqual(['AMD', 'NVDA']);
    expect(log.days['2026-11-21'].spy).toBe(689.81);
  });

  it('keeps the latest reading when a stock is recorded twice in a day', () => {
    let log = record(emptyLog(), '2026-11-21', {s: {NVDA: {p: 130, v: 'D'}}});
    log = record(log, '2026-11-21', {s: {NVDA: {p: 125.53, v: 'D'}}});
    expect(log.days['2026-11-21'].s['NVDA'].p).toBe(125.53);
  });

  it('drops the oldest days beyond the limit', () => {
    let log = emptyLog();
    ['2026-11-19', '2026-11-20', '2026-11-21'].forEach(day => log = record(log, day, {s: {NVDA: {p: 1, v: 'D'}}}, 2));
    expect(Object.keys(log.days).sort()).toEqual(['2026-11-20', '2026-11-21']);
  });
});

describe('dipBuySince', () => {
  it('finds the day the current DIP BUY run began, with the price and S&P level then', () => {
    const log = logOf({
      '2026-11-02': {spy: 760, s: {NVDA: {p: 220, v: 'W'}}},
      '2026-11-03': {spy: 750, s: {NVDA: {p: 200, v: 'D'}}},
      '2026-11-04': {spy: 745, s: {NVDA: {p: 190, v: 'D'}}},
      '2026-11-21': {spy: 690, s: {NVDA: {p: 125, v: 'D'}}},
    });
    expect(dipBuySince(log, 'NVDA', '2026-11-21')).toEqual({day: '2026-11-03', price: 200, spy: 750});
  });

  it('restarts the run after a day with another verdict', () => {
    const log = logOf({
      '2026-11-03': {s: {NVDA: {p: 200, v: 'D'}}},
      '2026-11-04': {s: {NVDA: {p: 215, v: 'W'}}},
      '2026-11-21': {s: {NVDA: {p: 125, v: 'D'}}},
    });
    expect(dipBuySince(log, 'NVDA', '2026-11-21')?.day).toBe('2026-11-21');
  });

  it('does not break the run on days the stock was not recorded', () => {
    const log = logOf({
      '2026-11-03': {s: {NVDA: {p: 200, v: 'D'}}},
      '2026-11-04': {s: {AMD: {p: 400, v: 'W'}}},
      '2026-11-21': {s: {NVDA: {p: 125, v: 'D'}}},
    });
    expect(dipBuySince(log, 'NVDA', '2026-11-21')?.day).toBe('2026-11-03');
  });

  it('is undefined when the stock is not a DIP BUY today', () => {
    const log = logOf({'2026-11-03': {s: {NVDA: {p: 200, v: 'D'}}}, '2026-11-21': {s: {NVDA: {p: 230, v: 'W'}}}});
    expect(dipBuySince(log, 'NVDA', '2026-11-21')).toBeUndefined();
  });
});

describe('valueBefore', () => {
  it('returns the most recent reading that is at least the given number of days old', () => {
    const log = logOf({
      '2026-10-22': {s: {NVDA: {p: 220, v: 'W', t: 250}}},
      '2026-11-11': {s: {NVDA: {p: 180, v: 'D', t: 240}}},
      '2026-11-21': {s: {NVDA: {p: 125, v: 'D', t: 235}}},
    });
    expect(valueBefore(log, 'NVDA', 't', '2026-11-21', 20)).toEqual({day: '2026-10-22', value: 250});
  });

  it('is undefined while the log is younger than that', () => {
    const log = logOf({'2026-11-21': {s: {NVDA: {p: 125, v: 'D', t: 235}}}});
    expect(valueBefore(log, 'NVDA', 't', '2026-11-21', 20)).toBeUndefined();
  });
});

describe('trackRecord', () => {
  it('averages the return of every DIP BUY since it was first flagged, next to the S&P over the same days', () => {
    const log = logOf({
      '2026-11-03': {spy: 500, s: {NVDA: {p: 100, v: 'D'}, AMD: {p: 210, v: 'W'}}},
      '2026-11-04': {spy: 505, s: {NVDA: {p: 104, v: 'D'}, AMD: {p: 200, v: 'D'}}},
      '2026-11-21': {spy: 510, s: {NVDA: {p: 110, v: 'D'}, AMD: {p: 190, v: 'D'}}},
    });
    const record = trackRecord(log, '2026-11-21');
    expect(record.opened).toBe(2);
    expect(record.since).toBe('2026-11-03');
    expect(record.averageReturn).toBeCloseTo(2.5, 6);            // NVDA +10%, AMD -5%
    expect(record.averageSpyReturn).toBeCloseTo(1.49505, 4);     // +2% and +0.990099%
  });

  // Found on the page: one stock whose first recorded price was wrong showed "+306% since" and pulled the average
  // of twenty stocks up by many points. The page now says the middle one, which one bad price does not move.
  it('also gives the middle return, which one wrong first price does not move', () => {
    const log = logOf({
      '2026-11-03': {spy: 500, s: {AAA: {p: 100, v: 'D'}, BBB: {p: 100, v: 'D'}, CCC: {p: 25, v: 'D'}}},
      '2026-11-21': {spy: 510, s: {AAA: {p: 102, v: 'D'}, BBB: {p: 98, v: 'D'}, CCC: {p: 100, v: 'D'}}},
    });
    const record = trackRecord(log, '2026-11-21');
    expect(record.averageReturn).withContext('+2%, -2% and +300%').toBeCloseTo(100, 6);
    expect(record.typicalReturn).toBeCloseTo(2, 6);
    expect(record.typicalSpyReturn).toBeCloseTo(2, 6);
  });

  it('takes the mean of the two middle ones for an even count, and has no middle one for none', () => {
    const two = logOf({
      '2026-11-03': {spy: 500, s: {AAA: {p: 100, v: 'D'}, BBB: {p: 100, v: 'D'}}},
      '2026-11-21': {spy: 500, s: {AAA: {p: 110, v: 'D'}, BBB: {p: 96, v: 'D'}}},
    });
    expect(trackRecord(two, '2026-11-21').typicalReturn).toBeCloseTo(3, 6);
    expect(trackRecord(logOf({'2026-11-21': {spy: 690, s: {NVDA: {p: 125, v: 'D'}}}}), '2026-11-21').typicalReturn).toBeUndefined();
  });

  it('counts a DIP BUY first seen today but leaves it out of the averages (nothing has happened yet)', () => {
    const log = logOf({'2026-11-21': {spy: 690, s: {NVDA: {p: 125, v: 'D'}}}});
    const record = trackRecord(log, '2026-11-21');
    expect(record.opened).toBe(1);
    expect(record.averageReturn).toBeUndefined();
  });

  it('keeps following a stock after it stops being a DIP BUY', () => {
    const log = logOf({
      '2026-11-03': {spy: 500, s: {NVDA: {p: 100, v: 'D'}}},
      '2026-11-21': {spy: 500, s: {NVDA: {p: 130, v: 'W'}}},
    });
    expect(trackRecord(log, '2026-11-21').averageReturn).toBeCloseTo(30, 6);
  });
});

describe('snapshotOf', () => {
  it('records the price, the verdict as a letter, the growth inputs and the analyst figures of a DIP BUY', () => {
    const stock = makeStock({
      symbol: 'NVDA', price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
      closes: flatCloses(250, 80), medianTarget: 150, recommendationRate: 1.81, providerForwardEps: 9.31,
    });
    // EPS outlook: (1 next + 3 reported) / 4 trailing - 1 = 0%. Revenue: 120 / 100 - 1 = 20%.
    expect(snapshotOf(stock, NOW)).toEqual({p: 80, v: 'D', e: 0, r: 20, t: 150, c: 1.81, f: 9.31});
  });

  it('records the revenue consensus for the nearest forecast fiscal year, in $ millions', () => {
    const stock = makeStock({price: 80, annualRevenueForecast: {'2028': 6.1e9, '2027': 5.0e9}});
    expect(snapshotOf(stock, NOW)?.y).toBe(5000);
  });

  it('records "-" for a stock without a verdict, such as a fund', () => {
    expect(snapshotOf(makeStock({price: 14.01}), NOW)).toEqual({p: 14.01, v: '-'});
  });

  it('skips a stock whose price is missing', () => {
    expect(snapshotOf(makeStock({price: NaN}), NOW)).toBeUndefined();
  });
});

describe('saving and loading', () => {
  function memoryStorage() {
    const data: Record<string, string> = {};
    return {getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; }};
  }

  it('reads back what was saved', () => {
    const storage = memoryStorage();
    const log = record(emptyLog(), '2026-11-21', {spy: 689.81, s: {NVDA: {p: 125.53, v: 'D'}}});
    saveLog(log, storage);
    expect(loadLog(storage)).toEqual(log);
  });

  it('starts an empty log when the stored text is damaged', () => {
    const storage = memoryStorage();
    storage.setItem('watchlist.log.v1', '{not json');
    expect(loadLog(storage)).toEqual(emptyLog());
  });
});

// ---- The log kept in the database, which the daily recorder also writes. ----

describe('parseLog (what the file holds)', () => {
  it('accepts a log', () => {
    const log = logOf({'2026-11-21': {spy: 689.81, s: {NVDA: {p: 125.53, v: 'D'}}}});
    expect(parseLog(JSON.parse(JSON.stringify(log)))).toEqual(log);
  });

  it('rejects anything that is not a log, rather than merging it into one', () => {
    [undefined, null, 'text', [], {}, {v: 2, days: {}}, {v: 1}, {v: 1, days: []}].forEach(value =>
      expect(parseLog(value)).withContext(JSON.stringify(value)).toBeUndefined());
  });
});

describe('mergeLogs (the log in the database with the copy in this browser)', () => {
  const inFile = logOf({
    '2026-11-19': {spy: 700, s: {NVDA: {p: 140, v: 'W'}}},
    '2026-11-20': {spy: 695, s: {NVDA: {p: 131, v: 'D'}, AMD: {p: 430, v: 'D'}}},
  });
  const inBrowser = logOf({
    '2026-11-20': {spy: 694, s: {NVDA: {p: 130, v: 'D'}, MU: {p: 90, v: 'P'}}},
    '2026-11-21': {spy: 689.81, s: {NVDA: {p: 125.53, v: 'D'}}},
  });
  const merged = mergeLogs(inFile, inBrowser);

  it('has every day either copy has', () => {
    expect(Object.keys(merged.days).sort()).toEqual(['2026-11-19', '2026-11-20', '2026-11-21']);
    expect(merged.days['2026-11-19']).toEqual(inFile.days['2026-11-19']);
    expect(merged.days['2026-11-21']).toEqual(inBrowser.days['2026-11-21']);
  });

  it('has every stock either copy recorded on a day both have', () => {
    expect(Object.keys(merged.days['2026-11-20'].s).sort()).toEqual(['AMD', 'MU', 'NVDA']);
  });

  it('keeps the reading in the database where both have one: the database is the record', () => {
    expect(merged.days['2026-11-20'].s['NVDA'].p).toBe(131);
    expect(merged.days['2026-11-20'].spy).toBe(695);
  });

  it('changes neither copy', () => {
    expect(Object.keys(inFile.days)).toEqual(['2026-11-19', '2026-11-20']);
    expect(Object.keys(inBrowser.days['2026-11-20'].s).sort()).toEqual(['MU', 'NVDA']);
  });

  it('keeps only the latest days up to the limit', () => {
    expect(Object.keys(mergeLogs(inFile, inBrowser, 2).days).sort()).toEqual(['2026-11-20', '2026-11-21']);
  });
});

describe('missingIn (what this browser recorded that the file does not have yet)', () => {
  const inBrowser = logOf({
    '2026-11-20': {spy: 694, s: {NVDA: {p: 130, v: 'D'}, MU: {p: 90, v: 'P'}}},
    '2026-11-21': {spy: 689.81, s: {NVDA: {p: 125.53, v: 'D'}}},
  });

  it('is everything when there is no file yet', () => {
    expect(missingIn(undefined, inBrowser)).toEqual(inBrowser.days);
  });

  it('is the days, the stocks and the market readings the file lacks, and nothing it already has', () => {
    const inFile = logOf({'2026-11-20': {s: {NVDA: {p: 131, v: 'D'}}}});
    expect(missingIn(inFile, inBrowser)).toEqual({
      '2026-11-20': {spy: 694, s: {MU: {p: 90, v: 'P'}}},
      '2026-11-21': {spy: 689.81, s: {NVDA: {p: 125.53, v: 'D'}}},
    });
  });

  it('is nothing when the file has it all', () => {
    expect(missingIn(inBrowser, inBrowser)).toBeUndefined();
    expect(missingIn(inBrowser, emptyLog())).toBeUndefined();
  });
});

describe('dayChange and trimChange (what is sent to the file)', () => {
  it("sends one day's readings as a change to merge, so the rest of the file is untouched", () => {
    expect(dayChange('2026-11-21', {spy: 689.81, s: {NVDA: {p: 125.53, v: 'D'}}}))
      .toEqual({v: 1, days: {'2026-11-21': {spy: 689.81, s: {NVDA: {p: 125.53, v: 'D'}}}}});
  });

  it('leaves out market readings that are missing, so they do not wipe the ones in the database', () => {
    const change = dayChange('2026-11-21', {spy: undefined, vix: 31.2, s: {}});
    expect(JSON.parse(JSON.stringify(change))).toEqual({v: 1, days: {'2026-11-21': {vix: 31.2, s: {}}}});
  });

  it('asks the file to drop the oldest days beyond the limit', () => {
    const log = logOf({'2026-11-19': {s: {}}, '2026-11-20': {s: {}}, '2026-11-21': {s: {}}});
    expect(trimChange(log, 2)).toEqual({days: {'2026-11-19': null}});
    expect(trimChange(log, 3)).toBeUndefined();
  });
});
