import {closeOnOrBefore, volatilityFor} from "./market-math";
import {chartOf, flatCloses, makeStock, weeklyPattern} from "./testing/fixtures";

describe('closeOnOrBefore', () => {
  // Three daily bars: Nov 18 = 700, Nov 19 = 710, Nov 20 = 690.
  const series = chartOf([700, 710, 690], {endDay: '2026-11-20T05:00:00Z'});

  it('gives the close of that trading day', () => {
    expect(closeOnOrBefore(series, '2026-11-19')).toBe(710);
  });

  it('gives the last close before a day without trading (a weekend)', () => {
    expect(closeOnOrBefore(series, '2026-11-21')).toBe(690);
  });

  it('is unknown for a day before the history starts', () => {
    expect(closeOnOrBefore(series, '2026-11-17')).toBeUndefined();
  });

  it('is unknown without a price history', () => {
    expect(closeOnOrBefore(undefined, '2026-11-19')).toBeUndefined();
  });
});

describe('volatilityFor', () => {
  it('annualises the spread of weekly returns (weeks alternating +10% and back down: about 68.8% a year)', () => {
    // 49 weekly returns: 25 of +10% and 24 of -1/11. Population standard deviation 9.5435%, times sqrt(52) = 68.8%.
    const stock = makeStock({closes: weeklyPattern(250, [0.10, -1 / 11])});
    expect(volatilityFor(stock)).toBeCloseTo(68.8, 1);
  });

  it('is zero for a price that never moves', () => {
    expect(volatilityFor(makeStock({closes: flatCloses(250)}))).toBe(0);
  });

  it('is unknown with less than about 40 weeks of prices', () => {
    expect(volatilityFor(makeStock({closes: weeklyPattern(150, [0.10, -1 / 11])}))).toBeNull();
  });

  it('is unknown when the price history did not load', () => {
    expect(volatilityFor(makeStock())).toBeNull();
  });
});
