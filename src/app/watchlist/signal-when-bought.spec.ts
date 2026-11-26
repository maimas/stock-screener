import {wasDipBuy} from "./signal";
import {flatCloses, makeStock, reportedQuarters} from "./testing/fixtures";

/**
 * The plan covers a holding for 26 weeks if it was a DIP BUY on the day it was bought. These tests fix how that is
 * judged afterwards: with the growth known on that day and the price paid against the high of the year before.
 * In the fixtures the last quarter was reported on 2026-10-22 and the price history ends on 2026-11-20.
 */
const AFTER_LAST_REPORT = '2026-11-10';
const BEFORE_LAST_REPORT = '2026-10-10';

/** Revenue 20% above a year ago: growing. */
const growing = () => reportedQuarters(9, {baseRevenue: 100, latestRevenue: 120});
const notGrowing = () => reportedQuarters(9, {baseRevenue: 100, latestRevenue: 100});
/** Three months before the prices end: only about 200 of the 300 days of prices are from before it. */
const THREE_MONTHS_AGO = '2026-08-20';
/** Growing already then: revenue 20% above a year ago in the quarter reported in July too. */
const growingSinceJuly = () => reportedQuarters(10).map((q, i) => i >= 8 ? {...q, revenue: 120} : q);

describe('wasDipBuy (was it a DIP BUY on the day it was bought, at the price paid?)', () => {
  it('says yes for a growing company bought 20% below the high of the year before', () => {
    const stock = makeStock({quarters: growing(), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 80)).toBe(true);
  });

  it('says no for a growing company bought at its high, when the prices go back a full year before the purchase', () => {
    const stock = makeStock({quarters: growing(), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 100)).toBe(false);
  });

  it('counts a dip of exactly the threshold, and judges the price paid rather than that day\'s close', () => {
    const stock = makeStock({quarters: growing(), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 85)).toBe(true);
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 86)).toBe(false);
  });

  it('cannot tell when it was not a dip against the prices in view but they do not go back a year: an older high may be out of sight', () => {
    const stock = makeStock({quarters: growingSinceJuly(), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, THREE_MONTHS_AGO, 100)).toBeUndefined();
  });

  it('still says yes with a shorter view when the price paid was a dip against it: an older, higher high only deepens the dip', () => {
    const stock = makeStock({quarters: growingSinceJuly(), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, THREE_MONTHS_AGO, 80)).toBe(true);
  });

  it('ignores prices after the purchase: a later high does not turn the purchase into a dip', () => {
    // 100 for 290 days, then 150 for the last 10 days (from 2026-11-11 on).
    const stock = makeStock({quarters: growing(), closes: [...flatCloses(290, 100), ...flatCloses(10, 150)]});
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 100)).toBe(false);
  });

  it('says no for a company that was not growing, however deep the dip', () => {
    const stock = makeStock({quarters: notGrowing(), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 60)).toBe(false);
  });

  it('judges growth by what had been reported on that day: a quarter reported later does not count', () => {
    // Only the latest quarter (reported 2026-10-22) shows the growth.
    const stock = makeStock({quarters: growing(), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 80)).toBe(true);
    expect(wasDipBuy(stock, BEFORE_LAST_REPORT, 80)).toBe(false);
  });

  it('uses the earnings forecast for the quarter that was next on that day, not today\'s', () => {
    // Earnings of 1 a quarter. Before the last report the quarter then awaited was forecast at 1.5 (an outlook of
    // +12.5%: growing); the quarter awaited today is forecast at 1 (flat).
    const quarters = notGrowing().map((q, i, all) => i === all.length - 1 ? {...q, eps: 1.5} : q);
    const stock = makeStock({quarters, nextEps: 1, closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, BEFORE_LAST_REPORT, 80)).toBe(true);
  });

  it('cannot tell without eight reported quarters by that day: the tests did not cover so young a company', () => {
    const stock = makeStock({quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 80)).toBe(true);
    expect(wasDipBuy(stock, BEFORE_LAST_REPORT, 80)).toBeUndefined();
  });

  it('cannot tell without prices on or before that day', () => {
    expect(wasDipBuy(makeStock({quarters: growing()}), AFTER_LAST_REPORT, 80)).toBeUndefined();
    expect(wasDipBuy(makeStock({quarters: growing(), closes: flatCloses(30, 100)}), '2026-01-15', 80)).toBeUndefined();
  });

  it('cannot tell for a fund, or from a date or price that is not one', () => {
    expect(wasDipBuy(makeStock({closes: flatCloses(300, 100)}), AFTER_LAST_REPORT, 80)).toBeUndefined();
    const stock = makeStock({quarters: growing(), closes: flatCloses(300, 100)});
    expect(wasDipBuy(stock, 'last week', 80)).toBeUndefined();
    expect(wasDipBuy(stock, AFTER_LAST_REPORT, 0)).toBeUndefined();
  });
});
