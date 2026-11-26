import {Figures} from "../evidence";

/**
 * The figures the backtests recorded on 2026-11-21, fixed here so the tests do not move when the backtests are
 * re-run and the app's own numbers change.
 */
export const FIGURES_2026_11_21: Figures = {
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
  // Recorded on 2026-11-22 (pre-registered #8): three stocks that dropped, held together, against one alone.
  several: {
    stocks: 618, fromYear: 1994, toYear: 2026, count: 3,
    alone: {mean: 8.8, typical: 3.8, badLoss: 33},
    together: {mean: 8.6, typical: 5.3, badLoss: 22},
    falling: {months: 98, alone: -11.2, together: -10.2},
    market: {typical: 5.5},
  },
};

/**
 * The take-profit test (pre-registered #9) with made-up numbers, in the shape tools/evidence/figures.js gives it:
 * at +15% both ways pass, at +25% only the sell order. For the tests of what the app builds from that test.
 */
export const TAKE_PROFIT_MADE_UP: NonNullable<Figures['eighth']> = {
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
    25: {passed: true, lossPercent: 37, badLoss: 27, mean: 5.5, typical: 12.5, soldPercent: 45, milder: true, milderPoints: 3.5,
      reached: {lossPercentKept: 16, meanKept: 33.6, meanSold: 25}},
  },
};

/** The figures of 2026-11-21 with that take-profit test beside them. */
export const FIGURES_WITH_TAKE_PROFIT: Figures = {...FIGURES_2026_11_21, eighth: TAKE_PROFIT_MADE_UP};
