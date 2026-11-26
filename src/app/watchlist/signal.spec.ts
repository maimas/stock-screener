import {computeSignal, growthChipText, growthOutlook, whyNoVerdict} from "./signal";
import {flatCloses, makeStock, NOW, reportedQuarters} from "./testing/fixtures";

/** Growing by revenue (+20% vs a year ago) and 20% below its high: a DIP BUY when the history is long enough. */
function growingDip(quarters: number, bars: number) {
  return makeStock({
    price: 80, high52: 100,
    quarters: reportedQuarters(quarters, {baseRevenue: 100, latestRevenue: 120}),
    closes: flatCloses(bars, 80),
  });
}

describe('Signal verdict: stays inside what the backtests covered', () => {
  it('says DIP BUY for a growing company 20% below its high with 8 reported quarters and a year of prices', () => {
    expect(computeSignal(growingDip(8, 250), NOW)?.verdict).toBe('DIP BUY');
  });

  it('gives no verdict with only 7 reported quarters (the backtests required 8)', () => {
    expect(computeSignal(growingDip(7, 250), NOW)).toBeNull();
  });

  it('gives no verdict when the stock has traded for less than a year', () => {
    expect(computeSignal(growingDip(8, 120), NOW)).toBeNull();
  });

  it('gives no verdict when one of the last 8 quarters has no EPS figure', () => {
    const quarters = reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120});
    quarters[3].eps = null;
    const stock = makeStock({price: 80, high52: 100, quarters, closes: flatCloses(250, 80)});
    expect(computeSignal(stock, NOW)).toBeNull();
  });

  it("does not turn the data provider's growth figure into a verdict for a new listing", () => {
    // ANT on 2026-11-21: one reported quarter, two days of prices, provider revenue growth +1126.9%.
    const stock = makeStock({
      price: 88.91, high52: 115.10, quarters: reportedQuarters(1), closes: flatCloses(2, 88.91),
      providerRevenueGrowth: 1126.9,
    });
    expect(computeSignal(stock, NOW)).toBeNull();
  });
});

describe('the verdict in everyday words', () => {
  // growingDip: profit per share flat (1 a quarter, 1 expected next), sales +20% on a year ago, 20% below its high.
  it('says how the business is growing without the trade\'s abbreviations', () => {
    expect(computeSignal(growingDip(8, 250), NOW)?.growthText).toBe('expected profit per share 0.0%, sales +20.0% on a year ago');
  });

  it('measures the drop from the highest price of the past year, and says so', () => {
    expect(computeSignal(growingDip(8, 250), NOW)?.headline)
      .toMatch(/^A growing company, 20\.0% below its highest price of the past year\. Over all \d+ test stocks, stocks like this gained /);
  });
});

describe('growthChipText (the growth number a stock is marked on, in a word)', () => {
  const growth = (epsOutlook: number | undefined, revenueGrowth: number | undefined) =>
    ({epsOutlook, revenueGrowth, growing: true, shrinking: false, tested: true});

  it('names the profit when that passes its test, and the sales otherwise', () => {
    expect(growthChipText(growth(21.04, 44.7))).toBe('profit +21%');
    expect(growthChipText(growth(6.7, 27.1))).toBe('sales +27%');
    expect(growthChipText(growth(undefined, 571.3))).toBe('sales +571%');
    expect(growthChipText(growth(-4.6, 29.6))).toBe('sales +30%');
  });

  it('says nothing without growth figures', () => {
    expect(growthChipText(undefined)).toBe('');
    expect(growthChipText(growth(undefined, undefined))).toBe('');
  });
});

describe('Analyst context', () => {
  it('says when the analyst figures were last updated, since targets lag a fast fall', () => {
    const stock = makeStock({
      price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
      medianTarget: 150, estimatesUpdated: '2026-11-03T12:00:00Z',
    });
    const upside = computeSignal(stock, NOW)!.factors.find(it => it.reason.startsWith("Analysts' middle price target"))!;
    expect(upside.reason).toMatch(/last updated .*3/);
  });

  it('says nothing about the update date when the provider gives none', () => {
    const stock = makeStock({
      price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
      medianTarget: 150,
    });
    const upside = computeSignal(stock, NOW)!.factors.find(it => it.reason.startsWith("Analysts' middle price target"))!;
    expect(upside.reason).not.toMatch(/last updated/);
  });
});

// The lines under "Context, not part of the mark" are read by someone deciding about one stock who does not know
// the trade's words. Each says its figure in everyday words (the trade's word once, in brackets, where there is
// one) and says plainly that it was not tested, or that it made no difference when it was.
describe('What is shown as context, in everyday words', () => {
  const dipped = {
    price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
  };

  it('says what analysts expect, and that it cannot be tested', () => {
    const signal = computeSignal(makeStock({...dipped, medianTarget: 120, recommendationRate: 1.5}), NOW)!;
    expect(signal.factors.map(it => it.reason)).toEqual([
      "Analysts' middle price target is 120.00 (+50.0% from here; cannot be tested: no history of targets)",
      'Analysts rate it 1.50 on average, where 1 is the strongest "buy" (10 analysts; cannot be tested)',
    ]);
  });

  it('says what the price is against the profit, what a loss is and what high debt is, and that none made a difference in tests', () => {
    const stock = makeStock({...dipped, providerEpsTtm: -1.25});
    Object.assign(stock.quote, {peRatio: 40});
    Object.assign(stock.equity.analysis.companyMetrics, {pE5YearLowRatio: 10, pE5YearHighRatio: 30, debtEquityRatio: 3});
    expect(computeSignal(stock, NOW)!.factors.map(it => it.reason)).toEqual([
      'The price is 40.0 times the yearly profit per share (P/E): above its range of the past 5 years, 10.0–30.0 (made no difference in tests)',
      'Not profitable: profit per share over the past year -1.25 (made no difference in tests)',
      'High debt: it owes 3.00 times what belongs to its owners (debt/equity; made no difference in tests)',
    ]);
  });

  it('says where the price stands against its average of the past 200 days, and that this did not help in tests', () => {
    expect(computeSignal(makeStock(dipped), NOW)!.notes[0]).toBe(
      'The price is 0.0% from its average of the past 200 days (80.00), and that average is rising; ' +
      'context only: in tests on stocks it was not found on, this did not help');
  });

  it("uses none of the trade's shorthand in those lines", () => {
    const stock = makeStock({...dipped, medianTarget: 120, recommendationRate: 1.5, providerEpsTtm: -1.25});
    Object.assign(stock.quote, {peRatio: 40});
    Object.assign(stock.equity.analysis.companyMetrics, {pE5YearLowRatio: 10, pE5YearHighRatio: 30, debtEquityRatio: 3});
    const signal = computeSignal(stock, NOW)!;
    const lines = [...signal.factors.map(it => it.reason), ...signal.notes].join(' ');
    expect(lines).not.toMatch(/untestable|backtest|out of sample|underwater|consensus|upside|edge/i);
  });
});

describe('growthOutlook', () => {
  it('still reports the growth of a too-young company, marked as untested', () => {
    const stock = makeStock({quarters: reportedQuarters(1), closes: flatCloses(2), providerRevenueGrowth: 1126.9});
    const growth = growthOutlook(stock, NOW);
    expect(growth?.revenueGrowth).toBe(1126.9);
    expect(growth?.tested).toBe(false);
  });

  it('marks growth from 8 full quarters as tested', () => {
    expect(growthOutlook(growingDip(8, 250), NOW)?.tested).toBe(true);
  });

  it('computes revenue growth as the latest quarter against the same quarter a year earlier', () => {
    expect(growthOutlook(growingDip(8, 250), NOW)?.revenueGrowth).toBeCloseTo(20, 6);
  });
});

describe('whyNoVerdict', () => {
  it('says "too-new" for a company with some but fewer than 8 reported quarters', () => {
    expect(whyNoVerdict(growingDip(3, 250), NOW)).toBe('too-new');
  });

  it('says "too-new" for a long-reporting company with under a year of prices', () => {
    expect(whyNoVerdict(growingDip(8, 30), NOW)).toBe('too-new');
  });

  it('says "no-data" when there is no earnings history at all', () => {
    expect(whyNoVerdict(makeStock({closes: flatCloses(250)}), NOW)).toBe('no-data');
  });
});

describe('Signal rank (default sort)', () => {
  const dip = (below: number) => makeStock({
    price: 100 - below, high52: 100,
    quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 100 - below),
  });

  it('does not rank a deeper DIP BUY above a shallower one (no ranking has passed a test)', () => {
    expect(computeSignal(dip(60), NOW)?.rank).toBe(computeSignal(dip(20), NOW)?.rank);
  });

  it('ranks DIP BUY above WATCH above PASS', () => {
    const buy = computeSignal(dip(20), NOW)!;
    const watch = computeSignal(dip(5), NOW)!;
    const pass = computeSignal(makeStock({
      price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 100}), closes: flatCloses(250, 80),
    }), NOW)!;
    expect([buy.verdict, watch.verdict, pass.verdict]).toEqual(['DIP BUY', 'WATCH', 'PASS']);
    expect(buy.rank).toBeGreaterThan(watch.rank);
    expect(watch.rank).toBeGreaterThan(pass.rank);
  });
});
