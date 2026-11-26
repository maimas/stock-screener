'use strict';

/**
 * What the backtests recorded on 2026-11-21 (tools/signal-backtest/quoted_figures.json on that day), the long-history
 * test of the day after, and the take-profit test of 2026-11-25.
 */
function recorded() {
  return {
    summary: {
      dipPercent: 15, stocks: 636, dips: 10499, firstBuy: '2023-05-26', lastBuy: '2026-05-22',
      everyDip: {n: 10499, mean: 10.009, median: 4.5789, up: 0.5736, fell20: 0.2419},
      dipBuy: {n: 2925, mean: 12.1433, median: 4.7832, up: 0.5627, fell20: 0.3285},
      notGrowing: {n: 7574, mean: 9.1847, median: 4.5497, up: 0.5778, fell20: 0.2085},
      gap: {mean: 2.1498, low: 0.2185, high: 4.257, pNoEdge: 0.0355},
      sp500: {mean: 10.7888, beat: 0.4229},
      lowIn13Weeks: -13.014, depthP95: 57.0908, volatilityP95: 78.8762, worstTenth: 32.2667, bestTenth: 63.399,
    },
    fresh: {
      stocks: 234, dipBuys: 1604, firstBuy: '2023-05-26', lastBuy: '2026-05-22',
      everyDip: 12.1584, growing: 11.9765, holding: 11.9765, withStop: 7.0553, stopped: 0.533,
      fellVolatile: 0.413, fellCalm: 0.2098, volatileFrom: 45, calmBelow: 35, stopPercent: 20,
      verdicts: {H1: 'FAIL', H2: 'PASS', H3: 'PASS', H4: 'FAIL'},
      cases: {
        volatile: {n: 1012, stocks: 100, bad: 41.1127, typical: 2.4186, good: 84.852},
        middle: {n: 387, stocks: 74, bad: 30.6217, typical: -0.0687, good: 56.2241},
        calm: {n: 205, stocks: 55, bad: 23.5361, typical: 4.0764, good: 41.2845},
      },
    },
    regime: {
      stocks: 424, fromYear: 1994, toYear: 2022, growing: 10.9874, others: 13.4836, gap: -2.2546,
      pGapNotPositive: 0.8785, gap2000to2002: -0.1778, gap2020to2022: -10.9359, verdict: 'FAIL',
    },
    plan: {
      holdWeeks: 26, minTrades: 5, positions: 766, stocks: 339, firstMonth: '2023-08', lastMonth: '2026-05',
      months: 33, monthsUp: 24, monthsBeat: 20, worst: -18.7338, median: 11.6295, best: 33.5918, together: 12.988,
      sp500: {monthsUp: 29, worst: -6.4148, median: 10.5139, best: 26.6653, together: 11.0254},
      baskets: {'1': {up: 0.5877, beat: 0.4567, months: 33}, '5': {up: 0.6995, beat: 0.4775, months: 33}, '10': {up: 0.7999, beat: 0.5424, months: 30}},
    },
    sixth: {
      stocks: 184, dipBuys: 966, dipBuyStocks: 97, firstBuy: '2022-10-28', lastBuy: '2026-05-22',
      sharpFallPercent: 25, sharpWeeks: 13, takeProfitPercent: 25,
      verdicts: {P1: 'PASS', P2: 'PASS', P3: 'KEEP'},
      buyFirst: {
        sharpRows: 162, sharpStocks: 55, sharp: 48.8646, rest: 14.3843, sharpMedian: 6.4791, restMedian: -0.1454,
        sharpFell: 0.4753, restFell: 0.4478, gap: 33.9962, pNoGap: 0.0045,
        weeksCompared: 34, aheadWeeks: 0.4706, typicalWeekGap: -3.8412,
      },
      takeProfit: {holding: 20.1667, holdingMedian: 1.2086, withTakeProfit: 7.3911, soldEarly: 0.6097, gap: 12.6416, pNoGap: 0.0025},
      afterHolding: {rows: 708, stocks: 88, stay: 16.0527, sp500: 7.4233, excess: 8.5709, medianExcess: -5.1712, beat: 0.4477, pNotBetter: 0.048, pNotWorse: 0.952},
    },
    seventh: {
      stocks: 202, dipBuys: 775, dipBuyStocks: 117, firstBuy: '2022-06-03', lastBuy: '2026-05-22',
      verdicts: {G1: 'PASS', G2: 'FAIL', G3: 'INCONCLUSIVE', G4: 'FAIL', G5: 'PASS', G5a: 'PASS', G5b: 'PASS'},
      profit: {mean: 9.3334, median: 3.5964, up: 0.5587, pNoProfit: 0, worstTenth: -30.5243, bestTenth: 53.1311},
      market: {dipBuy: 9.3334, sp500: 10.1527, excess: -0.8193, medianExcess: -6.6469, pNoEdge: 0.647, beat: 0.4077},
      several: {months: 23, monthsUp: 15, monthsBeat: 8, together: 7.6893, sp500Together: 10.3147, one: 0.5795, five: 0.6667, ten: 0.553, tenMonths: 10},
      secondHalf: {rows: 609, stocks: 99, stay: 9.3599, sp500: 7.6575, excess: 1.6579, medianExcess: -1.9971, pNotBetter: 0.3135, pNotWorse: 0.6865, beat: 0.4729},
      sellingEarly: {holding: 9.3334, holdingMedian: 3.5964, withTakeProfit: 5.4562, pTake: 0.0155, soldEarly: 0.4529, withStop: 6.5325, pStop: 0.001, stopped: 0.4219},
    },
    sentiment: {
      stocks: 424, fromYear: 1994, toYear: 2026, vixHigh: 25, episodes: 16,
      high: {n: 14089, mean: 20.4137, median: 14.1248, up: 0.7084, fell20: 0.1535},
      low: {n: 26765, mean: 7.2881, median: 5.2257, up: 0.5814, fell20: 0.1669},
    },
    // Recorded on 2026-11-22 by backtest_several.py (pre-registered #8): three stocks that dropped against one alone.
    several: {
      stocks: 618, dips: 58771, months: 388, years: 33, fromYear: 1994, toYear: 2026, together: 3, minCandidates: 10,
      one: {mean: 8.7677, typical: 3.8012, bad: -32.549, up: 0.5556, lost20: 0.1945, beat: 0.4719},
      several: {mean: 8.608, typical: 5.2614, bad: -21.6706, up: 0.6015, lost20: 0.1137, beat: 0.4969},
      others: {
        '2': {mean: 8.7359, typical: 4.8282, bad: -25.0785, up: 0.5825, lost20: 0.1418, beat: 0.486},
        '5': {mean: 8.542, typical: 5.9439, bad: -18.5447, up: 0.6271, lost20: 0.089, beat: 0.5129},
        '10': {mean: 8.668, typical: 6.7723, bad: -14.9642, up: 0.6625, lost20: 0.0652, beat: 0.5413},
      },
      market: {mean: 5.0213, typical: 5.538, bad: -7.9711, up: 0.7474},
      gap: {typical: 1.4602, bad: 10.8784, pTypical: 0, pBad: 0},
      halves: [{fromYear: 1994, toYear: 2009, typical: 1.4679, bad: 11.169}, {fromYear: 2010, toYear: 2026, typical: 1.4164, bad: 10.6557}],
      falling: {
        months: 98, typical: 1.0462, bad: 12.1363,
        one: {mean: -8.4951, typical: -11.2168, bad: -48.895, up: 0.3345, lost20: 0.3743},
        several: {mean: -8.4483, typical: -10.1706, bad: -36.7587, up: 0.3074, lost20: 0.3173},
      },
      verdicts: {S1: 'PASS', S2: 'PASS'},
    },
    // Recorded on 2026-11-25 by backtest_validation6.py (pre-registered #9, the eighth list): taking a profit at +15% and
    // +25%, by a sell order placed in advance and by a sale once the level is seen at a week's close.
    eighth: {
      symbols: 202, stocks: 201, withPrices: 201, withEarnings: 197, withRows: 195, dipBuys: 797, dipBuyStocks: 109, firstBuy: '2022-08-12', lastBuy: '2026-05-29', marketRose: 91.4508,
      verdicts: {order15: 'PASS', order25: 'FAIL', seen15: 'PASS', seen25: 'FAIL'},
      lookingLessOften: {15: {2: {badCase: -29.3737, lossRate: 30.9912, mean: 6.4321}, 4: {badCase: -29.9325, lossRate: 32.6223, mean: 6.9178}}, 25: {2: {badCase: -30.7172, lossRate: 37.5157, mean: 7.198}, 4: {badCase: -30.8183, lossRate: 38.2685, mean: 7.4278}}},
      holding: {badCase: -31.786, lossRate: 41.6562, lostFifth: 17.1895, mean: 10.6378, median: 5.5874},
      takeProfit: {
        seen: {
          15: {
            averageLower: 4.2043, badCase: -28.2741, lossRate: 29.4856, lostFifth: 13.2999, lowerOnThisList: true, mean: 6.4335, median: 15.8912, soldEarly: 59.9749, verdict: 'PASS',
            lossRarer: {gap: 12.1706, halfMark: 2.5, halves: [11.8687, 12.4688], high: 15.7895, low: 8.7209, mark: 5, pDecides: true, pUnderMarkByQuarter: 0.0, pUnderMarkByStock: 0.0, passed: true},
            badCaseMilder: {gap: 3.5119, halfMark: 1, halves: [5.9978, 3.4741], high: 7.4415, low: 1.2134, mark: 2, pDecides: false, pUnderMarkByQuarter: 0.12, pUnderMarkByStock: 0.1095, passed: true},
            whenReached: {badCaseWhenKept: -13.3682, lossWhenKept: 20.2929, meanWhenKept: 27.4847, meanWhenSold: 20.4747, medianWhenKept: 21.1225, share: 59.9749},
          },
          25: {
            averageLower: 3.3725, badCase: -30.5078, lossRate: 36.3864, lostFifth: 15.3074, lowerOnThisList: true, mean: 7.2653, median: 10.5832, soldEarly: 41.5307, verdict: 'FAIL',
            lossRarer: {gap: 5.2698, halfMark: 2.0, halves: [4.5455, 5.985], high: 7.093, low: 3.5019, mark: 4, pDecides: true, pUnderMarkByQuarter: 0.1155, pUnderMarkByStock: 0.115, passed: false},
            badCaseMilder: {gap: 1.2782, halfMark: 1, halves: [2.8234, 1.3198], high: 4.4867, low: 0.4973, mark: 2, pDecides: false, pUnderMarkByQuarter: 0.4635, pUnderMarkByStock: 0.4355, passed: false},
            whenReached: {badCaseWhenKept: -5.7433, lossWhenKept: 12.6888, meanWhenKept: 38.522, meanWhenSold: 30.4015, medianWhenKept: 31.0469, share: 41.5307},
          },
        },
        order: {
          15: {
            averageLower: 5.6458, badCase: -24.7193, lossRate: 24.7177, lostFifth: 11.4178, lowerOnThisList: true, mean: 4.992, median: 15, soldEarly: 68.7578, verdict: 'PASS',
            lossRarer: {gap: 16.9385, halfMark: 3.5, halves: [16.9192, 16.9576], high: 21.9764, low: 12.2785, mark: 7, pDecides: true, pUnderMarkByQuarter: 0.0, pUnderMarkByStock: 0.0, passed: true},
            badCaseMilder: {gap: 7.0666, halfMark: 1, halves: [10.7222, 6.4148], high: 12.7805, low: 3.2437, mark: 2, pDecides: false, pUnderMarkByQuarter: 0.019, pUnderMarkByStock: 0.0055, passed: true},
            whenReached: {badCaseWhenKept: -17.1165, lossWhenKept: 24.635, meanWhenKept: 23.2111, meanWhenSold: 15, medianWhenKept: 17.3492, share: 68.7578},
          },
          25: {
            averageLower: 4.3567, badCase: -29.9253, lossRate: 34.128, lostFifth: 14.5546, lowerOnThisList: true, mean: 6.2811, median: 15.5685, soldEarly: 48.0552, verdict: 'FAIL',
            lossRarer: {gap: 7.5282, halfMark: 2.0, halves: [7.0707, 7.98], high: 9.8814, low: 5.2071, mark: 4, pDecides: true, pUnderMarkByQuarter: 0.0045, pUnderMarkByStock: 0.0025, passed: true},
            badCaseMilder: {gap: 1.8607, halfMark: 1, halves: [3.6695, 1.5168], high: 5.1122, low: 0.7459, mark: 2, pDecides: false, pUnderMarkByQuarter: 0.3325, pUnderMarkByStock: 0.336, passed: false},
            whenReached: {badCaseWhenKept: -9.2626, lossWhenKept: 15.6658, meanWhenKept: 34.066, meanWhenSold: 25, medianWhenKept: 28.3439, share: 48.0552},
          },
        },
      },
    },
  };
}

module.exports = {recorded};
