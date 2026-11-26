import {concentrationOf, movingTogetherText, oneBetOf, oneBetText, tiedTo} from "./concentration";
import {chartOf, makeStock} from "./testing/fixtures";

/** 80 daily closes built from a repeating cycle of daily returns, optionally mirrored (every return negated). */
function closesFrom(cycle: number[], mirrored = false, start = 100): number[] {
  const closes = [start];
  for (let i = 0; i < 79; i++) {
    const r = cycle[i % cycle.length];
    closes.push(closes[closes.length - 1] * (1 + (mirrored ? -r : r)));
  }
  return closes;
}

const CYCLE = [0.01, -0.02, 0.03, 0, -0.01];

describe('concentrationOf', () => {
  it('names the sector most of the stocks share', () => {
    const stocks = [
      makeStock({symbol: 'A', sector: 'Technology'}), makeStock({symbol: 'B', sector: 'Technology'}),
      makeStock({symbol: 'C', sector: 'Technology'}), makeStock({symbol: 'D', sector: 'Utilities'}),
    ];
    const result = concentrationOf(stocks);
    expect(result.count).toBe(4);
    expect(result.topSector).toEqual({name: 'Technology', count: 3});
  });

  it('reports a correlation of 1 for two stocks whose daily returns are identical', () => {
    const stocks = [makeStock({symbol: 'A', closes: closesFrom(CYCLE)}), makeStock({symbol: 'B', closes: closesFrom(CYCLE, false, 20)})];
    expect(concentrationOf(stocks).averageCorrelation).toBeCloseTo(1, 6);
  });

  it('averages over every pair: two identical stocks and one mirror image give (1 - 1 - 1) / 3', () => {
    const stocks = [
      makeStock({symbol: 'A', closes: closesFrom(CYCLE)}), makeStock({symbol: 'B', closes: closesFrom(CYCLE)}),
      makeStock({symbol: 'C', closes: closesFrom(CYCLE, true)}),
    ];
    expect(concentrationOf(stocks).averageCorrelation).toBeCloseTo(-1 / 3, 6);
  });

  it('can look at the most recent days only: together all year, opposite ways in the last 20 days', () => {
    const together = closesFrom(CYCLE);                 // 80 closes, 79 daily returns
    const diverged = together.slice(0, 60);             // the same path for the first 59 returns...
    for (let i = 60; i < 80; i++) {                     // ...then the mirror image for the last 20
      diverged.push(diverged[i - 1] * (1 - (together[i] / together[i - 1] - 1)));
    }
    const stocks = [makeStock({symbol: 'A', closes: together}), makeStock({symbol: 'B', closes: diverged})];
    expect(concentrationOf(stocks, 20).averageCorrelation).toBeCloseTo(-1, 6);
    expect(concentrationOf(stocks).averageCorrelation).toBeGreaterThan(0);
  });

  it('gives no recent correlation for a stock with fewer days than the window', () => {
    const stocks = [makeStock({symbol: 'A', closes: closesFrom(CYCLE)}), makeStock({symbol: 'NEW', closes: [100, 101, 99]})];
    expect(concentrationOf(stocks, 20).averageCorrelation).toBeUndefined();
  });

  it('gives no correlation when fewer than two stocks have price history', () => {
    const stocks = [makeStock({symbol: 'A', closes: closesFrom(CYCLE)}), makeStock({symbol: 'B'})];
    expect(concentrationOf(stocks).averageCorrelation).toBeUndefined();
  });

  it('ignores a pair with too few days in common (a stock listed two days ago)', () => {
    const stocks = [makeStock({symbol: 'A', closes: closesFrom(CYCLE)}), makeStock({symbol: 'NEW', closes: [100, 101]})];
    expect(concentrationOf(stocks).averageCorrelation).toBeUndefined();
  });
});

describe('movingTogetherText (how far a group of stocks is one bet, in everyday words)', () => {
  const tech = (symbol: string, closes?: number[]) => makeStock({symbol, sector: 'Technology', closes});

  it('says nothing for fewer stocks than asked for', () => {
    expect(movingTogetherText([tech('A')], 'these', 2)).toBe('');
  });

  it('names the sector most of them share, when at least half of them do', () => {
    const utility = makeStock({symbol: 'D', sector: 'Utilities'});
    expect(movingTogetherText([tech('A'), tech('B'), tech('C'), utility], 'these', 3)).toBe('3 of these 4 stocks are in Technology.');
    expect(movingTogetherText([tech('A'), tech('B')], 'your', 2)).toBe('Both of your stocks are in Technology.');
    expect(movingTogetherText([tech('A'), tech('B'), tech('C')], 'your', 2)).toBe('All 3 of your stocks are in Technology.');
    expect(movingTogetherText([tech('A'), utility, makeStock({symbol: 'E', sector: 'Energy'})], 'your', 2)).toBe('');
  });

  // What it means comes first, in words; the two figures it rests on come after, for who wants them. A reader who
  // is not used to such figures met "0.43 ... 0.64 (0 = not at all, 1 = exactly together)" before the plain sentence.
  it('says first what it means when their prices move closely together, then the figures it rests on', () => {
    const stocks = [tech('A', closesFrom(CYCLE)), tech('B', closesFrom(CYCLE, false, 20)), tech('C', closesFrom(CYCLE))];
    expect(movingTogetherText(stocks, 'these', 3)).toBe(
      'All 3 of these stocks are in Technology. Their prices move closely together: owning all 3 is nearer to one big bet than to 3 separate ones. ' +
      'How closely: 1.00 over the past year and 1.00 over the last month (0 = not at all, 1 = exactly together).');
  });

  it('leaves the warning out for stocks that go their own ways', () => {
    const stocks = [tech('A', closesFrom(CYCLE)), makeStock({symbol: 'B', sector: 'Utilities', closes: closesFrom(CYCLE, true)})];
    expect(movingTogetherText(stocks, 'your', 2)).toBe(
      'How closely their prices move together: -1.00 over the past year and -1.00 over the last month (0 = not at all, 1 = exactly together).');
  });
});

describe('tiedTo (how closely one stock has moved with a group it is not part of)', () => {
  const group = [makeStock({symbol: 'A', closes: closesFrom(CYCLE)}), makeStock({symbol: 'B', closes: closesFrom(CYCLE, true)})];

  it('averages its correlation with each stock of the group: one identical and one mirror image give 0', () => {
    const tied = tiedTo(makeStock({symbol: 'NEW', closes: closesFrom(CYCLE, false, 30)}), group);
    expect(tied.year).toBeCloseTo(0, 6);
    expect(tied.month).toBeCloseTo(0, 6);
    expect(tied.close).toBeFalse();
  });

  it('calls it close from 0.5 up, over the past year or over the last month', () => {
    const same = tiedTo(makeStock({symbol: 'NEW', closes: closesFrom(CYCLE, false, 30)}), [group[0]]);
    expect(same.year).toBeCloseTo(1, 6);
    expect(same.month).toBeCloseTo(1, 6);
    expect(same.close).toBeTrue();
    // Together all year, then the mirror image for the last 20 days: apart lately, but still tied over the year.
    const together = closesFrom(CYCLE), diverged = together.slice(0, 60);
    for (let i = 60; i < 80; i++) {
      diverged.push(diverged[i - 1] * (1 - (together[i] / together[i - 1] - 1)));
    }
    const tied = tiedTo(makeStock({symbol: 'NEW', closes: diverged}), [group[0]]);
    expect(tied.year!).toBeGreaterThan(0);
    expect(tied.month!).toBeLessThan(0);
    expect(tied.close).toBe(tied.year! >= 0.5);
  });

  it('knows nothing without price history in common, and does not compare a stock with itself', () => {
    expect(tiedTo(makeStock({symbol: 'NEW'}), group)).toEqual({year: undefined, month: undefined, close: false});
    expect(tiedTo(group[0], [group[0]])).toEqual({year: undefined, month: undefined, close: false});
    expect(tiedTo(group[0], [])).toEqual({year: undefined, month: undefined, close: false});
  });
});

/**
 * How far the stocks of one portfolio are a single bet, from what holds up on a year of daily prices: weights and
 * sector labels (exact), and two figures of the portfolio as a whole. No figure for a pair of stocks, and none for
 * the last month: those are noise at this length.
 */
describe('oneBetOf and oneBetText (how far the stocks of a portfolio are one bet)', () => {
  /** A year of daily closes whose returns repeat a cycle: 252 returns, so that a cycle of four comes round exactly. */
  const path = (cycle: number[], start = 100, returns = 252): number[] => {
    const closes = [start];
    for (let i = 0; i < returns; i++) {
      closes.push(closes[closes.length - 1] * (1 + cycle[i % cycle.length]));
    }
    return closes;
  };
  // Three ways of moving that have nothing to do with one another, each swinging as much as the others.
  const A = [0.02, 0.02, -0.02, -0.02], B = [0.02, -0.02, 0.02, -0.02], C = [0.02, -0.02, -0.02, 0.02];
  const held = (symbol: string, cycle: number[], value = 1000, sector = 'Technology') =>
    ({stock: makeStock({symbol, sector, closes: path(cycle)}), value});
  const market = (cycle: number[]) => makeStock({symbol: 'MARKET', closes: path(cycle)}).chart!;

  it('counts stocks that move as one as one bet, and stocks that go their own ways as so many', () => {
    expect(oneBetOf([held('AAA', A), held('BBB', A)]).bets).toBeCloseTo(1, 6);
    expect(oneBetOf([held('AAA', A), held('BBB', B)]).bets).toBeCloseTo(2, 6);
    expect(oneBetOf([held('AAA', A), held('BBB', B), held('CCC', C)]).bets).toBeCloseTo(3, 6);
    // Two of the four move as one: a half of the money in one way of moving and a quarter in each of two others.
    expect(oneBetOf([held('AAA', A), held('BBB', A), held('CCC', B), held('DDD', C)]).bets).toBeCloseTo(1 / 0.375, 6);
  });

  it('weighs them by the money in each: nine tenths in one stock is close to one bet, whatever the other does', () => {
    expect(oneBetOf([held('AAA', A, 9000), held('BBB', B, 1000)]).bets).toBeCloseTo(1 / 0.82, 6);
  });

  it('says how many times as much as the market the stocks together swung', () => {
    // The market moves the same way and half as much: the stocks swing twice as much as it.
    const half = A.map(r => r / 2);
    expect(oneBetOf([held('AAA', A), held('BBB', A)], market(half)).swing).toBeCloseTo(2, 2);
    expect(oneBetOf([held('AAA', A), held('BBB', A)], market(A)).swing).toBeCloseTo(1, 6);
    expect(oneBetOf([held('AAA', A), held('BBB', A)]).swing).withContext('no market to compare with').toBeUndefined();
  });

  // What the sentence says is how much the stocks moved, not how much of that follows the market: stocks that have
  // nothing to do with the market still swing. (The first version worked out their move for each 1% of the market,
  // which understates a few volatile stocks: a reviewer's finding.)
  it('counts the whole of their movement, also the part that has nothing to do with the market', () => {
    const other = market(B.map(r => r / 2));
    expect(oneBetOf([held('AAA', A), held('BBB', A)], other).swing).toBeCloseTo(2, 2);
    expect(oneBetText([held('AAA', A), held('BBB', A)], other)).toBe(
      'Both of your stocks are in Technology. Over the past year your stocks moved like one bet, and about 2.0 times as much as the market.');
  });

  it('gives no figure against a market whose prices do not cover the days the stocks were compared over', () => {
    const short = makeStock({symbol: 'MARKET', closes: path(A.map(r => r / 2), 100, 100)}).chart!;
    expect(oneBetOf([held('AAA', A), held('BBB', A)], short).swing).toBeUndefined();
    expect(oneBetText([held('AAA', A), held('BBB', A)], short)).toBe(
      'Both of your stocks are in Technology. Over the past year your stocks moved like one bet.');
  });

  it('finds the sector that holds most of the money, by money and not by count', () => {
    const one = oneBetOf([held('AAA', A, 6000), held('BBB', B, 2500), held('CCC', C, 1500, 'Utilities')]);
    expect(one.topSector).toEqual({name: 'Technology', count: 2, share: 0.85});
    const other = oneBetOf([held('AAA', A, 1000), held('BBB', B, 1000), held('CCC', C, 8000, 'Utilities')]);
    expect(other.topSector).toEqual({name: 'Utilities', count: 1, share: 0.8});
  });

  it('leaves out a stock with too little price history, and says how many it compared', () => {
    const young = {stock: makeStock({symbol: 'NEW', closes: [100, 101, 99]}), value: 1000};
    const bet = oneBetOf([held('AAA', A), held('BBB', B), young]);
    expect([bet.count, bet.compared]).toEqual([3, 2]);
    expect(bet.bets).toBeCloseTo(2, 6);
    expect(oneBetOf([held('AAA', A), young]).bets).withContext('one stock left: nothing to compare').toBeUndefined();
  });

  it('says it in two sentences: where the money is, and how the stocks moved', () => {
    const half = A.map(r => r / 2);
    // Half of the money moves the market's way and twice as much; the other half goes its own ways: together they
    // swing a little more than the market.
    expect(oneBetText([held('AAA', A), held('BBB', A), held('CCC', B), held('DDD', C)], market(half))).toBe(
      'All 4 of your stocks are in Technology. Over the past year your stocks moved like about 3 separate bets, ' +
      'and about 1.2 times as much as the market.');
    expect(oneBetText([held('AAA', A), held('BBB', A)], market(A))).toBe(
      'Both of your stocks are in Technology. Over the past year your stocks moved like one bet, and about as much as the market.');
    expect(oneBetText([held('AAA', A), held('BBB', A)], market(half))).toBe(
      'Both of your stocks are in Technology. Over the past year your stocks moved like one bet, and about 2.0 times as much as the market.');
    expect(oneBetText([held('AAA', A, 6000), held('BBB', B, 2500), held('CCC', C, 1500, 'Utilities')])).toBe(
      '85% of your stock money is in Technology: 2 of your 3 stocks. Over the past year your stocks moved like about 2 separate bets.');
  });

  it('says "separate bets" without "about" when the stocks moved as separately as they can', () => {
    expect(oneBetText([held('AAA', A, 1000, 'Technology'), held('BBB', B, 1000, 'Energy'), held('CCC', C, 1000, 'Utilities')]))
      .toBe('Over the past year your stocks moved like 3 separate bets.');
  });

  // A stock listed a few months ago cuts the days all of them share: the sentence then says how many months it is
  // about, and not "the past year".
  it('says over how many months when the stocks share less than a year of prices', () => {
    const short = (symbol: string, cycle: number[]) => ({stock: makeStock({symbol, closes: path(cycle, 100, 84)}), value: 1000});
    expect(oneBetOf([held('AAA', A), short('BBB', B)]).days).toBe(84);
    expect(oneBetText([held('AAA', A), short('BBB', B)])).toBe(
      'Both of your stocks are in Technology. Over the past 4 months your stocks moved like 2 separate bets.');
    expect(oneBetOf([held('AAA', A), held('BBB', B)]).days).withContext('a whole year').toBe(252);
  });

  it('says so when some stocks could not be compared', () => {
    const young = {stock: makeStock({symbol: 'NEW', closes: [100, 101, 99]}), value: 1000};
    expect(oneBetText([held('AAA', A), held('BBB', B), young])).toBe(
      'All 3 of your stocks are in Technology. Over the past year your stocks moved like 2 separate bets. ' +
      'Counted for 2 of your 3 stocks: the other has too little price history.');
  });

  it('says only where the money is when the prices cannot be compared, and nothing for a single stock', () => {
    expect(oneBetText([{stock: makeStock({symbol: 'AAA'}), value: 1000}, {stock: makeStock({symbol: 'BBB'}), value: 1000}]))
      .toBe('Both of your stocks are in Technology.');
    expect(oneBetText([held('AAA', A)])).toBe('');
    expect(oneBetText([])).toBe('');
  });

  it('weighs the average swing by the money in each stock', () => {
    // Nine tenths in a stock that swings 2% a day and one tenth in one that swings 6% and goes its own way:
    // (0.9 x 2 + 0.1 x 6) squared over (0.9 x 2) squared + (0.1 x 6) squared = 1.6. Not weighed it would be 4.4.
    expect(oneBetOf([held('AAA', A, 9000), held('BBB', B.map(r => r * 3), 1000)]).bets).toBeCloseTo(1.6, 6);
  });

  it('says "about" unless the figure is the whole number itself', () => {
    expect(oneBetText([held('AAA', A, 9000), held('BBB', B, 1000)])).toBe(
      'Both of your stocks are in Technology. Over the past year your stocks moved like about one bet.');
    expect(oneBetText([held('AAA', A, 6000), held('BBB', B, 4000)])).toBe(
      'Both of your stocks are in Technology. Over the past year your stocks moved like about 2 separate bets.');
    expect(oneBetText([held('AAA', A), held('BBB', A)])).toContain('moved like one bet.');
    expect(oneBetText([held('AAA', A), held('BBB', B)])).toContain('moved like 2 separate bets.');
  });

  it('never says more separate bets than there are stocks, and nothing for stocks that did not move', () => {
    // Nearly mirror images cancel out: the figure runs away (361 here), the sentence stays at the two stocks there are.
    expect(oneBetOf([held('AAA', A), held('BBB', A.map(r => -0.9 * r))]).bets).toBeGreaterThan(300);
    expect(oneBetText([held('AAA', A), held('BBB', A.map(r => -0.9 * r))])).toBe(
      'Both of your stocks are in Technology. Over the past year your stocks moved like 2 separate bets.');
    const flat = [0, 0, 0, 0];
    expect(oneBetOf([held('AAA', flat), held('BBB', flat)]).bets).toBeUndefined();
    expect(oneBetText([held('AAA', flat), held('BBB', flat)])).toBe('Both of your stocks are in Technology.');
  });

  it('does not count a holding that is worth nothing', () => {
    const bet = oneBetOf([held('AAA', A), held('BBB', B), held('CCC', C, 0)]);
    expect([bet.count, bet.compared]).toEqual([2, 2]);
  });

  it('leaves out a stock whose prices hardly overlap with the others, though it has enough days of its own', () => {
    // 100 days of prices that ended 200 days before the others' year did: 52 days in common with them.
    const old = {stock: {...makeStock({symbol: 'OLD'}), chart: chartOf(path(C, 100, 100), {endDay: '2026-05-04T05:00:00Z'})}, value: 1000};
    const bet = oneBetOf([held('AAA', A), held('BBB', B), old]);
    expect([bet.count, bet.compared, bet.days]).toEqual([3, 2, 252]);
    expect(bet.bets).toBeCloseTo(2, 6);
  });

  it('does not say 100% while a stock is outside the sector', () => {
    expect(oneBetText([held('AAA', A, 9960), held('BBB', B, 40, 'Utilities')])).toBe(
      'Nearly all of your stock money is in Technology: 1 of your 2 stocks. Over the past year your stocks moved like one bet.');
  });

  it('names no sector when two hold the same share of the money', () => {
    expect(oneBetText([held('AAA', A, 1000, 'Energy'), held('BBB', B, 1000, 'Technology')])).toBe(
      'Over the past year your stocks moved like 2 separate bets.');
  });

  it('names the sector from half of the money up, and not below', () => {
    expect(oneBetText([held('AAA', A, 500), held('BBB', B, 300, 'Energy'), held('CCC', C, 200, 'Utilities')]))
      .toContain('50% of your stock money is in Technology: 1 of your 3 stocks.');
    expect(oneBetText([held('AAA', A, 490), held('BBB', B, 310, 'Energy'), held('CCC', C, 200, 'Utilities')]))
      .not.toContain('your stock money');
  });

  it('says "the past year" from 230 days of prices in common, and months below that', () => {
    const over = (days: number) => (symbol: string, cycle: number[]) => ({stock: makeStock({symbol, closes: path(cycle, 100, days)}), value: 1000});
    expect(oneBetText([over(230)('AAA', A), over(230)('BBB', B)])).toContain('Over the past year your stocks');
    expect(oneBetText([over(229)('AAA', A), over(229)('BBB', B)])).toContain('Over the past 11 months your stocks');
  });

  it('says "about as much as the market" within a twentieth of its swing, and the figure outside it', () => {
    const scaled = (factor: number) => market(A.map(r => r * factor));
    expect(oneBetText([held('AAA', A), held('BBB', A)], scaled(1 / 1.04))).toContain('and about as much as the market.');
    expect(oneBetText([held('AAA', A), held('BBB', A)], scaled(1 / 1.06))).toContain('and about 1.1 times as much as the market.');
    expect(oneBetText([held('AAA', A), held('BBB', A)], scaled(1 / 0.94))).toContain('and about 0.9 times as much as the market.');
  });

  it('says "the others have" when several stocks could not be compared', () => {
    const young = (symbol: string) => ({stock: makeStock({symbol, closes: [100, 101, 99]}), value: 1000});
    expect(oneBetText([held('AAA', A), held('BBB', B), young('NEW'), young('NEWER')])).toContain(
      'Counted for 2 of your 4 stocks: the others have too little price history.');
  });
});
