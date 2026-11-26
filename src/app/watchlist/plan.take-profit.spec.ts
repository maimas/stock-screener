import {asks, Holding, holdingPlans, Limit, planSteps, PlanInput, PlanStep, saidInRows, toDoVerbs} from "./plan";
import {PositionRow} from "./portfolio-view";
import {viewOf} from "./positions";
import {riskOf, TestedCases} from "./sizing";
import {Figures, TakeProfitWay, textsFor} from "./evidence";
import {FIGURES_2026_11_21, FIGURES_WITH_TAKE_PROFIT, TAKE_PROFIT_MADE_UP} from "./testing/figures";

const TODAY = '2026-11-21';
/** The take-profit test with made-up numbers: at +15% both ways passed, at +25% only the sell order. */
const F = FIGURES_WITH_TAKE_PROFIT;
const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
/** A 100,000 portfolio and the user's own limit of 1%: 1,000 on one stock. */
const BUDGET = 1000, PORTFOLIO = 100_000;
const OWN: Limit = {dollars: BUDGET, percent: 1, own: true};

type Spec = { verdict?: 'DIP BUY' | 'WATCH' | 'PASS', day?: string, shares?: number, paid?: number, boughtAsDipBuy?: boolean, noPrice?: boolean };

/** A holding of `shares` (10) bought at `paid` (100) and priced at `price` today. */
function holding(symbol: string, price: number, o: Spec = {}): Holding {
  const position = {symbol, shares: o.shares ?? 10, price: o.paid ?? 100, ...(o.day ? {day: o.day} : {})};
  const view = viewOf(position, {price: o.noPrice ? undefined : price, portfolioValue: PORTFOLIO, today: TODAY});
  const cases = o.verdict === 'DIP BUY' ? VOLATILE : undefined;
  const row: PositionRow = {symbol, view, verdict: o.verdict, cases, risk: riskOf(view, cases, BUDGET, PORTFOLIO)};
  return {row, boughtAsDipBuy: o.boughtAsDipBuy};
}

/** Bought as a DIP BUY seven weeks ago, no longer marked: the plan covers it for its 6 months. */
const kept = (symbol: string, price: number, o: Spec = {}) => holding(symbol, price, {verdict: 'WATCH', day: '2026-10-01', boughtAsDipBuy: true, ...o});

function steps(input: Partial<PlanInput>, figures = F): PlanStep[] {
  return planSteps({holdings: [], candidates: [], limit: OWN, ...input}, figures);
}

/** The made-up test with one way at +15% turned to "did not pass". */
function without(way: TakeProfitWay): Figures {
  const made = TAKE_PROFIT_MADE_UP;
  if (!made.decided) {
    throw new Error('the made-up test is a decided one');
  }
  return {...FIGURES_2026_11_21, eighth: {...made, [way]: {...made[way], 15: {...made[way][15], passed: false}}}};
}

const kinds = (list: PlanStep[]) => list.map(step => step.kind);
const step = (list: PlanStep[], kind: PlanStep['kind']) => list.find(it => it.kind === kind)!;
const symbols = (it: PlanStep) => it.items.map(item => item.symbol);

/**
 * A level of the user's own for taking a profit, among the levels that passed their test (pre-registered #9). As
 * written down before that test was run: the plan names a holding on a line of its own once its price is at the
 * level, and gives the price of a sell order at that level, to be placed in advance. Each reports and neither says
 * to sell; KEEP stays as it is, and nothing else in the plan changes.
 */
describe('planSteps with a level for taking a profit', () => {
  const up = kept('ACME', 118), under = kept('ZED', 110);

  it('is as before until a level is picked', () => {
    expect(kinds(steps({holdings: [up, under]}))).toEqual(['hold']);
  });

  it('names a holding that is up to the level on a line of its own, and leaves the decision to the user', () => {
    const list = steps({holdings: [up, under], takeProfit: {percent: 15}});
    expect(kinds(list)).toEqual(['level', 'order', 'hold']);
    const level = step(list, 'level');
    expect(level.verb).toBe('YOUR LEVEL');
    expect(level.text).toBe('Up 15% or more on what you paid: the level you set. Selling is your call.');
    expect(level.items).toEqual([{symbol: 'ACME', label: 'up 18%'}]);
  });

  // The line reports. It would stand under "To do today" on every day the stock stays up, and the only ways to
  // end that would be to sell or to take the level away: so it does not ask, like the line with the order's price.
  it('reports and does not ask: neither line is among what there is to do today', () => {
    const list = steps({holdings: [up, under], takeProfit: {percent: 15}});
    expect(asks(step(list, 'level'))).toBeFalse();
    expect(asks(step(list, 'order'))).toBeFalse();
    expect(toDoVerbs(list)).toEqual([]);
    expect(saidInRows(step(list, 'level'))).withContext('a line of the plan, not only a word in a row').toBeFalse();
    expect(saidInRows(step(list, 'order'))).toBeFalse();
  });

  it('leaves KEEP as it is: the holding at the level is still kept, with its week', () => {
    const list = steps({holdings: [up, under], takeProfit: {percent: 15}});
    expect(step(list, 'hold')).toEqual(step(steps({holdings: [up, under]}), 'hold'));
    expect(step(list, 'hold').items).toEqual([{symbol: 'ACME', label: 'week 8'}, {symbol: 'ZED', label: 'week 8'}]);
  });

  it('gives the price of a sell order at that level for the holdings still under it', () => {
    const order = step(steps({holdings: [up, under], takeProfit: {percent: 15}}), 'order');
    expect(order.verb).toBe('ORDER PRICE');
    expect(order.text).toBe('A sell order at +15% on what you paid, as you set. Placing it is your call.');
    expect(order.items).toEqual([{symbol: 'ZED', label: 'at $115.00'}]);
  });

  // An order at the printed price must never sell under the level: the price is rounded up to the next cent, and
  // a price under a dollar keeps four decimals, as brokers take them there.
  it('rounds the price of the order up, so that an order at the printed price is at the level or above', () => {
    const order = step(steps({
      takeProfit: {percent: 15},
      holdings: [kept('BIG', 2000, {paid: 1899}), kept('CENT', 2.1, {paid: 2.03}), kept('PENNY', 0.85, {paid: 0.83}), kept('ZED', 40, {paid: 37.41})],
    }), 'order');
    expect(order.items).toEqual([
      {symbol: 'BIG', label: 'at $2,183.85'}, {symbol: 'CENT', label: 'at $2.34'}, {symbol: 'PENNY', label: 'at $0.9545'},
      {symbol: 'ZED', label: 'at $43.03'},
    ]);
  });

  it('counts a holding from exactly the level, and says by how much it is up in whole percent, never more than it is', () => {
    const list = steps({holdings: [kept('AT', 115), kept('BELOW', 114.99), kept('FAR', 163.4), kept('NEAR', 118.7)], takeProfit: {percent: 15}});
    expect(step(list, 'level').items).toEqual([{symbol: 'AT', label: 'up 15%'}, {symbol: 'FAR', label: 'up 63%'}, {symbol: 'NEAR', label: 'up 18%'}]);
    expect(step(list, 'order').items).toEqual([{symbol: 'BELOW', label: 'at $115.00'}]);
  });

  it('applies to every holding bought as a DIP BUY that is inside its 6 months and has a price, and to no other', () => {
    const list = steps({
      takeProfit: {percent: 15},
      holdings: [
        kept('UNKNOWN', 130, {boughtAsDipBuy: undefined}),              // cannot be told how it was bought
        kept('OTHER', 130, {boughtAsDipBuy: false}),                    // not bought as a DIP BUY
        kept('OLD', 130, {day: '2026-01-10'}),                          // past its 6 months
        kept('NOPRICE', 130, {noPrice: true}),
        kept('UNDATED', 130, {day: undefined}),
        kept('MARKED', 130, {verdict: 'DIP BUY'}),                      // still marked DIP BUY, bought as one 7 weeks ago
      ],
    });
    expect(symbols(step(list, 'level'))).toEqual(['MARKED']);
    expect(kinds(list)).withContext('no other holding to give the price of an order for').not.toContain('order');
  });

  // Selling some of a holding that is over the limit and an order for the rest do not contradict each other: the
  // written rule says "every holding the plan covers", so one that SELL SOME names is not left out.
  it('also names a holding that is over the limit, beside SELL SOME', () => {
    const atLevel = steps({holdings: [kept('HUGE', 130, {verdict: 'DIP BUY', shares: 60})], takeProfit: {percent: 15}});
    expect(kinds(atLevel)).toEqual(['trim', 'level']);
    expect(symbols(step(atLevel, 'level'))).toEqual(['HUGE']);
    const below = steps({holdings: [kept('HUGE', 105, {verdict: 'DIP BUY', shares: 60})], takeProfit: {percent: 15}});
    expect(kinds(below)).toEqual(['trim', 'order']);
    expect(step(below, 'order').items).toEqual([{symbol: 'HUGE', label: 'at $115.00'}]);
  });

  // A level that passed only as a sell order: the plan gives the prices, also for a holding that is above its
  // price already, and has no line that names a holding.
  it('gives only what passed for the level: a sell order alone gives prices and names no holding', () => {
    const list = steps({holdings: [kept('ACME', 130), under], takeProfit: {percent: 25}});
    expect(kinds(list)).toEqual(['order', 'hold']);
    expect(step(list, 'order').text).toBe('A sell order at +25% on what you paid, as you set. Placing it is your call.');
    expect(step(list, 'order').items).toEqual([{symbol: 'ACME', label: 'at $125.00, under its price now'}, {symbol: 'ZED', label: 'at $125.00'}]);
  });

  it('gives only what passed for the level: selling once it is seen alone names the holding and gives no price', () => {
    const list = steps({holdings: [up, under], takeProfit: {percent: 15}}, without('order'));
    expect(kinds(list)).toEqual(['level', 'hold']);
    expect(symbols(step(list, 'level'))).toEqual(['ACME']);
  });

  it('gives no line for a level the tests do not offer, or while the take-profit test is not in the figures', () => {
    expect(kinds(steps({holdings: [up, under], takeProfit: {percent: 20}}))).toEqual(['hold']);
    expect(kinds(steps({holdings: [up, under], takeProfit: {percent: 15}}, FIGURES_2026_11_21))).toEqual(['hold']);
  });

  it('explains each line with both sides of the test, and says where the level is set and which stocks it counts for', () => {
    const list = steps({holdings: [up, under], takeProfit: {percent: 15}});
    const asSet = 'the level you set in the "Your plan today" box, under "Take a profit at". ' +
      'It counts for a stock you bought as a DIP BUY, in its first 6 months. ';
    const stillKeep = ' The plan still says KEEP: the level is your own, and so is the decision.';
    expect(step(list, 'level').why).toBe(
      'This stock is up 15% or more on the average price you paid: ' + asSet + textsFor(F).takeProfitWhy(15, 'seen') + stillKeep);
    expect(step(list, 'order').why).toBe(
      'The price given for each stock is 15% above the average price you paid for it, rounded up: ' + asSet +
      'A sell order here is one you leave with your broker to sell at that price or better: it waits until the price is reached ' +
      '(brokers call it a limit order). ' + textsFor(F).takeProfitWhy(15, 'order') +
      ' In that test an order stood for the 6 months and no longer.' + stillKeep);
    const two = steps({holdings: [up, kept('FAR', 163.4)], takeProfit: {percent: 15}});
    expect(step(two, 'level').why).toContain('These stocks are up 15% or more on the average price you paid: the level you set');
  });

  // With "more" closed a reason shows its first sentence: each of the two begins with what is its own. They began
  // with the same sentence ("You set a level for taking a profit ...").
  it('begins each of the two reasons with what is its own', () => {
    const list = steps({holdings: [up, under], takeProfit: {percent: 15}});
    const first = (why: string) => why.slice(0, why.indexOf('. ') + 1);
    expect(first(step(list, 'level').why)).toBe(
      'This stock is up 15% or more on the average price you paid: the level you set in the "Your plan today" box, under "Take a profit at".');
    expect(first(step(list, 'order').why)).toBe(
      'The price given for each stock is 15% above the average price you paid for it, rounded up: the level you set in the ' +
      '"Your plan today" box, under "Take a profit at".');
  });

  // A review found the same thing said up to four times in the box "How the plan was tested". Why the plan keeps,
  // and that a sale gives up what the winners go on to make, are said once, under THE PLAN.
  it('leaves to THE PLAN what is said there: why the plan keeps, and what a sale gives up', () => {
    const list = steps({holdings: [up, under], takeProfit: {percent: 15}});
    const reasons = (['level', 'order', 'hold'] as const).map(kind => step(list, kind).why).join(' ');
    expect(reasons).not.toContain('gives up what the winners go on to make');
    expect(reasons).not.toContain('because on average keeping paid more');
    const account = textsFor(F).planParts.join(' ');
    expect(account.split('gives up what the winners go on to make').length - 1).toBe(1);
    expect(account.split('because on average keeping paid more').length - 1).toBe(1);
  });

  // The line with the price goes when a stock passes its 6 months, and an order placed earlier may still be open.
  it('reminds of an order that may still be open once a holding passes its 6 months', () => {
    const old = kept('OLD', 110, {day: '2026-01-10'});
    const reminder = 'If you placed a sell order for it at your level, it may still be open: in the test such an order stood for the 6 months only.';
    expect(step(steps({holdings: [old], takeProfit: {percent: 15}}), 'review').why).toContain(reminder);
    expect(step(steps({holdings: [old]}), 'review').why).withContext('no level picked').not.toContain('sell order');
    expect(step(steps({holdings: [old], takeProfit: {percent: 15}}, without('order')), 'review').why).withContext('no order on offer').not.toContain('sell order');
  });

  it('keeps KEEP in the row of a holding at the level, and says beside it that it is at the level', () => {
    const plans = holdingPlans(steps({holdings: [up, under], takeProfit: {percent: 15}}));
    expect([plans.get('ACME')!.kind, plans.get('ACME')!.verb]).toEqual(['hold', 'KEEP']);
    expect(plans.get('ACME')!.level).toEqual({
      verb: 'YOUR LEVEL', label: 'your level: up 18%', text: 'Up 15% or more on what you paid: the level you set. Selling is your call.',
    });
    expect([plans.get('ZED')!.kind, plans.get('ZED')!.level]).toEqual(['hold', undefined]);
  });

  it('stands with the lines about what is owned: after YOUR CALL, before the lines about buying', () => {
    const list = steps({
      takeProfit: {percent: 15}, fear: {vix: 35.9, high: true}, candidates: [{symbol: 'COHR', cases: VOLATILE}],
      reserve: {percent: 20, dollars: 20_000, cash: 9900, cashPercent: 9.9},
      holdings: [up, under, kept('HUGE', 100, {verdict: 'DIP BUY', shares: 60}), kept('OLD', 100, {day: '2026-01-10'})],
    });
    expect(kinds(list)).toEqual(['trim', 'review', 'level', 'reserve', 'timing', 'buy', 'order', 'hold']);
  });

  // The written rule adds two lines and takes nothing away: what could be added to a stock that is still marked
  // DIP BUY is offered as before, in the plan as in "Could add".
  it('leaves what could be bought as it was', () => {
    const marked = kept('MARKED', 130, {verdict: 'DIP BUY'});
    const before = steps({holdings: [marked], candidates: [{symbol: 'COHR', cases: VOLATILE}]});
    const after = steps({holdings: [marked], candidates: [{symbol: 'COHR', cases: VOLATILE}], takeProfit: {percent: 15}});
    expect(step(after, 'buy')).toEqual(step(before, 'buy'));
    expect(step(after, 'spread')).toEqual(step(before, 'spread'));
    expect(holdingPlans(after).get('MARKED')!.add).toEqual(holdingPlans(before).get('MARKED')!.add);
    expect(kinds(after).filter(kind => kind !== 'level')).toEqual(kinds(before));
  });

  it('keeps both lines to a verb and one short sentence', () => {
    const list = steps({holdings: [up, under], takeProfit: {percent: 15}});
    for (const kind of ['level', 'order'] as const) {
      expect(step(list, kind).text.length).toBeLessThanOrEqual(80);
      expect(step(list, kind).verb.length).toBeLessThanOrEqual(11);
    }
  });
});
