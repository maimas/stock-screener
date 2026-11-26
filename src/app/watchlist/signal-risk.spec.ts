import {computeSignal, signalSortValue, TESTED_DEPTH_P95, TESTED_VOL_P95} from "./signal";
import {flatCloses, makeStock, NOW, reportedQuarters, weeklyPattern} from "./testing/fixtures";

/** A growing company `below` % under its 52-week high whose price history follows the given weekly returns. */
function growing(below: number, weeklyReturns?: number[], symbol = 'TEST') {
  return makeStock({
    symbol, price: 100 - below, high52: 100,
    quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
    closes: weeklyReturns ? weeklyPattern(250, weeklyReturns) : flatCloses(250, 100 - below),
  });
}

const SWINGS_69 = [0.10, -1 / 11];        // about 68.8% a year
const SWINGS_40 = [0.057, -0.0539];       // about 40.0% a year

/**
 * Weekly returns that go up and straight back, swinging a little more than `percent` a year. The 95th percentiles
 * come from the backtests and move when they are re-run, so the rare cases are built from them, not from a number
 * written here.
 */
function swingsOver(percent: number): number[] {
  let up = 0.01;
  while ((up + up / (1 + up)) / 2 * Math.sqrt(52) * 100 < percent + 3) {
    up += 0.005;
  }
  return [up, -up / (1 + up)];
}

describe('Volatility tier of a DIP BUY (validated on the fresh universe: 45%+ a year vs under 35%)', () => {
  it('is "high" for a stock swinging about 69% a year', () => {
    expect(computeSignal(growing(20, SWINGS_69), NOW)?.volatilityTier).toBe('high');
  });

  it('is "low" for a stock that barely moves', () => {
    expect(computeSignal(growing(20), NOW)?.volatilityTier).toBe('low');
  });

  it('is not set between the two validated groups (about 40% a year)', () => {
    const signal = computeSignal(growing(20, SWINGS_40), NOW)!;
    expect(signal.volatility).toBeCloseTo(40.0, 0);
    expect(signal.volatilityTier).toBeUndefined();
  });

  it('is not set for a WATCH: the risk numbers were measured on DIP BUYs only', () => {
    const signal = computeSignal(growing(5, SWINGS_69), NOW)!;
    expect(signal.verdict).toBe('WATCH');
    expect(signal.volatilityTier).toBeUndefined();
  });
});

describe('Cases that were rare in the tests (beyond 19 in 20 of the tested DIP BUYs)', () => {
  it('flags a DIP BUY further below its high than 19 in 20 of the tested ones', () => {
    expect(computeSignal(growing(TESTED_DEPTH_P95 + 3), NOW)?.rareInTests).toMatch(/below/i);
  });

  it('flags a DIP BUY that swings more than 19 in 20 of the tested ones', () => {
    const signal = computeSignal(growing(20, swingsOver(TESTED_VOL_P95)), NOW)!;
    expect(signal.volatility).toBeGreaterThan(TESTED_VOL_P95);
    expect(signal.rareInTests).toMatch(/volatil/i);
  });

  it('does not flag a DIP BUY just inside both: the flag starts at the 95th percentiles', () => {
    expect(TESTED_DEPTH_P95).toBeGreaterThan(40);
    expect(TESTED_VOL_P95).toBeGreaterThan(50);
    expect(computeSignal(growing(TESTED_DEPTH_P95 - 3, SWINGS_40), NOW)?.rareInTests).toBeUndefined();
  });

  it('does not flag an ordinary DIP BUY: 30% below its high, about 40% a year', () => {
    expect(computeSignal(growing(30, SWINGS_40), NOW)?.rareInTests).toBeUndefined();
  });

  it('does not flag a PASS, however deep', () => {
    const stock = makeStock({
      price: 30, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 100}), closes: flatCloses(250, 30),
    });
    const signal = computeSignal(stock, NOW)!;
    expect(signal.verdict).toBe('PASS');
    expect(signal.rareInTests).toBeUndefined();
  });
});

describe('signalSortValue (Signal column, sorted descending by default)', () => {
  const value = (below: number, symbol: string) => signalSortValue(computeSignal(growing(below, undefined, symbol), NOW), symbol)!;

  it('lists DIP BUYs A to Z rather than deepest first', () => {
    const rows = [{s: 'NVDA', v: value(48, 'NVDA')}, {s: 'AMD', v: value(36, 'AMD')}, {s: 'NBIS', v: value(73, 'NBIS')}];
    expect(rows.sort((a, b) => b.v - a.v).map(r => r.s)).toEqual(['AMD', 'NBIS', 'NVDA']);
  });

  it('keeps every DIP BUY above every WATCH', () => {
    expect(value(20, 'ZS')).toBeGreaterThan(value(5, 'AAPL'));
  });

  it('is undefined without a verdict, so those rows stay grouped together', () => {
    expect(signalSortValue(null, 'VGT')).toBeUndefined();
  });
});
