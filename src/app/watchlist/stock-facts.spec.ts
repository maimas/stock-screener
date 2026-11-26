import {costDistributionFor} from "./market-math";
import {computeSignal} from "./signal";
import {FACT_COLUMNS, FACT_HELP, FACTS_NOTE, factsOf} from "./stock-facts";
import {flatCloses, makeStock, NOW, reportedQuarters, weeklyPattern} from "./testing/fixtures";

// The owner of the page asked to see, in "Could add", how far each stock dropped, how it grows, what analysts
// expect and how many of its owners are in profit. Each is a short cell; its sentence shows under the pointer.
describe('factsOf (what a row of "Could add" says about the stock itself)', () => {
  /** A made-up company: sales up 20% on a year ago, the price 20% below its highest, analysts' middle target at 120. */
  const stock = makeStock({
    symbol: 'ACME', price: 80, high52: 100, medianTarget: 120,
    quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
  });
  const facts = factsOf(stock, computeSignal(stock, NOW))!;

  it('says how far the price dropped as a whole percent, and where from under the pointer', () => {
    expect(facts.dropped).toBe('−20%');
    expect(facts.droppedTip).toBe('20.0% below its highest price of the past year.');
  });

  it('says the growth figure the mark rests on, and both figures under the pointer', () => {
    expect(facts.growing).toBe('sales +20%');
    expect(facts.growingTip).toMatch(/^Expected profit per share .+, sales \+20\.0% on a year ago\.$/);
  });

  it('says how far analysts\' middle target is from the price, and under the pointer that it cannot be tested', () => {
    expect(facts.target).toBe('+50%');
    expect(facts.targetTip).toBe("Analysts' middle price target is 120.00 (+50.0% from here; cannot be tested: no history of targets).");
  });

  it('says a target below the price with a minus sign, and one at the price without a sign', () => {
    const below = makeStock({...specOf(76)});
    const level = makeStock({...specOf(80)});
    expect(factsOf(below, computeSignal(below, NOW))!.target).toBe('−5%');
    expect(factsOf(level, computeSignal(level, NOW))!.target).toBe('0%');
  });

  it('says how many of its owners are in profit as a whole percent, and what they paid under the pointer', () => {
    // What owners paid is estimated from a year of prices that moved and from how many shares there are.
    const traded = makeStock({
      price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
      closes: weeklyPattern(250, [0.02, -0.02], 80),
    });
    Object.assign(traded.equity.analysis.shareStatistics, {sharesOutstanding: 50_000_000});
    const cost = costDistributionFor(traded)!;
    const known = factsOf(traded, computeSignal(traded, NOW))!;
    expect(known.holders).toBe(`${cost.profitRatio.toFixed(0)}%`);
    expect(known.holdersTip).toContain(`${cost.profitRatio.toFixed(1)}% of its owners are in profit; the average owner paid `);
    expect(known.holdersTip.endsWith('.')).toBeTrue();
    expect(known.holdersTip.charAt(0)).withContext('a sentence of its own').toBe(known.holdersTip.charAt(0).toUpperCase());
    // The stock above never moved: nothing can be estimated, and the cell stays empty.
    expect([facts.holders, facts.holdersTip]).toEqual(['', '']);
  });

  it('leaves a cell empty when the page does not know the fact', () => {
    const bare = makeStock({price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80)});
    const known = factsOf(bare, computeSignal(bare, NOW))!;
    expect([known.target, known.targetTip]).withContext('no price target on record').toEqual(['', '']);
  });

  it('has nothing to say about a stock the page cannot judge', () => {
    const young = makeStock({quarters: reportedQuarters(1), closes: flatCloses(2)});
    expect(factsOf(young, computeSignal(young, NOW))).toBeUndefined();
    expect(factsOf(undefined)).toBeUndefined();
  });

  it('names the four columns, and says of each what it is', () => {
    expect(FACT_COLUMNS).toEqual({dropped: 'Dropped', growing: 'Growing', target: 'Analyst target', holders: 'Holders in profit'});
    expect(FACT_HELP.dropped).toBe('How far the price is below its highest of the past year. A stock is marked DIP BUY from 15% down.');
    expect(FACT_HELP.target).toContain('Context only');
    expect(FACT_HELP.holders).toContain('Context only: it made no difference in tests.');
  });

  // Principle of the page: tested, or said to be untested. Two of the four are context, and the box says so.
  it('says under the table which two the mark rests on, and that the other two are no reason to pick', () => {
    expect(FACTS_NOTE).toBe(
      '"Dropped" and "Growing" are what the DIP BUY mark rests on. "Analyst target" cannot be tested yet and ' +
      '"Holders in profit" made no difference in tests: they are context, not a tested reason to pick one.');
  });

  function specOf(medianTarget: number) {
    return {
      price: 80, high52: 100, medianTarget,
      quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
    };
  }
});
