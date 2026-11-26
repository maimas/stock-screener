'use strict';
// Tests for the step between the backtests and the app's numbers. Run with: npm run test:tools
const test = require('node:test');
const assert = require('node:assert/strict');
const {toFigures, check, render, changes} = require('./figures');
const {recorded} = require('./testing/recorded');

/** A copy of the recorded figures with some values changed, each addressed by a dotted path. */
function withValues(values) {
  const figures = recorded();
  Object.keys(values).forEach(path => {
    const keys = path.split('.');
    let at = figures;
    keys.slice(0, -1).forEach(key => at = at[key]);
    at[keys[keys.length - 1]] = values[path];
  });
  return figures;
}

const withValue = (path, value) => withValues({[path]: value});

test('toFigures rounds what the backtests recorded to the numbers the app quotes', () => {
  const {eighth, ...others} = toFigures(recorded());   // the take-profit test has its own tests, at the end of this file
  assert.ok(eighth);
  assert.deepEqual(others, {
    dipPercent: 15,
    stocks: 636,
    firstBuy: '2023-05-26',
    lastBuy: '2026-05-22',
    dipBuy: {mean: 12.1, median: 4.8, upPercent: 56, fellPercent: 33},
    everyDip: {mean: 10, median: 4.6},
    notGrowing: {mean: 9.2, median: 4.5},
    sp500: {mean: 10.8, beatPercent: 42},
    typicalLowPercent: 13,
    reach: {depthP95: 57, volatilityP95: 79},
    regime: {stocks: 424, fromYear: 1994, toYear: 2022, growing: 11, others: 13.5, worseIn2020to2022: 11},
    fresh: {
      stocks: 234, growing: 12, everyDip: 12.2, holding: 12, withStop: 7.1, stopPercent: 20, stoppedPercent: 53,
      fellPercent: {volatile: 41, calm: 21},
    },
    groups: {volatileFrom: 45, calmBelow: 35},
    cases: {
      volatile: {bad: 41, typical: 2.4, good: 85},
      middle: {bad: 31, typical: -0.1, good: 56},
      calm: {bad: 24, typical: 4.1, good: 41},
    },
    fear: {
      stocks: 424, fromYear: 1994, toYear: 2026, vixHigh: 25, episodes: 16,
      high: {mean: 20.4, upPercent: 71, fellPercent: 15},
      low: {mean: 7.3},
    },
    sixth: {
      stocks: 184,
      buyFirst: {fallPercent: 25, weeks: 13, weeksCompared: 34, aheadPercent: 47},
      takeProfit: {percent: 25, holding: 20.2, holdingTypical: 1.2, withTakeProfit: 7.4, soldEarlyPercent: 61},
      afterHolding: {stay: 16.1, sp500: 7.4, beatPercent: 45, typicalExcess: -5.2},
    },
    seventh: {
      stocks: 202,
      profit: {mean: 9.3, typical: 3.6, upPercent: 56, worstTenth: 31},
      market: {sp500: 10.2, beatPercent: 41, beats: false},
      secondHalf: {stay: 9.4, sp500: 7.7},
      sellingEarly: {holding: 9.3, withTakeProfit: 5.5, soldEarlyPercent: 45, withStop: 6.5},
    },
    plan: {
      holdWeeks: 26, positions: 766, months: 33, monthsUp: 24, monthsBeat: 20, worst: -18.7, median: 11.6, best: 33.6, together: 13,
      sp500: {monthsUp: 29, worst: -6.4, best: 26.7, together: 11},
    },
    several: {
      stocks: 618, fromYear: 1994, toYear: 2026, count: 3,
      alone: {mean: 8.8, typical: 3.8, badLoss: 33},
      together: {mean: 8.6, typical: 5.3, badLoss: 22},
      falling: {months: 98, alone: -11.2, together: -10.2},
      market: {typical: 5.5},
    },
  });
});

test('check finds nothing wrong with the figures recorded on 2026-11-21', () => {
  assert.deepEqual(check(recorded(), recorded()), {blocking: [], notes: []});
});

test('check blocks an update when a section is missing, naming the script that writes it', () => {
  const figures = recorded();
  delete figures.fresh;
  const {blocking} = check(figures);
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /fresh/);
  assert.match(blocking[0], /backtest_validation3\.py/);
});

test('check lets an update through when the ordering that was not shipped fails its own test: the plan does not use it', () => {
  assert.deepEqual(check(withValue('sixth.verdicts.P1', 'FAIL'), recorded()).blocking, []);
});

test('check names the test of the newest list when its figures are missing', () => {
  const figures = recorded();
  delete figures.sixth;
  assert.match(check(figures).blocking[0], /backtest_validation4\.py/);
});

test('check blocks an update when far fewer stocks of the sixth list came back', () => {
  assert.match(check(withValue('sixth.stocks', 120), recorded()).blocking[0], /120 stocks on the sixth list.*184/);
});

test('check names the test of the seventh list when its figures are missing', () => {
  const figures = recorded();
  delete figures.seventh;
  assert.match(check(figures).blocking[0], /backtest_validation5\.py/);
});

test('check blocks an update when far fewer stocks of the seventh list came back', () => {
  assert.match(check(withValue('seventh.stocks', 120), recorded()).blocking[0], /120 stocks on the seventh list.*202/);
});

test('the wording follows the test of the market: "more than the market" only once that passes', () => {
  assert.equal(toFigures(recorded()).seventh.market.beats, false);
  assert.equal(toFigures(withValue('seventh.verdicts.G2', 'PASS')).seventh.market.beats, true);
  assert.deepEqual(check(withValue('seventh.verdicts.G2', 'PASS'), recorded()).blocking, [], 'either way it is said as it is');
});

test('check names the long-history test of how many to hold when its figures are missing', () => {
  const figures = recorded();
  delete figures.several;
  assert.match(check(figures).blocking[0], /backtest_several\.py/);
});

test('check no longer depends on the one-against-ten of the replay or on G3: the plan quotes the long-history test instead', () => {
  assert.deepEqual(check(withValue('plan.baskets.10.up', 0.55), recorded()).blocking, []);
  assert.deepEqual(check(withValue('seventh.verdicts.G3', 'PASS'), recorded()).blocking, []);
});

test('check names the replay of the plan when its figures are missing', () => {
  const figures = recorded();
  delete figures.plan;
  assert.match(check(figures).blocking[0], /backtest_plan\.py/);
});

// Each entry breaks exactly one statement the app makes in words.
const BROKEN_CLAIMS = [
  ['DIP BUYs no longer beat every dip on average', {'summary.dipBuy.mean': 9.5}, /every dip/i],
  ['DIP BUYs no longer beat dips in companies that are not growing', {'summary.notGrowing.mean': 12.6}, /not growing/i],
  ['the typical DIP BUY lost money', {'summary.dipBuy.median': -0.4, 'summary.notGrowing.median': -0.6}, /typical DIP BUY gained/i],
  ['the typical results are no longer about the same', {'summary.notGrowing.median': 1.2}, /about the same/i],
  ['the test window was not a rising market', {'summary.sp500.mean': 1.4}, /rising market/i],
  ['the volatility risk note no longer passes', {'fresh.verdicts.H2': 'FAIL'}, /On the fresh list H2/],
  ['the stop-loss note no longer passes', {'fresh.verdicts.H3': 'FAIL'}, /H3/],
  ['growing dips did better than other dips on the fresh list', {'fresh.growing': 13.4}, /on the fresh list/i],
  ['the bad cases are no longer ordered by volatility', {'fresh.cases.calm.bad': 33}, /bad case/i],
  ['the long-history test now passes', {'regime.verdict': 'PASS'}, /1994/],
  ['high-fear months were not better', {'sentiment.high.mean': 6.9}, /VIX/],
  ['selling early for a gain no longer lowered the result', {'sixth.verdicts.P2': 'FAIL'}, /P2/],
  ['on the sixth list the second half-year no longer beat the market', {'sixth.afterHolding.stay': 5}, /second 6 months/i],
  ['the plan no longer made money on the seventh list', {'seventh.verdicts.G1': 'FAIL'}, /G1/],
  ['the second half-year now holds up on the seventh list too', {'seventh.verdicts.G4': 'PASS'}, /G4/],
  ['selling early for a gain no longer paid less on the seventh list', {'seventh.verdicts.G5a': 'FAIL'}, /G5/],
  ['selling after a drop no longer paid less on the seventh list', {'seventh.verdicts.G5b': 'FAIL'}, /G5/],
  ['the pooled average no longer comes from a few big winners', {'summary.dipBuy.median': 9, 'summary.notGrowing.median': 8.6}, /few/i],
  ['the fast fallers were ahead in most weeks after all', {'sixth.buyFirst.aheadWeeks': 0.68}, /no dependable/i],
  ['too few weeks had both kinds of DIP BUY to say how often the fast fallers were ahead', {'sixth.buyFirst.weeksCompared': 6}, /6 weeks/],
  ['the plan was replayed on too few months to say anything', {'plan.months': 9}, /9 monthly/],
  ['three together no longer soften a bad half-year', {'several.verdicts.S1': 'FAIL'}, /S1/],
  ['three together no longer typically end higher than one alone', {'several.verdicts.S2': 'FAIL'}, /S2/],
  ['the bad case of three together is no longer a loss', {'several.several.bad': 1.5}, /as a loss/i],
  ['holding three changed the average', {'several.several.mean': 11.2}, /does not change the average/i],
  ['three together typically gained when the market fell', {'several.falling.several.typical': 0.8}, /market fell/i],
];

BROKEN_CLAIMS.forEach(([what, values, expected]) => {
  test(`check blocks an update when ${what}`, () => {
    const {blocking} = check(withValues(values), recorded());
    assert.equal(blocking.length, 1, blocking.join(' | '));
    assert.match(blocking[0], expected);
  });
});

test('check blocks an update when far fewer stocks or dips came back than last time (a partial download)', () => {
  assert.match(check(withValue('summary.stocks', 540), recorded()).blocking[0], /540.*636/);
  assert.match(check(withValue('summary.dipBuy.n', 1500), recorded()).blocking[0], /1,?500/);
  assert.match(check(withValue('fresh.stocks', 190), recorded()).blocking[0], /190.*234/);
});

test('check allows the small changes a re-run with newer data brings', () => {
  const later = recorded();
  later.summary.stocks = 631;                 // a few companies were taken over
  later.summary.dipBuy.mean = 11.6;
  later.summary.lastBuy = '2026-11-20';
  later.fresh.cases.volatile.bad = 43.2;
  assert.deepEqual(check(later, recorded()).blocking, []);
});

test('check only notes, without blocking, a rejected idea that now passes: that is the user\'s decision to revisit', () => {
  const {blocking, notes} = check(withValue('fresh.verdicts.H4', 'PASS'), recorded());
  assert.deepEqual(blocking, []);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /H4/);
});

test('check works without earlier figures (the first run)', () => {
  assert.deepEqual(check(recorded(), undefined).blocking, []);
});

test('render writes a TypeScript module holding exactly the figures, marked as generated', () => {
  const figures = toFigures(recorded());
  const source = render(figures);
  assert.match(source, /GENERATED/);
  assert.match(source, /npm run evidence/);
  const literal = /export const FIGURES = (\{[\s\S]*\}) as const;\n$/.exec(source);
  assert.ok(literal, 'the module exports FIGURES as a constant');
  assert.deepEqual(new Function(`return ${literal[1]}`)(), figures);
});

test('render gives the same text for the same figures, so re-running the backtests changes nothing in git', () => {
  assert.equal(render(toFigures(recorded())), render(toFigures(recorded())));
});

test('changes lists each number that moved, old to new, and nothing else', () => {
  const before = toFigures(recorded());
  const after = toFigures(withValue('summary.dipBuy.mean', 11.64));
  assert.deepEqual(changes(before, after), ['dipBuy.mean: 12.1 → 11.6']);
  assert.deepEqual(changes(before, before), []);
  assert.deepEqual(changes(undefined, {stocks: 636}), ['stocks: (new) → 636']);
  assert.deepEqual(changes({stocks: undefined}, {stocks: 636}), ['stocks: (new) → 636'], 'a figure the earlier run did not record');
  assert.deepEqual(changes({ahead: NaN}, {ahead: 47}), ['ahead: (new) → 47'], 'nor one worked out from a figure it did not record');
  assert.deepEqual(changes({ahead: NaN}, {ahead: NaN}), [], 'and a figure missing on both sides has not changed');
});

// ---- Pre-registered #9 (backtest_validation6.py): taking a profit at +15% and +25%, two ways, on the eighth list ----

/** What the script records for one question (T1, T2) of one rule. Only `gap` and `mark` are read here. */
const asked = (gap, mark, passed) => ({
  gap, mark, halfMark: mark / 2, halves: [gap, gap], low: gap - 2, high: gap + 2,
  pDecides: mark !== 2, pUnderMarkByStock: 0.01, pUnderMarkByQuarter: 0.02, passed,
});

/** One way of taking a profit at one level, in the shape the script records. The numbers are made up. */
function ruleRecorded(verdict, {lossRate, badCase, mean, median, soldEarly, milder, lossWhenKept, meanWhenKept, meanWhenSold}) {
  return {
    verdict, lossRate, badCase, mean, median, soldEarly, lostFifth: 15.1, averageLower: 9.1 - mean, lowerOnThisList: true,
    lossRarer: asked(44.4 - lossRate, 5, verdict === 'PASS'), badCaseMilder: asked(milder, 2, milder >= 2),
    whenReached: {share: soldEarly, lossWhenKept, meanWhenKept, meanWhenSold, medianWhenKept: 20.3, badCaseWhenKept: -8.3},
  };
}

/** The section backtest_validation6.py records, with made-up numbers. */
function eighthRecorded() {
  return {
    symbols: 202, stocks: 200, withPrices: 200, withEarnings: 195, withRows: 190, dipBuys: 800, dipBuyStocks: 120,
    firstBuy: '2022-06-03', lastBuy: '2026-05-22', marketRose: 86.84,
    lookingLessOften: {15: {2: {lossRate: 35.61, badCase: -29.1, mean: 4.9}, 4: {lossRate: 37.08, badCase: -29.3, mean: 5.2}},
      25: {2: {lossRate: 41.04, badCase: -29.4, mean: 6.1}, 4: {lossRate: 41.63, badCase: -29.4, mean: 6.2}}},
    verdicts: {seen15: 'PASS', seen25: 'FAIL', order15: 'PASS', order25: 'FAIL'},
    holding: {mean: 9.07, median: 3.62, lossRate: 44.38, badCase: -30.52, lostFifth: 19.1},
    takeProfit: {
      seen: {
        15: ruleRecorded('PASS', {lossRate: 34.19, badCase: -28.68, mean: 4.39, median: 15.52, soldEarly: 55.61, milder: 1.84,
          lossWhenKept: 17.87, meanWhenKept: 28.96, meanWhenSold: 20.06}),
        25: ruleRecorded('FAIL', {lossRate: 40.52, badCase: -29.36, mean: 5.31, median: 6.92, soldEarly: 36.13, milder: 1.16,
          lossWhenKept: 10.04, meanWhenKept: 42.13, meanWhenSold: 31.08}),
      },
      order: {
        15: ruleRecorded('PASS', {lossRate: 28.04, badCase: -26.03, mean: 4.12, median: 15, soldEarly: 66.19, milder: 4.49,
          lossWhenKept: 24.31, meanWhenKept: 22.79, meanWhenSold: 15}),
        25: ruleRecorded('FAIL', {lossRate: 36.77, badCase: -27.04, mean: 5.48, median: 12.47, soldEarly: 45.16, milder: 3.48,
          lossWhenKept: 16.21, meanWhenKept: 33.62, meanWhenSold: 25}),
      },
    },
  };
}

const withEighth = (change = section => section) => ({...recorded(), eighth: change(eighthRecorded())});

test('toFigures leaves the eighth list out of figures recorded before its test was run', () => {
  const {eighth, ...before} = recorded();
  assert.ok(eighth);
  assert.equal('eighth' in toFigures(before), false);
});

test('toFigures rounds the take-profit test of the eighth list to what the app quotes, each rule beside keeping', () => {
  assert.deepEqual(toFigures(withEighth()).eighth, {
    stocks: 200, decided: true, firstBuy: '2022-06-03', lastBuy: '2026-05-22', marketRosePercent: 87,
    keeping: {mean: 9.1, typical: 3.6, lossPercent: 44, badLoss: 30.5},
    lessOften: {15: {every2: 36, every4: 37}, 25: {every2: 41, every4: 42}},
    seen: {
      15: {passed: true, lossPercent: 34, badLoss: 28.7, mean: 4.4, typical: 15.5, soldPercent: 56, milder: false, milderPoints: 1.8,
        reached: {lossPercentKept: 18, meanKept: 29, meanSold: 20.1}},
      25: {passed: false, lossPercent: 41, badLoss: 29.4, mean: 5.3, typical: 6.9, soldPercent: 36, milder: false, milderPoints: 1.1,
        reached: {lossPercentKept: 10, meanKept: 42.1, meanSold: 31.1}},
    },
    order: {
      15: {passed: true, lossPercent: 28, badLoss: 26, mean: 4.1, typical: 15, soldPercent: 66, milder: true, milderPoints: 4.5,
        reached: {lossPercentKept: 24, meanKept: 22.8, meanSold: 15}},
      25: {passed: false, lossPercent: 37, badLoss: 27, mean: 5.5, typical: 12.5, soldPercent: 45, milder: true, milderPoints: 3.5,
        reached: {lossPercentKept: 16, meanKept: 33.6, meanSold: 25}},
    },
  });
});

test('toFigures gives the take-profit test as it was recorded on 2026-11-25: +15% passed both ways, +25% neither', () => {
  const profit = toFigures(recorded()).eighth;
  // The share of positions for which the market rose is printed by the script without a decimal (91%): rounded once.
  assert.deepEqual({stocks: profit.stocks, decided: profit.decided, firstBuy: profit.firstBuy, lastBuy: profit.lastBuy, rose: profit.marketRosePercent},
    {stocks: 201, decided: true, firstBuy: '2022-08-12', lastBuy: '2026-05-29', rose: 91});
  // Looking every second and every fourth week instead of every week: the share that ended with a loss.
  assert.deepEqual(profit.lessOften, {15: {every2: 31, every4: 33}, 25: {every2: 38, every4: 38}});
  assert.deepEqual(profit.keeping, {mean: 10.6, typical: 5.6, lossPercent: 42, badLoss: 31.8});
  assert.deepEqual(profit.seen[15], {passed: true, lossPercent: 30, badLoss: 28.3, mean: 6.4, typical: 15.9, soldPercent: 60, milder: true, milderPoints: 3.5,
    reached: {lossPercentKept: 20, meanKept: 27.5, meanSold: 20.5}});
  assert.deepEqual(profit.order[15], {passed: true, lossPercent: 25, badLoss: 24.7, mean: 5, typical: 15, soldPercent: 69, milder: true, milderPoints: 7.1,
    reached: {lossPercentKept: 25, meanKept: 23.2, meanSold: 15}});
  assert.deepEqual([profit.seen[25].passed, profit.order[25].passed], [false, false]);
  assert.deepEqual([profit.seen[25].milder, profit.order[25].milder, profit.order[25].milderPoints], [false, false, 1.9]);
});

// The first whole download is the result (pre-registered #9). A later one can stop an update when an offered rule
// no longer passes; it can never add an offer.
test('toFigures does not offer a rule that failed on the first download, also when a later download passes it', () => {
  const later = withEighth(section => {
    section.verdicts.seen25 = 'PASS';
    section.takeProfit.seen[25].verdict = 'PASS';
    return section;
  });
  assert.equal(toFigures(later).eighth.seen[25].passed, false);
  const {blocking, notes} = check(later, withEighth());
  assert.deepEqual(blocking, []);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /selling after a week closed \+25% up or more now passes.*not offered.*yours to decide/);
});

// The sell order at +25% passes since the test reads the corrected bars (2026-11-26). The owner was asked that day
// and left it not offered, so it is neither offered nor brought up again at every update.
test('check says nothing more about the sell order at +25%, which the owner left not offered', () => {
  const corrected = withEighth(section => {
    section.verdicts.order25 = 'PASS';
    section.takeProfit.order[25].verdict = 'PASS';
    return section;
  });
  assert.equal(toFigures(corrected).eighth.order[25].passed, false);
  assert.deepEqual(check(corrected, withEighth()), {blocking: [], notes: []});
});

test('check blocks an update when a rule the plan offers no longer passes', () => {
  const later = withEighth(section => {
    section.verdicts.seen15 = 'FAIL';
    section.takeProfit.seen[15].verdict = 'FAIL';
    return section;
  });
  const {blocking} = check(later, withEighth());
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /offers \+15% as a level for taking a profit, by selling after a week closed \+15% up or more \(pre-registered #9\)\. That is now FAIL/);
});

test('check blocks an update when the take-profit test can no longer be decided, while the plan offers a level from it', () => {
  const undecided = withEighth(section => ({
    ...section,
    verdicts: {seen15: 'INCONCLUSIVE', seen25: 'INCONCLUSIVE', order15: 'INCONCLUSIVE', order25: 'INCONCLUSIVE'},
    takeProfit: {seen: {15: {verdict: 'INCONCLUSIVE'}, 25: {verdict: 'INCONCLUSIVE'}}, order: {15: {verdict: 'INCONCLUSIVE'}, 25: {verdict: 'INCONCLUSIVE'}}},
  }));
  const {blocking} = check(undecided, withEighth());
  assert.equal(blocking.length, 2);
  assert.match(blocking[0], /That is now INCONCLUSIVE/);
});

test('check names the take-profit test when its figures are missing', () => {
  const figures = recorded();
  delete figures.eighth;
  assert.match(check(figures).blocking[0], /backtest_validation6\.py/);
});

test('toFigures gives the points the bad case was milder by as the difference of the two bad cases it prints', () => {
  // 30.52 and 28.47 print as 30.5 and 28.5: a reader subtracts those and gets 2.0, while the unrounded gap is 2.05.
  const figures = toFigures(withEighth(section => {
    section.takeProfit.seen[15].badCase = -28.47;
    section.takeProfit.seen[15].badCaseMilder = asked(2.05, 2, true);
    return section;
  }));
  assert.equal(figures.eighth.seen[15].badLoss, 28.5);
  assert.equal(figures.eighth.seen[15].milderPoints, 2);
});

test('toFigures calls a bad case milder from the mark the test wrote down, by the gap as recorded', () => {
  const milderAt = gap => toFigures(withEighth(section => {
    section.takeProfit.order[25].badCaseMilder = asked(gap, 2, false);
    return section;
  })).eighth.order[25].milder;
  assert.equal(milderAt(1.96), false, 'under 2 points it is "about as bad", also when it prints as 2.0');
  assert.equal(milderAt(2), true);
  assert.equal(milderAt(1.9999999999), true, 'the last bits of a float do not decide it');
});

// The script prints how many positions a rule sold without a decimal ("sold early on 59%"): the app's figure is that
// one, rounded once, as for the share of positions over which the market rose.
test('toFigures rounds once the share of positions a rule sold, which the script prints without a decimal', () => {
  const figures = toFigures(withEighth(section => {
    section.takeProfit.seen[15].soldEarly = 59.46;
    return section;
  }));
  assert.equal(figures.eighth.seen[15].soldPercent, 59);
});

test('toFigures does without what an earlier run of the script did not record', () => {
  const figures = toFigures(withEighth(section => {
    delete section.lookingLessOften;
    section.marketRose = null;
    return section;
  }));
  assert.deepEqual(figures.eighth.lessOften, {});
  assert.equal(figures.eighth.marketRosePercent, null);
  assert.match(render(figures), /marketRosePercent: null/);
});

test('toFigures says only that the take-profit test was undecided when the list was too thin to judge', () => {
  const figures = toFigures(withEighth(section => ({
    ...section, dipBuys: 12, dipBuyStocks: 5,
    verdicts: {seen15: 'INCONCLUSIVE', seen25: 'INCONCLUSIVE', order15: 'INCONCLUSIVE', order25: 'INCONCLUSIVE'},
    takeProfit: {seen: {15: {verdict: 'INCONCLUSIVE'}, 25: {verdict: 'INCONCLUSIVE'}}, order: {15: {verdict: 'INCONCLUSIVE'}, 25: {verdict: 'INCONCLUSIVE'}}},
  })));
  assert.deepEqual(figures.eighth, {stocks: 200, decided: false});
});

test('check finds nothing wrong with a take-profit test in which each way made a loss rarer and gave less on average', () => {
  assert.deepEqual(check(withEighth(), withEighth()), {blocking: [], notes: []});
});

test('check blocks an update when a way of taking a profit no longer made a loss rarer, which the app says of each', () => {
  const figures = withEighth(section => {
    section.takeProfit.seen[25].lossRate = 44.2;
    return section;
  });
  const {blocking} = check(figures, withEighth());
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /made a loss rarer.*selling after a week closed \+25% up or more: 44% ended below what was paid, against 44% when kept/);
});

test('check blocks an update when a way of taking a profit no longer gave less on average, which the app says of each', () => {
  const figures = withEighth(section => {
    section.takeProfit.order[15].mean = 9.12;
    return section;
  });
  const {blocking} = check(figures, withEighth());
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /gave less on average.*a sell order placed in advance at \+15%: \+9\.1% against \+9\.1% for keeping/);
});

test('check blocks an update when the market did not rise for most purchases of the take-profit test: the app says "rising" with that share', () => {
  const figures = withEighth(section => {
    section.marketRose = 48.2;
    return section;
  });
  const {blocking} = check(figures, withEighth());
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /says the market was rising.*for 48% of the purchases/);
  assert.deepEqual(check(withEighth(section => ({...section, marketRose: null})), withEighth()).blocking, [], 'a run that could not tell says nothing');
});

test('check blocks an update when the stocks an offered rule sold made no more when kept: "a sale gives up what the winners go on to make"', () => {
  const figures = withEighth(section => {
    section.takeProfit.order[15].whenReached.meanWhenKept = 14.6;
    return section;
  });
  const {blocking} = check(figures, withEighth());
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /gives up what the winners go on to make.*a sell order placed in advance at \+15%.*\+14\.6% on average when kept, against \+15\.0% when sold/);
});

test('check does not hold a rule that is not offered to what became of the stocks it sold', () => {
  const figures = withEighth(section => {
    section.takeProfit.seen[25].whenReached.meanWhenKept = 30.2;   // sold: 31.08; seen at +25% did not pass
    return section;
  });
  assert.deepEqual(check(figures, withEighth()).blocking, []);
});

test('check blocks an update when far fewer stocks of the eighth list came back', () => {
  const figures = withEighth(section => ({...section, stocks: 150}));
  assert.match(check(figures, withEighth()).blocking[0], /150 stocks on the eighth list.*200/);
});

test('render writes the take-profit figures so that they read back as they were, levels as keys', () => {
  const figures = toFigures(withEighth());
  const literal = /export const FIGURES = (\{[\s\S]*\}) as const;\n$/.exec(render(figures));
  assert.deepEqual(new Function(`return ${literal[1]}`)().eighth, figures.eighth);
});
