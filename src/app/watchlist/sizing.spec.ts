import {casesFor, DEFAULT_LIMIT_PERCENT, lossBudget, riskOf, shareThatFits, sizeForBudget, summarize, TestedCases, volatilityGroup} from "./sizing";
import {computeSignal} from "./signal";
import {viewOf} from "./positions";
import {flatCloses, makeStock, NOW, reportedQuarters, weeklyPattern} from "./testing/fixtures";
import {FIGURES_2026_11_21} from "./testing/figures";

const TODAY = '2026-11-21';
/** The tested results by volatility group, as recorded on 2026-11-21. */
const CASES = FIGURES_2026_11_21.cases;
const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
const CALM: TestedCases = {group: 'calm', lossPercent: 24, typicalPercent: 4.1, gainPercent: 41};

function growing(below: number, weeklyReturns?: number[]) {
  return makeStock({
    price: 100 - below, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
    closes: weeklyReturns ? weeklyPattern(250, weeklyReturns) : flatCloses(250, 100 - below),
  });
}

describe('volatilityGroup', () => {
  it('puts 45% a year and above in "volatile", under 35% in "calm", the rest in "middle"', () => {
    expect([60, 45, 44.9, 35, 34.9, 10].map(volatilityGroup)).toEqual(['volatile', 'volatile', 'middle', 'middle', 'calm', 'calm']);
  });
});

describe('casesFor (what tested DIP BUYs of that volatility did over 26 weeks: worst tenth, typical, best tenth)', () => {
  it('is a 41% loss, +2.4% and an 85% gain for a volatile DIP BUY', () => {
    expect(casesFor(computeSignal(growing(20, [0.10, -1 / 11]), NOW), CASES)).toEqual(VOLATILE);
  });

  it('is a 31% loss, -0.1% and a 56% gain for a DIP BUY between the two tested groups', () => {
    expect(casesFor(computeSignal(growing(20, [0.057, -0.0539]), NOW), CASES))
      .toEqual({group: 'middle', lossPercent: 31, typicalPercent: -0.1, gainPercent: 56});
  });

  it('is a 24% loss, +4.1% and a 41% gain for a calm DIP BUY', () => {
    expect(casesFor(computeSignal(growing(20), NOW), CASES)).toEqual(CALM);
  });

  it('is unknown for a WATCH: the cases were measured on DIP BUYs only', () => {
    expect(casesFor(computeSignal(growing(5), NOW), CASES)).toBeUndefined();
  });

  it('is unknown without a verdict', () => {
    expect(casesFor(null, CASES)).toBeUndefined();
  });

  it("uses the app's own tested figures when none are given", () => {
    expect(casesFor(computeSignal(growing(20), NOW))!.lossPercent).toBeGreaterThan(0);
  });
});

describe('lossBudget', () => {
  it('is the chosen share of the portfolio value, in dollars', () => {
    expect(lossBudget(1, 100_000)).toBe(1000);
  });

  it('is unknown until there is both a percentage and a portfolio value', () => {
    expect(lossBudget(undefined, 100_000)).toBeUndefined();
    expect(lossBudget(1, undefined)).toBeUndefined();
    expect(lossBudget(1, 0)).toBeUndefined();
  });
});

describe('sizeForBudget', () => {
  it('is the position that loses exactly the budget in the bad case, in whole shares rounded down', () => {
    // A 1,000 budget and a 41% bad case: 1,000 / 0.41 = 2,439.02; at 125.53 a share that is 19 shares.
    const size = sizeForBudget(1000, 41, 125.53)!;
    expect(size.dollars).toBeCloseTo(2439.02, 2);
    expect(size.shares).toBe(19);
  });

  it('gives a bigger position for a calmer stock with the same budget', () => {
    expect(sizeForBudget(1000, 24, 50)!.dollars).toBeCloseTo(4166.67, 2);
  });

  it('is unknown without a budget, a bad case or a price', () => {
    expect(sizeForBudget(undefined, 41, 100)).toBeUndefined();
    expect(sizeForBudget(1000, undefined, 100)).toBeUndefined();
    expect(sizeForBudget(1000, 41, undefined)).toBeUndefined();
    expect(sizeForBudget(1000, 0, 100)).toBeUndefined();
  });
});

describe('riskOf (what the tested cases would mean for a position already held)', () => {
  const view = viewOf({symbol: 'NVDA', shares: 30, price: 100, day: TODAY}, {price: 100, portfolioValue: 100_000, today: TODAY});

  it('is the position value times the bad-case loss, with its share of the portfolio', () => {
    const risk = riskOf(view, VOLATILE, 1000, 100_000)!;
    expect(risk.loss).toBeCloseTo(1230, 6);              // 3,000 x 41%
    expect(risk.ofPortfolioPercent).toBeCloseTo(1.23, 6);
  });

  it('gives the good case and the typical result in dollars too, so the bad case is not shown alone', () => {
    const risk = riskOf(view, VOLATILE, 1000, 100_000)!;
    expect(risk.gain).toBeCloseTo(2550, 6);              // 3,000 x 85%
    expect(risk.typical).toBeCloseTo(72, 6);             // 3,000 x 2.4%
  });

  it('flags a position whose bad case is larger than the loss budget', () => {
    expect(riskOf(view, VOLATILE, 1000, 100_000)!.overBudget).toBe(true);
    expect(riskOf(view, CALM, 1000, 100_000)!.overBudget).toBe(false);   // 720 < 1,000
  });

  it('does not flag one that is over by less than a tenth: prices move that much in days', () => {
    expect(riskOf(view, VOLATILE, 1150, 100_000)!.overBudget).toBe(false);   // 1,230 against 1,150 + a tenth
    expect(riskOf(view, VOLATILE, 1100, 100_000)!.overBudget).toBe(true);    // 1,230 against 1,100 + a tenth
  });

  it('does not judge the budget when none is set', () => {
    expect(riskOf(view, VOLATILE, undefined, 100_000)!.overBudget).toBeUndefined();
  });

  it('is unknown without tested cases or a current value', () => {
    expect(riskOf(view, undefined, 1000, 100_000)).toBeUndefined();
    const unpriced = viewOf({symbol: 'XYZ', shares: 1, price: 1, day: TODAY}, {today: TODAY});
    expect(riskOf(unpriced, CALM, 1000, 100_000)).toBeUndefined();
  });
});

describe('summarize', () => {
  const nvda = viewOf({symbol: 'NVDA', shares: 30, price: 100, day: TODAY}, {price: 90, portfolioValue: 100_000, today: TODAY});   // cost 3,000, value 2,700
  const vgt = viewOf({symbol: 'VGT', shares: 10, price: 100, day: TODAY}, {price: 110, portfolioValue: 100_000, today: TODAY});    // cost 1,000, value 1,100
  const gone = viewOf({symbol: 'GONE', shares: 5, price: 20, day: TODAY}, {today: TODAY});                                          // no price

  it('totals cost, value and result over the positions that have a price, and names those that do not', () => {
    const summary = summarize([nvda, vgt, gone], new Map(), 100_000);
    expect(summary.count).toBe(3);
    expect(summary.value).toBe(3800);
    expect(summary.gain).toBe(-200);                         // 3,800 against a cost of 4,000
    expect(summary.gainPercent).toBeCloseTo(-5, 6);
    expect(summary.unpriced).toEqual(['GONE']);
  });

  it('adds up the bad cases of the holdings that have one, as if they all happened together', () => {
    const risks = new Map([['NVDA', riskOf(nvda, VOLATILE, undefined, 100_000)!]]);   // 2,700 x 41%
    const summary = summarize([nvda, vgt], risks, 100_000);
    expect(summary.togetherLoss).toBeCloseTo(1107, 6);
    expect(summary.togetherPercent).toBeCloseTo(1.107, 6);
    expect(summary.togetherCount).toBe(1);
  });

  it('adds up their good cases the same way', () => {
    const risks = new Map([['NVDA', riskOf(nvda, VOLATILE, undefined, 100_000)!]]);   // 2,700 x 85%
    expect(summarize([nvda, vgt], risks, 100_000).togetherGain).toBeCloseTo(2295, 6);
  });

  it('puts the bad cases on top of the result so far: where the holdings would stand, counted from what was paid', () => {
    const risks = new Map([['NVDA', riskOf(nvda, VOLATILE, undefined, 100_000)!]]);   // a bad case of 1,107
    const summary = summarize([nvda, vgt, gone], risks, 100_000);
    expect(summary.sinceBoughtIfBad).toBeCloseTo(-1307, 6);            // −200 so far, then −1,107
    expect(summary.sinceBoughtIfBadPercent).toBeCloseTo(-32.675, 6);   // of the 4,000 paid for the two that have a price
  });

  it('puts the good cases on top of it the same way', () => {
    const risks = new Map([['NVDA', riskOf(nvda, VOLATILE, undefined, 100_000)!]]);   // a good case of 2,295
    const summary = summarize([nvda, vgt, gone], risks, 100_000);
    expect(summary.sinceBoughtIfGood).toBeCloseTo(2095, 6);            // −200 so far, then +2,295
    expect(summary.sinceBoughtIfGoodPercent).toBeCloseTo(52.375, 6);   // of the same 4,000
  });

  it('has no totals to show for an empty portfolio', () => {
    const summary = summarize([], new Map(), 100_000);
    expect(summary.count).toBe(0);
    expect(summary.value).toBeUndefined();
    expect(summary.togetherLoss).toBeUndefined();
    expect(summary.togetherGain).toBeUndefined();
  });
});

describe('the starting limit (used until the user enters their own)', () => {
  it('is 10% of the portfolio: the value the user chose for it', () => {
    expect(DEFAULT_LIMIT_PERCENT).toBe(10);
    expect(lossBudget(DEFAULT_LIMIT_PERCENT, 100_000)).toBe(10_000);
  });

  it('says how much of the portfolio that lets into one stock, from the tested bad case', () => {
    // The worst 1 in 10 of the stocks whose price swings a lot lost 41% in tests: 10% / 41% is about a quarter.
    expect(shareThatFits(10, 41)).toBe(24);
    expect(shareThatFits(4, 41)).toBe(10);
    expect(shareThatFits(50, 24)).withContext('never more than everything').toBe(100);
  });
});
