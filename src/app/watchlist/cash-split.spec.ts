import {cashSplit, Picked} from "./cash-split";
import {additions, sizeOfNew, SizingInput} from "./recommendations";
import {TestedCases} from "./sizing";
import {FIGURES_2026_11_21 as F} from "./testing/figures";

/** What the tests found for the three kinds of stock, as recorded on 2026-11-21. */
const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
const MIDDLE: TestedCases = {group: 'middle', lossPercent: 31, typicalPercent: -0.1, gainPercent: 56};

/**
 * A made-up portfolio worth $10,000: these holdings, and the rest of the $10,000 in cash. The limit is 100% unless
 * given, so that no size is capped.
 */
function worth10000(holdings: SizingInput['holdings'], limitPercent = 100): SizingInput {
  return {portfolioValue: 10_000, limitPercent, holdings};
}

const cashOf = (input: SizingInput) => input.portfolioValue - input.holdings.reduce((sum, it) => sum + it.value, 0);
/** The split of all the portfolio's cash between these stocks. */
const split = (input: SizingInput, picked: Picked[]) => cashSplit(input, cashOf(input), picked, F);
const stock = (symbol: string, cases: TestedCases = MIDDLE): Picked => ({symbol, cases});
const part = (result: ReturnType<typeof cashSplit>, symbol: string) => result.parts.find(it => it.symbol === symbol)!;
const sum = (amounts: number[]) => amounts.reduce((total, it) => total + it, 0);

describe('cashSplit (the portfolio\'s cash split between the stocks ticked in "Could add")', () => {
  // The two anchors: with money enough, the split says what the tables already say.
  it('gives one new stock its size from the "Size" column when the cash is enough', () => {
    // Two stocks in between ($3,000 each) and $4,000 in cash; a volatile one joins: 31 / 113 of the portfolio.
    const input = worth10000([{symbol: 'AAA', value: 3000, cases: MIDDLE}, {symbol: 'BBB', value: 3000, cases: MIDDLE}]);
    const result = split(input, [stock('CCC', VOLATILE)]);
    const size = sizeOfNew(VOLATILE, input, F);
    expect(result.parts.length).toBe(1);
    expect(result.parts[0].dollars).toBeCloseTo(size.dollars, 6);
    expect(result.parts[0].dollars).withContext('31 / 113 of $10,000').toBeCloseTo(2743.36, 2);
    expect(result.parts[0]).toEqual(jasmine.objectContaining({symbol: 'CCC', owned: false, bound: 'share'}));
    expect(result.parts[0].gap).toBeCloseTo(size.dollars, 6);
    expect(result.parts[0].loss).withContext('the bad case on what is bought').toBeCloseTo(size.loss, 6);
    expect(result.parts[0].gain).toBeCloseTo(size.gain, 6);
    expect([result.cash, result.placed, result.left].map(it => Math.round(it * 100) / 100)).toEqual([4000, 2743.36, 1256.64]);
  });

  it('gives a stock that is owned what the "Plan" column offers to add, when the cash is enough', () => {
    // Three in between: a third each is $3,333. AAA is $2,333 short of it, CCC $533; BBB is close enough to be offered nothing.
    const input = worth10000([
      {symbol: 'AAA', value: 1000, cases: MIDDLE}, {symbol: 'BBB', value: 3200, cases: MIDDLE}, {symbol: 'CCC', value: 2800, cases: MIDDLE},
    ]);
    const offered = additions(input, F);
    expect(offered.map(it => it.symbol)).toEqual(['AAA', 'CCC']);
    const result = split(input, [stock('AAA'), stock('CCC')]);
    offered.forEach(add => {
      expect(part(result, add.symbol).dollars).withContext(add.symbol).toBeCloseTo(add.dollars, 6);
      expect(part(result, add.symbol)).toEqual(jasmine.objectContaining({owned: true, bound: 'share'}));
    });
    expect(result.placed).toBeCloseTo(2866.67, 2);
    expect(result.left).toBeCloseTo(133.33, 2);
    expect([result.stocksBefore, result.stocksAfter]).withContext('nothing new joins').toEqual([3, 3]);
  });

  // The user's question: the size of each when one is added, when a few are picked, when all are bought together.
  it('makes each size smaller as more stocks are ticked: they are sized for the portfolio they would make together', () => {
    // Three stocks in between at $1,000 each and $7,000 in cash; the three that could be added are in between too.
    const input = worth10000([
      {symbol: 'AAA', value: 1000, cases: MIDDLE}, {symbol: 'BBB', value: 1000, cases: MIDDLE}, {symbol: 'CCC', value: 1000, cases: MIDDLE},
    ]);
    const each = (...symbols: string[]) => split(input, symbols.map(it => stock(it))).parts.map(it => Math.round(it.dollars * 100) / 100);
    expect(each('DDD')).withContext('one of four').toEqual([2500]);
    expect(each('DDD', 'EEE')).withContext('one of five').toEqual([2000, 2000]);
    expect(each('DDD', 'EEE', 'FFF')).withContext('one of six').toEqual([1666.67, 1666.67, 1666.67]);
  });

  it('splits what there is in proportion to what each is short of, when the cash is not enough', () => {
    // $1,000 in cash. One in between and one volatile join two in between: they are short of $2,662 and $2,013.
    const input = worth10000([{symbol: 'AAA', value: 5000, cases: MIDDLE}, {symbol: 'BBB', value: 4000, cases: MIDDLE}]);
    const result = split(input, [stock('CCC', MIDDLE), stock('DDD', VOLATILE)]);
    const [calmer, jumpier] = result.parts;
    expect([calmer.gap, jumpier.gap].map(it => Math.round(it * 100) / 100)).toEqual([2662.34, 2012.99]);
    expect(sum(result.parts.map(it => it.dollars))).withContext('all of the cash, and no more').toBeCloseTo(1000, 6);
    expect(calmer.dollars / calmer.gap).withContext('each the same part of its gap').toBeCloseTo(jumpier.dollars / jumpier.gap, 10);
    expect([calmer.dollars, jumpier.dollars].map(it => Math.round(it * 100) / 100)).toEqual([569.44, 430.56]);
    expect([calmer.bound, jumpier.bound]).toEqual(['cash', 'cash']);
    expect(calmer.loss).withContext('new stocks still share the risk equally: a bad half-year costs the same on each')
      .toBeCloseTo(jumpier.loss, 6);
    expect([result.gap, result.placed, result.left].map(it => Math.round(it * 100) / 100)).toEqual([4675.32, 1000, 0]);
  });

  it('uses the cash up exactly when every stock is ticked and none is above its share', () => {
    // $2,000 and $1,000 held, $7,000 in cash; with two new ones each of the four is to be $2,500.
    const input = worth10000([{symbol: 'AAA', value: 2000, cases: MIDDLE}, {symbol: 'BBB', value: 1000, cases: MIDDLE}]);
    const result = split(input, [stock('AAA'), stock('BBB'), stock('CCC'), stock('DDD')]);
    expect(result.parts.map(it => Math.round(it.dollars * 100) / 100)).toEqual([500, 1500, 2500, 2500]);
    expect(result.parts.map(it => it.bound)).toEqual(['share', 'share', 'share', 'share']);
    expect(result.placed).toBeCloseTo(7000, 6);
    expect(result.left).toBeCloseTo(0, 6);
  });

  it('gives nothing to a stock that is owned once the new ones make its share smaller than what is held', () => {
    // AAA holds $2,600. Among three a third is $3,333: it is $733 short. With a fourth stock a quarter is $2,500: it is not.
    const input = worth10000([
      {symbol: 'AAA', value: 2600, cases: MIDDLE}, {symbol: 'BBB', value: 3300, cases: MIDDLE}, {symbol: 'CCC', value: 3300, cases: MIDDLE},
    ]);
    const alone = split(input, [stock('AAA')]);
    expect(alone.parts[0].dollars).toBeCloseTo(733.33, 2);
    expect(alone.parts[0].bound).toBe('share');
    const withNew = split(input, [stock('AAA'), stock('DDD')]);
    expect(part(withNew, 'AAA')).toEqual({symbol: 'AAA', owned: true, gap: 0, dollars: 0, bound: 'none', loss: 0, gain: 0});
    expect(part(withNew, 'DDD').dollars).withContext('the new one gets all of the $800 in cash').toBeCloseTo(800, 6);
    expect(part(withNew, 'DDD').bound).toBe('cash');
  });

  it('counts what is under half a cent as no gap', () => {
    const input = worth10000([
      {symbol: 'AAA', value: 3333.33, cases: MIDDLE}, {symbol: 'BBB', value: 3333.33, cases: MIDDLE}, {symbol: 'CCC', value: 3333.33, cases: MIDDLE},
    ]);
    expect(split(input, [stock('AAA')]).parts[0]).toEqual(jasmine.objectContaining({gap: 0, dollars: 0, bound: 'none'}));
  });

  it('never goes above what fits the limit, for a new stock and for one that is owned, and says the limit bounded it', () => {
    // A limit of 8%: $800 lost on one stock at most. A volatile stock (bad case 41%) may then be $1,951, where an
    // equal share of the risk among these four would be 31 / 144 of the portfolio, $2,153.
    const input = worth10000([
      {symbol: 'AAA', value: 2500, cases: MIDDLE}, {symbol: 'BBB', value: 2000, cases: MIDDLE}, {symbol: 'CCC', value: 1500, cases: VOLATILE},
    ], 8);
    const result = split(input, [stock('CCC', VOLATILE), stock('DDD', VOLATILE)]);
    const owned = part(result, 'CCC'), fresh = part(result, 'DDD');
    expect(fresh.dollars).toBeCloseTo(1951.22, 2);
    expect(owned.dollars).withContext('up to the same $1,951 in all').toBeCloseTo(451.22, 2);
    expect([owned.bound, fresh.bound]).toEqual(['limit', 'limit']);
    expect(fresh.loss).withContext('its bad half-year is the limit').toBeCloseTo(800, 6);
    expect((1500 + owned.dollars) * 0.41).withContext('and so is the bad half-year of the whole holding').toBeCloseTo(800, 6);
    expect(result.left).withContext('the rest of the $4,000 stays cash').toBeCloseTo(1597.56, 2);
  });

  it('counts a holding the tests do not cover as a stock in between, like the "Size" column does', () => {
    const input = worth10000([{symbol: 'FUND', value: 4000}, {symbol: 'AAA', value: 3000, cases: MIDDLE}]);
    const result = split(input, [stock('BBB')]);
    expect(result.parts[0].gap).withContext('a third of the portfolio').toBeCloseTo(sizeOfNew(MIDDLE, input, F).dollars, 6);
    expect(result.parts[0].dollars).withContext('all of the $3,000 in cash, which is less').toBeCloseTo(3000, 6);
    expect(result.parts[0].bound).toBe('cash');
  });

  it('splits an empty portfolio as if it held three stocks, as the tested plan did', () => {
    const empty = worth10000([]);
    expect(split(empty, [stock('AAA')]).parts[0].dollars).toBeCloseTo(3333.33, 2);
    expect(split(empty, [stock('AAA')]).left).withContext('the rest waits for the others').toBeCloseTo(6666.67, 2);
    expect(split(empty, [stock('AAA'), stock('BBB'), stock('CCC'), stock('DDD')]).parts.map(it => Math.round(it.dollars))).toEqual([2500, 2500, 2500, 2500]);
  });

  it('places nothing without cash, and never more cash than the portfolio has outside its holdings', () => {
    const invested = worth10000([{symbol: 'AAA', value: 6000, cases: MIDDLE}, {symbol: 'BBB', value: 4000, cases: MIDDLE}]);
    const none = cashSplit(invested, 0, [stock('CCC')], F);
    expect(none.parts[0].gap).toBeCloseTo(3333.33, 2);
    expect(none.parts[0]).toEqual(jasmine.objectContaining({dollars: 0, bound: 'cash', loss: 0, gain: 0}));
    expect([none.cash, none.placed, none.left, none.stocksAfter]).withContext('a stock that gets nothing does not join').toEqual([0, 0, 0, 2]);
    expect(cashSplit(invested, -50, [stock('CCC')], F).cash).toBe(0);
    expect(cashSplit(invested, NaN, [stock('CCC')], F).cash).toBe(0);

    const half = worth10000([{symbol: 'AAA', value: 6000, cases: MIDDLE}]);
    expect(cashSplit(half, 9999, [stock('BBB')], F).cash).withContext('$10,000 less the $6,000 held').toBe(4000);
    expect(cashSplit(half, 1500, [stock('BBB')], F).cash).withContext('less than there is can be split').toBe(1500);
  });

  it('has nothing to split while no stock is ticked', () => {
    const input = worth10000([{symbol: 'AAA', value: 3000, cases: MIDDLE}, {symbol: 'FUND', value: 2000}]);
    expect(split(input, [])).toEqual({
      parts: [], cash: 5000, gap: 0, placed: 0, left: 5000,
      stocksBefore: 2, stocksAfter: 2, togetherLossBefore: 930, togetherLossAfter: 930,
    });
  });

  it('keeps the order the stocks were given in, and says which are owned', () => {
    const input = worth10000([{symbol: 'AAA', value: 2000, cases: MIDDLE}, {symbol: 'BBB', value: 1000, cases: MIDDLE}]);
    const result = split(input, [stock('ZZZ'), stock('BBB'), stock('CCC')]);
    expect(result.parts.map(it => [it.symbol, it.owned])).toEqual([['ZZZ', false], ['BBB', true], ['CCC', false]]);
  });

  // Both directions of the risk, as facts: more stocks, and more dollars that a bad half-year can take.
  it('says how many stocks the portfolio would hold, and what the bad cases add up to before and after', () => {
    // $3,000 held in two stocks in between and a fund the tests do not cover; $5,000 in cash for two new ones.
    const input = worth10000([{symbol: 'AAA', value: 2000, cases: MIDDLE}, {symbol: 'BBB', value: 1000, cases: MIDDLE}, {symbol: 'FUND', value: 2000}]);
    const result = split(input, [stock('CCC'), stock('DDD', VOLATILE)]);
    expect([result.stocksBefore, result.stocksAfter]).toEqual([3, 5]);
    expect(result.togetherLossBefore).withContext('31% of the $3,000 the tests cover; the fund has no bad case').toBeCloseTo(930, 6);
    expect(result.togetherLossAfter).toBeCloseTo(930 + sum(result.parts.map(it => it.loss)), 6);
    expect(result.togetherLossAfter).withContext('cash cannot fall, stock can: it goes up').toBeGreaterThan(result.togetherLossBefore);
  });
});
