import {planFor, PlanContext} from "./portfolio-plan";
import {PlanStep, toDoVerbs} from "./plan";
import {money} from "./format";
import {fitBrief, sizeLabel, toSell} from "./recommendations";
import {Portfolio, Position} from "./positions";
import {emptyLog, SnapshotLog} from "./snapshot-log";
import {FIGURES_2026_11_21, FIGURES_WITH_TAKE_PROFIT} from "./testing/figures";
import {flatCloses, makeStock, NOW, reportedQuarters} from "./testing/fixtures";
import {Stock} from "../api/microsoft-money.service";

const TODAY = '2026-11-21';

/**
 * A company whose sales are 20% up on a year ago, `below` % under its highest price of the past year: marked
 * DIP BUY from 15% down, WATCH above that. Its price has not moved for a year, so it counts as calm: in the fixed
 * figures 1 in 10 such stocks lost 24% or more.
 */
function growing(symbol: string, below: number): Stock {
  return makeStock({
    symbol, price: 100 - below, high52: 100,
    quarters: reportedQuarters(9, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(300, 100 - below),
  });
}

/** NVDA and AMD are marked DIP BUY (at 80), AAPL is marked WATCH (at 95). */
const STOCKS = new Map<string, Stock>([['NVDA', growing('NVDA', 20)], ['AMD', growing('AMD', 20)], ['AAPL', growing('AAPL', 5)]]);

function context(o: Partial<PlanContext> = {}): PlanContext {
  return {stocks: STOCKS, today: TODAY, log: emptyLog(), now: NOW, figures: FIGURES_2026_11_21, ...o};
}

function portfolio(positions: Position[], o: { cash?: number, limit?: number } = {}): Portfolio {
  return {
    v: 1, cash: o.cash, lossBudgetPercent: o.limit ?? 10,
    positions: Object.fromEntries(positions.map(it => [it.symbol, it])),
  };
}

const kinds = (steps: PlanStep[]) => steps.map(it => it.kind);
const step = (steps: PlanStep[], kind: PlanStep['kind']) => steps.find(it => it.kind === kind)!;

describe('planFor (the plan for one portfolio, from what the page knows today)', () => {
  // The level the user picked for taking a profit is one of the portfolio's settings: the plan is told it.
  it('hands the plan the level the portfolio is to take a profit at', () => {
    // Bought at 60 five weeks ago (a Saturday: no real purchase has that day), when the log marked it DIP BUY; it is at
    // 80 now: up a third.
    const log: SnapshotLog = {...emptyLog(), days: {'2026-10-17': {s: {NVDA: {v: 'D'}}}}} as unknown as SnapshotLog;
    const held = {...portfolio([{symbol: 'NVDA', shares: 10, price: 60, day: '2026-10-17'}], {cash: 5000}), takeProfitPercent: 15};
    const withLevel = planFor(held, context({log, figures: FIGURES_WITH_TAKE_PROFIT}));
    expect(step(withLevel.steps, 'level').items).toEqual([{symbol: 'NVDA', label: 'up 33%'}]);
    expect(kinds(planFor({...held, takeProfitPercent: undefined}, context({log, figures: FIGURES_WITH_TAKE_PROFIT})).steps)).not.toContain('level');
  });

  it('keeps what the portfolio owns and sizes the other stocks marked DIP BUY for it, as shares of what it is worth', () => {
    // 10 NVDA at 80 = 800, plus 5,000 in cash: worth 5,800. The limit, 10%, is 580; of a calm stock 2,417 would fit.
    const plan = planFor(portfolio([{symbol: 'NVDA', shares: 10, price: 100}], {cash: 5000}), context());
    expect(plan.view.portfolioValue).toBe(5800);
    expect(kinds(plan.steps)).toEqual(['buy', 'spread', 'hold']);
    expect(step(plan.steps, 'buy').text).toBe('1 stock could be added: see "Could add" for its size.');
    expect(step(plan.steps, 'buy').items).withContext('the line lists no stock').toEqual([]);
    // AMD beside NVDA, both calm, split as if there were three stocks (the third counts as one in between):
    // 31 / 86 of the portfolio, $2,091. In a bad half-year (24%) that would cost $502.
    expect(plan.recommendations.map(it => it.symbol)).toEqual(['AMD']);
    expect(sizeLabel(plan.recommendations[0].size!)).toBe('36.0% ($2,091)');
    expect(plan.recommendations[0].size!.loss).toBeCloseTo(501.77, 2);
    // NVDA's own share is 31 / 79 of the portfolio, $2,276; $800 of it is held.
    expect(plan.additions.map(it => it.symbol)).toEqual(['NVDA']);
    expect(step(plan.steps, 'buy').inRows).toEqual([{symbol: 'NVDA', label: 'add 25.4% ($1,476)'}]);
    expect(step(plan.steps, 'hold').items).toEqual([{symbol: 'NVDA'}]);
  });

  it('says what the portfolio already holds that is like each of them', () => {
    const plan = planFor(portfolio([{symbol: 'NVDA', shares: 10, price: 100}], {cash: 5000}), context());
    expect(fitBrief(plan.recommendations[0].fit).sector).toBe('Technology (1)');
    expect(planFor(portfolio([], {cash: 1000}), context()).recommendations[0].fit).withContext('nothing held').toBeUndefined();
  });

  it('hands on what its sizes were worked out from, for "Could add" to split the cash between the stocks ticked', () => {
    // The same portfolio: 800 in NVDA and 5,000 in cash.
    const plan = planFor(portfolio([{symbol: 'NVDA', shares: 10, price: 100}], {cash: 5000}), context());
    expect(plan.sizing!.portfolioValue).toBe(5800);
    expect(plan.sizing!.limitPercent).toBe(10);
    expect(plan.sizing!.holdings.map(it => [it.symbol, it.value, it.cases?.lossPercent])).toEqual([['NVDA', 800, 24]]);
    expect(planFor({v: 1, positions: {}}, context()).sizing).withContext('worth nothing: nothing to take a share of').toBeUndefined();
  });

  it('says HOLD BACK while the cash is under the share the portfolio is to keep outside stocks', () => {
    // 10 NVDA at 80 = 800, plus 200 in cash: worth 1,000, of which a half, 500, is to stay outside stocks.
    const short = {...portfolio([{symbol: 'NVDA', shares: 10, price: 100}], {cash: 200}), reservePercent: 50};
    expect(step(planFor(short, context()).steps, 'reserve').text).toBe('You set 50% to keep outside stocks; your cash is 20.0%: $300 short.');
    // With 800 in cash it is worth 1,600, and the cash is the half of it.
    expect(kinds(planFor({...short, cash: 800}, context()).steps)).withContext('the cash covers it').not.toContain('reserve');
    expect(kinds(planFor({...short, reservePercent: undefined}, context()).steps)).withContext('no share set').not.toContain('reserve');
  });

  // One rule said in two places: SELL SOME on the plan card, and the line about selling in "Could add", which works
  // it out again from what the sizes are worked out from. The two have to name the same stocks and amounts.
  it('gives "Could add" the same stocks to sell some of as SELL SOME names, with the same amounts to keep', () => {
    // 100 NVDA at 80 = 8,000, plus 2,000 in cash: worth 10,000. The limit, 10%, is 1,000. A calm stock could lose
    // 24%: 1,920 on 8,000. 4,167 of it fits the limit.
    const plan = planFor(portfolio([{symbol: 'NVDA', shares: 100, price: 100}], {cash: 2000}), context());
    expect(step(plan.steps, 'trim').items).toEqual([{symbol: 'NVDA', label: 'keep $4,167'}]);
    const sell = toSell(plan.sizing);
    expect(step(plan.steps, 'trim').items).toEqual(sell.map(it => ({symbol: it.symbol, label: `keep ${money(it.keep)}`})));
    expect(sell[0].free).toBeCloseTo(8000 - 1000 / 0.24, 6);

    // Worth 10,000 again, with 57 and with 58 shares: a bad half-year would cost 1,094 and 1,114. The plan lets a
    // stock be over the limit by a tenth (1,100), and so does the box.
    const holding = (shares: number) => planFor(portfolio([{symbol: 'NVDA', shares, price: 100}], {cash: 10_000 - shares * 80}), context());
    expect([kinds(holding(57).steps).includes('trim'), toSell(holding(57).sizing).length]).toEqual([false, 0]);
    expect([kinds(holding(58).steps).includes('trim'), toSell(holding(58).sizing).length]).toEqual([true, 1]);

    // Two marked stocks over the limit, and beside them the biggest holding of all, which has no mark: 100 NVDA
    // (8,000), 80 AMD (6,400), 100 AAPL at 95 (9,500) and 2,100 in cash, worth 26,000. The limit, 5%, is 1,300: a
    // bad half-year would cost 1,920 on NVDA and 1,536 on AMD, and 5,417 of each fits. The tests say nothing about
    // AAPL, so neither the plan nor the box names it, however big it is.
    const mixed = planFor(portfolio([
      {symbol: 'NVDA', shares: 100, price: 100}, {symbol: 'AMD', shares: 80, price: 100}, {symbol: 'AAPL', shares: 100, price: 90},
    ], {cash: 2100, limit: 5}), context());
    expect(step(mixed.steps, 'trim').items).toEqual([{symbol: 'AMD', label: 'keep $5,417'}, {symbol: 'NVDA', label: 'keep $5,417'}]);
    expect(step(mixed.steps, 'trim').items).toEqual(toSell(mixed.sizing).map(it => ({symbol: it.symbol, label: `keep ${money(it.keep)}`})));
  });

  it('works the first of them out in words, for "Could add" to show under its table', () => {
    // The same portfolio: worth 5,800, and AMD would take 31 / 86 of it beside NVDA, as one of three.
    const plan = planFor(portfolio([{symbol: 'NVDA', shares: 10, price: 100}], {cash: 5000}), context());
    expect(plan.reading!.title).toBe('For example, the first row: AMD');
    expect(plan.reading!.lines.map(it => it.label)).toEqual(['Size', 'Bad case', 'Typical', 'Good case']);
    expect(plan.reading!.lines[0].text).toBe(
      "$2,091 is 36.0% of what this portfolio is worth today ($5,800). With AMD it would hold 2 stocks, but the tests held 3 or " +
      "more: this is AMD's share as one of 3, if a bad half-year were to cost the same on each.");
    expect(plan.reading!.lines[1].text).toBe(
      'In tests, 1 in 10 stocks marked DIP BUY that swing as much as AMD lost 24% or more after 6 months. ' +
      'On $2,091 that is −$502, within the $580 you accept to lose on one stock.');
    expect(planFor({v: 1, positions: {}}, context()).reading).withContext('worth nothing: there is no size to work out').toBeUndefined();
  });

  it('sizes a stock for a portfolio that does not own it, also when another portfolio does', () => {
    // 1,000 in cash and nothing else: a calm stock would take 31 / 79 of it, $392. The limit (10%, so 417 of it) allows that.
    const plan = planFor(portfolio([], {cash: 1000}), context());
    expect(kinds(plan.steps)).toEqual(['buy', 'spread']);
    expect(step(plan.steps, 'buy').text).toBe('2 stocks could be added: see "Could add" for the size of each.');
    expect(plan.recommendations.map(it => [it.symbol, sizeLabel(it.size!)])).toEqual([['AMD', '39.2% ($392)'], ['NVDA', '39.2% ($392)']]);
    expect(plan.additions).toEqual([]);
  });

  it('stops a size at what fits the portfolio\'s limit', () => {
    // A limit of 5% of 1,000 is 50: only 208 of a calm stock fits, less than its equal share of the risk.
    const plan = planFor(portfolio([], {cash: 1000, limit: 5}), context());
    expect(plan.recommendations.map(it => [sizeLabel(it.size!), it.size!.capped])).toEqual([['20.8% ($208)', true], ['20.8% ($208)', true]]);
  });

  it('lists them without a size while the portfolio is worth nothing', () => {
    const plan = planFor({v: 1, positions: {}}, context());
    expect(plan.recommendations).toEqual([
      {symbol: 'AMD', cases: {group: 'calm', lossPercent: 24, typicalPercent: 4.1, gainPercent: 41}, fit: undefined},
      {symbol: 'NVDA', cases: {group: 'calm', lossPercent: 24, typicalPercent: 4.1, gainPercent: 41}, fit: undefined},
    ]);
  });

  it('recommends the same with cash or without: cash only counts in what the portfolio is worth', () => {
    // 10 NVDA at 80 = 800, plus 200 in cash: worth 1,000. AMD would take 31 / 86 of that.
    const withCash = planFor(portfolio([{symbol: 'NVDA', shares: 10, price: 100}], {cash: 200, limit: 50}), context());
    expect(sizeLabel(withCash.recommendations[0].size!)).toBe('36.0% ($360)');
    // No cash: the 800 in NVDA is all the portfolio is worth. The same share of it, and the same sentence.
    const none = planFor(portfolio([{symbol: 'NVDA', shares: 10, price: 100}], {cash: 0, limit: 50}), context());
    expect(kinds(none.steps)).toEqual(['buy', 'spread', 'hold']);
    expect(sizeLabel(none.recommendations[0].size!)).toBe('36.0% ($288)');
    expect(step(none.steps, 'buy').text).toBe(step(withCash.steps, 'buy').text);
    [...withCash.steps, ...none.steps].forEach(it => expect(it.text + it.why).withContext(it.verb).not.toMatch(/You have (no|\$)/));
  });

  it('says so when the limit is the app\'s starting one, and asks for the cash of a portfolio worth nothing', () => {
    const starting: Portfolio = {v: 1, cash: 1000, positions: {}};
    expect(kinds(planFor(starting, context()).steps)).toEqual(['setup', 'buy', 'spread']);
    expect(planFor(starting, context()).steps[0].verb).toBe('YOUR LIMIT');
    const empty: Portfolio = {v: 1, positions: {}};
    expect(planFor(empty, context()).steps[0].verb).toBe('START HERE');
  });

  it('passes on whether the market is fearful', () => {
    const {steps} = planFor(portfolio([], {cash: 1000}), context({fear: {vix: 35.9, high: true}}));
    expect(kinds(steps)).toEqual(['timing', 'buy', 'spread']);
  });
});

describe('planFor: was a holding marked DIP BUY on the day it was bought?', () => {
  /** AAPL is marked WATCH today, so the plan covers it only if it was a DIP BUY when bought. */
  const boughtOn = (day: string, price: number) => portfolio([{symbol: 'AAPL', shares: 10, price, day}], {cash: 1000});
  const logWith = (day: string, mark: 'D' | 'W' | 'P'): SnapshotLog => ({v: 1, days: {[day]: {s: {AAPL: {p: 95, v: mark}}}}});
  const owned = (steps: PlanStep[]) => steps.filter(it => ['hold', 'outside', 'review'].includes(it.kind)).map(it => [it.verb, it.items]);

  it('takes it from the daily log when that day is in it', () => {
    const {steps} = planFor(boughtOn('2026-10-12', 95), context({log: logWith('2026-10-12', 'D')}));
    expect(owned(steps)).toEqual([['KEEP', [{symbol: 'AAPL', label: 'week 6'}]]]);
  });

  it('has no opinion when the log says it was not, and the price paid was not a drop either', () => {
    const {steps} = planFor(boughtOn('2026-11-10', 95), context({log: logWith('2026-11-10', 'W')}));
    expect(owned(steps)).toEqual([['NO OPINION', [{symbol: 'AAPL'}]]]);
  });

  it('works it out from the price paid when the log does not know that day', () => {
    // The highest close of the year before is 95; 80 is 15.8% under it, and the growth was already reported.
    expect(owned(planFor(boughtOn('2026-11-10', 80), context()).steps)).toEqual([['KEEP', [{symbol: 'AAPL', label: 'week 2'}]]]);
    expect(owned(planFor(boughtOn('2026-11-10', 95), context()).steps)).toEqual([['NO OPINION', [{symbol: 'AAPL'}]]]);
  });

  it('lets a price paid that was a drop count, although the log read the stock at that day\'s close and saw none', () => {
    const {steps} = planFor(boughtOn('2026-11-10', 80), context({log: logWith('2026-11-10', 'W')}));
    expect(owned(steps)).toEqual([['KEEP', [{symbol: 'AAPL', label: 'week 2'}]]]);
  });
});

describe('planFor: what changed since the last day in the log', () => {
  it('puts it first, with the stocks that joined the ones to buy and those of the portfolio that passed 6 months', () => {
    const marks = (nvda: 'D' | 'W') => ({s: {NVDA: {p: 80, v: nvda}, AMD: {p: 80, v: 'D' as const}}});
    const log: SnapshotLog = {v: 1, days: {'2026-11-20': marks('W'), [TODAY]: marks('D')}};
    const held = portfolio([{symbol: 'AMD', shares: 10, price: 100, day: '2026-05-23'}], {cash: 1000});
    const {steps} = planFor(held, context({log}));
    expect(kinds(steps)[0]).toBe('news');
    expect(steps[0].items).toEqual([{symbol: 'AMD', label: 'held 6 months'}, {symbol: 'NVDA', label: 'new to buy'}]);
    expect(toDoVerbs(steps)).withContext('it asks for nothing by itself').toEqual(toDoVerbs(steps.slice(1)));
  });

  it('says nothing while the log has no earlier day', () => {
    expect(kinds(planFor(portfolio([], {cash: 1000}), context()).steps)).not.toContain('news');
  });
});

describe('planFor: which portfolio needs a look', () => {
  it('names for each portfolio what its own plan expects', () => {
    // 60 NVDA at 80 = 4,800 with a limit of 1% (48): in a bad half-year it could lose 1,152, far over the limit.
    const tooMuch = portfolio([{symbol: 'NVDA', shares: 60, price: 100}], {limit: 1});
    const withCash = portfolio([], {cash: 1000});
    const noCash = portfolio([{symbol: 'NVDA', shares: 10, price: 100}], {cash: 0, limit: 50});
    expect(kinds(planFor(tooMuch, context()).steps)).toEqual(['trim', 'buy', 'spread']);
    // What to buy is shown, and named, also for the portfolio with no cash.
    expect([tooMuch, withCash, noCash].map(it => toDoVerbs(planFor(it, context()).steps))).toEqual([['SELL SOME', 'BUY'], ['BUY'], ['BUY']]);
  });
});
