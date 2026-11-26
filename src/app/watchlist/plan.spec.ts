import {asks, Candidate, coverageOf, Holding, holdingPlans, Limit, planSteps, PlanInput, PlanStep, saidInRows, toDoVerbs} from "./plan";
import {PositionRow} from "./portfolio-view";
import {viewOf} from "./positions";
import {riskOf, TestedCases} from "./sizing";
import {FIGURES_2026_11_21} from "./testing/figures";

const TODAY = '2026-11-21';
const F = FIGURES_2026_11_21;
const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
const CALM: TestedCases = {group: 'calm', lossPercent: 24, typicalPercent: 4.1, gainPercent: 41};
/** A 100,000 portfolio and the user's own limit of 1%: 1,000 on one stock. */
const BUDGET = 1000, PORTFOLIO = 100_000;
const OWN: Limit = {dollars: BUDGET, percent: 1, own: true};
/** The same amount when the user has entered nothing and the app's starting limit applies. */
const STARTING: Limit = {dollars: BUDGET, percent: 10, own: false};

type Spec = {
  verdict?: 'DIP BUY' | 'WATCH' | 'PASS', day?: string, shares?: number, price?: number, cases?: TestedCases, boughtAsDipBuy?: boolean,
  /** The stock's quote did not load: no price, and so no verdict either. */
  noPrice?: boolean
};

/** A holding of `shares` (10) bought at 100 and priced at `price` (100) today. */
function holding(symbol: string, o: Spec = {}): Holding {
  const position = {symbol, shares: o.shares ?? 10, price: 100, ...(o.day ? {day: o.day} : {})};
  const view = viewOf(position, {price: o.noPrice ? undefined : o.price ?? 100, portfolioValue: PORTFOLIO, today: TODAY});
  const cases = o.verdict === 'DIP BUY' ? o.cases ?? VOLATILE : undefined;
  const row: PositionRow = {symbol, view, verdict: o.verdict, cases, risk: riskOf(view, cases, BUDGET, PORTFOLIO)};
  return {row, boughtAsDipBuy: o.boughtAsDipBuy};
}

const candidate = (symbol: string, o: Partial<Candidate> = {}): Candidate => ({symbol, cases: VOLATILE, ...o});

function steps(input: Partial<PlanInput>): PlanStep[] {
  return planSteps({holdings: [], candidates: [], limit: OWN, ...input}, F);
}

const kinds = (list: PlanStep[]) => list.map(step => step.kind);
const step = (list: PlanStep[], kind: PlanStep['kind']) => list.find(it => it.kind === kind)!;
const symbols = (it: PlanStep) => it.items.map(item => item.symbol);

describe('coverageOf (does the tested plan cover this holding?)', () => {
  it('covers a holding that is a DIP BUY today, whenever it was bought: holding it is the same bet as buying it today', () => {
    expect(coverageOf(holding('NVDA', {verdict: 'DIP BUY'}))).toBe('dip-buy-now');
    expect(coverageOf(holding('NVDA', {verdict: 'DIP BUY', day: '2024-01-10'}))).toBe('dip-buy-now');
  });

  it('covers a holding bought as a DIP BUY for 6 months, also once the dip has closed: the tests held it that long', () => {
    expect(coverageOf(holding('NVDA', {verdict: 'WATCH', day: '2026-10-01', boughtAsDipBuy: true}))).toBe('within-6-months');
    expect(coverageOf(holding('NVDA', {verdict: 'PASS', day: '2026-06-10', boughtAsDipBuy: true}))).withContext('week 24').toBe('within-6-months');
  });

  it('says the tested 6 months are over for an older holding that is not a DIP BUY today', () => {
    expect(coverageOf(holding('NVDA', {verdict: 'WATCH', day: '2026-01-10', boughtAsDipBuy: true}))).withContext('week 46').toBe('past-6-months');
    expect(coverageOf(holding('NVDA', {verdict: 'WATCH', day: '2026-01-10'}))).withContext('bought too long ago to tell').toBe('past-6-months');
  });

  it('does not cover a holding that was not a DIP BUY when bought and is not one today', () => {
    expect(coverageOf(holding('AMZN', {verdict: 'PASS', day: '2026-10-23', boughtAsDipBuy: false}))).toBe('outside');
    expect(coverageOf(holding('AMZN', {verdict: 'PASS', day: '2025-01-10', boughtAsDipBuy: false}))).toBe('outside');
  });

  it('does not cover a holding when it cannot be told: no purchase date, or no way to judge that day', () => {
    expect(coverageOf(holding('SPCX', {}))).toBe('outside');
    expect(coverageOf(holding('SPCX', {verdict: 'WATCH', day: '2026-10-23'}))).toBe('outside');
  });
});

describe('planSteps: a verb, one plain sentence and the stocks with their amounts; the evidence is kept apart', () => {
  it('has nothing to say for an empty portfolio with a limit and nothing to buy on the page', () => {
    expect(steps({})).toEqual([]);
  });

  it('keeps every line short and in everyday words: the numbers and the terms belong to the evidence', () => {
    const everything = steps({
      limit: STARTING, fear: {vix: 35.9, high: true},
      holdings: [
        holding('GONE', {noPrice: true}),
        holding('NVDA', {verdict: 'DIP BUY', shares: 60}), holding('AMD', {verdict: 'DIP BUY'}),
        holding('OLD', {verdict: 'WATCH', day: '2025-01-10', boughtAsDipBuy: true}),
        holding('AMZN', {verdict: 'PASS', day: '2026-10-23', boughtAsDipBuy: false}),
      ],
      candidates: [candidate('COHR'), candidate('KO', {cases: CALM})],
    });
    expect(kinds(everything)).toEqual(['missing', 'setup', 'trim', 'review', 'timing', 'buy', 'spread', 'hold', 'outside']);
    const unknownWorth = [...steps({limit: undefined, candidates: [candidate('COHR')]}), ...steps({candidates: [candidate('COHR')]})];
    const toBuy = [
      ...steps({candidates: [candidate('COHR')]}),
      ...steps({candidates: [candidate('COHR'), candidate('KO', {cases: CALM})]}),
      ...steps({holdings: [holding('AMD', {verdict: 'DIP BUY'})]}),
      ...steps({holdings: [holding('AMD', {verdict: 'DIP BUY'}), holding('ARM', {verdict: 'DIP BUY'})]}),
    ];
    expect(new Set(kinds(toBuy))).toEqual(new Set(['buy', 'spread', 'hold']));
    [...everything, ...unknownWorth, ...toBuy].forEach(it => {
      expect(it.text.length).withContext(it.text).toBeLessThanOrEqual(80);
      expect(it.text).withContext(it.text).not.toMatch(/DIP BUY|budget|stop-loss|volatil|VIX|bad case|tenth|S&P|index|position|backtest/i);
      expect(it.verb.length).withContext(it.verb).toBeLessThanOrEqual(10);
      expect(it.why.length).withContext(it.verb).toBeGreaterThan(40);
    });
  });

  it('sets aside a holding whose price did not load, rather than calling it outside the plan', () => {
    const list = steps({holdings: [holding('GEV', {noPrice: true}), holding('AMD', {verdict: 'DIP BUY', shares: 24})]});
    expect(kinds(list)).toEqual(['missing', 'hold']);
    expect(list[0].verb).toBe('NO PRICE');
    expect(list[0].items).toEqual([{symbol: 'GEV'}]);
    expect(list[0].text).toBe('The price of this stock did not load. Use "Reload prices" at the top.');
    expect(list[0].why).toBe(
      'The plan leaves it out until its price loads: reload the prices to try again ("Reload prices", at the top of the page). ' +
      'Until then the amounts in the plan are worked out without it, so they may be too low.');
    const two = steps({holdings: [holding('GEV', {noPrice: true}), holding('VRT', {noPrice: true, day: '2026-10-01'})]});
    expect(kinds(two)).toEqual(['missing']);
    expect(two[0].text).toBe('The prices of these stocks did not load. Use "Reload prices" at the top.');
    expect(two[0].why).toContain('The plan leaves them out until their prices load: reload the prices');
    expect(two[0].why).toContain('worked out without them');
  });

  it('shows amounts from the start: until the user enters a limit, it says which one it assumes', () => {
    const list = steps({limit: {dollars: 4000, percent: 10, own: false}, candidates: [candidate('COHR')]});
    expect(kinds(list)).toEqual(['setup', 'buy', 'spread']);
    expect(list[0].verb).toBe('YOUR LIMIT');
    // The field is in the same box as this line, above it in a narrow window and beside it in a wide one: the line
    // says "in this box", which holds for both. The evidence is read at the bottom of the page, so it names the box.
    expect(list[0].text).toBe('The plan assumes you can lose $4,000 on one stock. Change it in this box.');
    expect(list[0].why).toBe(
      'You have not entered a limit, so the plan starts from 10% of this portfolio. With that, up to 24% of your money fits in ' +
      'one stock whose price swings a lot. In tests, three stocks held together had a milder bad half-year than one alone ' +
      '(1 in 10 lost 22% or more, against 33%). To change it, enter your own number in the "Your plan today" box, under ' +
      '"Most I can lose on one stock".');
    expect(step(list, 'buy').items).withContext('the stocks and their sizes are in "Could add"').toEqual([]);
  });

  it('says nothing about the limit once it is the user\'s own', () => {
    expect(kinds(steps({limit: OWN, candidates: [candidate('COHR')]}))).toEqual(['buy', 'spread']);
  });

  it('asks for cash when the portfolio is worth nothing yet: there is nothing to take a share of', () => {
    const list = steps({limit: undefined, candidates: [candidate('COHR'), candidate('MU')]});
    expect(kinds(list)).toEqual(['setup', 'buy', 'spread']);
    expect(list[0].verb).toBe('START HERE');
    expect(list[0].text).toBe('Enter your cash in this box, under "Cash".');
    expect(list[0].why).toBe(
      'The plan works out every amount from what this portfolio is worth, and the app cannot tell that yet: it holds no cash and no priced stocks.');
    expect(step(list, 'buy').items).toEqual([]);
    expect(step(list, 'buy').text).toBe('2 stocks could be added: see "Could add".');
  });

  it('puts a missing price before everything else: the rest of the plan depends on it', () => {
    const list = steps({limit: STARTING, holdings: [holding('GEV', {noPrice: true})], candidates: [candidate('MU')]});
    expect(kinds(list)).toEqual(['missing', 'setup', 'buy', 'spread']);
  });

  it('keeps what the plan covers for 6 months, each with its week when the purchase date is known', () => {
    const list = steps({holdings: [
      holding('NVDA', {verdict: 'WATCH', day: '2026-11-11', boughtAsDipBuy: true}),
      holding('AVGO', {verdict: 'WATCH', day: '2026-10-15', boughtAsDipBuy: true}),
      holding('LATE', {verdict: 'PASS', day: '2026-06-10', boughtAsDipBuy: true}),
      holding('GEV', {verdict: 'WATCH', day: '2026-11-20', boughtAsDipBuy: true}),
    ]});
    expect(kinds(list)).toEqual(['hold']);
    expect(list[0].verb).toBe('KEEP');
    expect(list[0].text).toBe('Keep these for 6 months. In tests, selling early, up or down, paid less.');
    expect(list[0].items).toEqual([
      {symbol: 'AVGO', label: 'week 6'}, {symbol: 'GEV', label: 'week 1'}, {symbol: 'LATE', label: 'week 24'}, {symbol: 'NVDA', label: 'week 2'},
    ]);
    expect(list[0].why).toBe(
      'On two lists of stocks never used before (184 and 202), selling as soon as a stock was up 25% gave less on average than ' +
      'keeping it for 6 months: +7.4% against +20.2%, and +5.5% against +9.3%; 45% of the stocks reached it at some point. ' +
      'Selling after a 20% drop lowered the result too (+6.5% against +9.3%). A stock with no week number counts from today.');
  });

  it('gives no week to a holding that is marked to buy today and has no purchase date: its year starts now', () => {
    const list = steps({limit: undefined, holdings: [holding('GEV', {verdict: 'DIP BUY'})]});
    expect(step(list, 'hold').items).toEqual([{symbol: 'GEV'}]);
    expect(step(list, 'hold').text).toBe('Keep this one for 6 months. In tests, selling early, up or down, paid less.');
  });

  it('asks to sell part of a holding that could lose more than the limit, down to the amount that fits', () => {
    // 60 shares at 100 = 6,000; in a bad half-year 1 in 10 such stocks lost 41% = 2,460, over the 1,000 limit.
    // 1,000 / 41% = 2,439 is what fits.
    const list = steps({holdings: [holding('NVDA', {verdict: 'DIP BUY', shares: 60}), holding('AMD', {verdict: 'DIP BUY', shares: 24})]});
    expect(kinds(list)).toEqual(['trim', 'hold']);
    expect(step(list, 'trim').verb).toBe('SELL SOME');
    expect(step(list, 'trim').text).toBe('This stock could lose more than your $1,000 limit. Keep only the amount shown.');
    expect(step(list, 'trim').items).toEqual([{symbol: 'NVDA', label: 'keep $2,439'}]);
    expect(step(list, 'trim').why).toBe(
      'In tests, 1 in 10 stocks like these lost 41% or more after 6 months. The amount shown is the most you can hold so that ' +
      'such a loss stays within your limit. If you can live with a bigger loss, raise your limit instead: the tests do not say ' +
      'that selling makes you more money, only that it caps what you can lose.');
    expect(symbols(step(list, 'hold'))).toEqual(['AMD']);
  });

  it('calls it "the limit" while it is the app\'s starting one, not the user\'s', () => {
    const list = steps({limit: STARTING, holdings: [holding('NVDA', {verdict: 'DIP BUY', shares: 60})]});
    expect(step(list, 'trim').text).toBe('This stock could lose more than the $1,000 limit. Keep only the amount shown.');
  });

  it('gives every holding that is over the limit the amount that fits how much its price swings', () => {
    const list = steps({holdings: [
      holding('NVDA', {verdict: 'DIP BUY', shares: 60}),
      holding('KO', {verdict: 'DIP BUY', shares: 60, cases: CALM}),
    ]});
    expect(step(list, 'trim').items).toEqual([{symbol: 'KO', label: 'keep $4,167'}, {symbol: 'NVDA', label: 'keep $2,439'}]);
    expect(step(list, 'trim').text).toBe('These could lose more than your $1,000 limit. Keep only the amounts shown.');
    expect(step(list, 'trim').why).toContain(
      'In tests, 1 in 10 stocks like these lost 24% to 41% or more after 6 months, more for a stock whose price swings more. The amount shown');
  });

  it('leaves alone a holding that is over by less than a tenth: prices move that much in days', () => {
    // 26 shares = 2,600; the bad half-year would cost 1,066, a little over the 1,000 limit.
    const list = steps({holdings: [holding('NVDA', {verdict: 'DIP BUY', shares: 26})]});
    expect(kinds(list)).toEqual(['hold']);
  });

  it('does not ask to sell anything while the portfolio\'s worth is unknown', () => {
    const list = steps({limit: undefined, holdings: [holding('NVDA', {verdict: 'DIP BUY', shares: 60})]});
    expect(kinds(list)).toEqual(['setup', 'hold']);
  });

  it('leaves the decision to the user for a holding older than the 6 months the tests agree on', () => {
    const list = steps({holdings: [holding('NVDA', {verdict: 'WATCH', day: '2026-03-01', boughtAsDipBuy: true})]});
    expect(kinds(list)).toEqual(['review']);
    expect(list[0].verb).toBe('YOUR CALL');
    expect(list[0].text).toBe('Held for over 6 months. After that the tests disagree.');
    expect(symbols(list[0])).toEqual(['NVDA']);
    expect(list[0].why).toBe(
      'The tests followed each stock for 6 months. Two of them went on for 6 months more: on one list the kept stocks then ' +
      'beat the market (+16.1% against +7.4%), on the other not clearly (+9.4% against +7.7%). So the plan has no rule for it. ' +
      'This one is not marked DIP BUY now.');
  });

  it('says which holdings the plan has no opinion on, and which of them only lack a purchase date', () => {
    const list = steps({holdings: [
      holding('AMZN', {verdict: 'PASS', day: '2026-10-23', boughtAsDipBuy: false}),
      holding('SPCX', {}),
    ]});
    expect(kinds(list)).toEqual(['outside']);
    expect(list[0].verb).toBe('NO OPINION');
    expect(list[0].text).toBe('The plan does not cover these stocks.');
    expect(symbols(list[0])).toEqual(['AMZN', 'SPCX']);
    expect(list[0].why).toBe(
      'The tests only followed stocks that were marked DIP BUY when bought. These are not marked DIP BUY now, and the app cannot ' +
      'see that they were when you bought them, so the tests say nothing about them. ' +
      'SPCX has no purchase date: add it and the app can check.');
  });

  it('says "this stock" for a single holding outside the plan', () => {
    const list = steps({holdings: [holding('AMZN', {verdict: 'PASS', day: '2026-10-23', boughtAsDipBuy: false})]});
    expect(list[0].text).toBe('The plan does not cover this stock.');
    expect(list[0].why).toBe(
      'The tests only followed stocks that were marked DIP BUY when bought. This one is not marked DIP BUY now, and the app cannot ' +
      'see that it was when you bought it, so the tests say nothing about it.');
  });

  it('says how many stocks could be added and where their sizes are: the line itself lists none', () => {
    const list = steps({candidates: [candidate('MU'), candidate('COHR'), candidate('KO', {cases: CALM})]});
    expect(kinds(list)).toEqual(['buy', 'spread']);
    expect(list[0].verb).toBe('BUY');
    expect(list[0].text).toBe('3 stocks could be added: see "Could add" for the size of each.');
    expect(list[0].items).toEqual([]);
    expect(list[0].inRows).toEqual([]);
    expect(list[0].why).toBe(
      'These are the stocks marked DIP BUY on the Watchlist: the price dropped while the business keeps growing. ' +
      'How such stocks did in the tests is under THE PLAN. ' +
      'The tests found no dependable way to tell which will do best: the one ordering that looked promising, the fastest fallers ' +
      'first, beat the others in the same week only 47% of the time. So the plan gives them no order, and how many matters ' +
      'more than which. ' +
      'The size of each is a share of this portfolio, worked out so that a bad half-year would cost about the same for every ' +
      'stock in it: one whose price swings more gets less. No size is more than fits your limit, and none depends on the cash ' +
      'you have. How to split money between stocks was not tested.');
  });

  it('says "1 stock" and "its size" for a single stock to buy', () => {
    const list = steps({candidates: [candidate('MU')]});
    expect(list[0].text).toBe('1 stock could be added: see "Could add" for its size.');
    expect(list[0].why).toContain('This is a stock marked DIP BUY on the Watchlist: the price dropped while the business keeps growing.');
  });

  it('points to the rows of what you own when the only thing to buy is more of it', () => {
    // AMD: 10 shares at 100 = 1,000 held; 2,439 fits the limit, so 1,439 more: 1.4% of the portfolio.
    const one = steps({holdings: [holding('AMD', {verdict: 'DIP BUY'})]});
    expect(kinds(one)).toEqual(['buy', 'spread', 'hold']);
    expect(step(one, 'buy').text).toBe('You could add to 1 stock you own: see "add" in its row.');
    expect(step(one, 'buy').items).toEqual([]);
    expect(step(one, 'buy').inRows).toEqual([{symbol: 'AMD', label: 'add 1.4% ($1,439)'}]);
    expect(step(one, 'buy').why).toContain('This is a stock you own that is marked DIP BUY on the Watchlist: the price dropped');
    const two = steps({holdings: [holding('AMD', {verdict: 'DIP BUY'}), holding('ARM', {verdict: 'DIP BUY'})]});
    expect(step(two, 'buy').text).toBe('You could add to 2 stocks you own: see "add" in their rows.');
    expect(step(two, 'buy').why).toContain('These are stocks you own that are marked DIP BUY on the Watchlist: the price dropped');
  });

  it('asks to look at what to buy, and says in the row of a stock that is owned what could be added to it', () => {
    const list = steps({fear: {vix: 35.9, high: true}, holdings: [holding('AMD', {verdict: 'DIP BUY'})], candidates: [candidate('MU')]});
    expect(kinds(list)).toEqual(['timing', 'buy', 'spread', 'hold']);
    expect(step(list, 'buy').text).toBe('1 stock could be added: see "Could add" for its size.');
    expect(step(list, 'buy').inRows).toEqual([{symbol: 'AMD', label: 'add 1.4% ($1,439)'}]);
    expect(toDoVerbs(list)).toEqual(['BUY']);
  });

  it('leaves the size out while the portfolio is worth nothing (the first step asks for the cash)', () => {
    const list = steps({limit: undefined, candidates: [candidate('COHR'), candidate('MU')]});
    expect(kinds(list)).toEqual(['setup', 'buy', 'spread']);
    expect(step(list, 'buy').text).toBe('2 stocks could be added: see "Could add".');
    expect(step(list, 'buy').why).toContain('and how many matters more than which. Enter your cash to see the size of each.');
    expect(steps({limit: undefined, candidates: [candidate('MU')]})[1].text).toBe('1 stock could be added: see "Could add".');
  });

  it('says how many beside what to buy, while the plan covers fewer than three of the stocks in the portfolio', () => {
    const list = steps({holdings: [holding('AMD', {verdict: 'DIP BUY'})], candidates: [candidate('MU')]});
    expect(kinds(list)).toEqual(['buy', 'spread', 'hold']);
    expect(step(list, 'spread').verb).toBe('HOW MANY');
    expect(step(list, 'spread').items).toEqual([]);
    expect(step(list, 'spread').text).toBe('Three or more rather than one. In tests, a bad half-year then hurt less.');
    expect(step(list, 'spread').why).toBe(
      'The plan covers 1 of your stocks today. With fewer than three, one stock decides most of the result. ' +
      'What the test found is under THE PLAN, above.');
    const none = steps({candidates: [candidate('MU')]});
    expect(step(none, 'spread').why).toBe(
      'You hold no stock the plan covers yet. With fewer than three, one stock decides most of the result. ' +
      'What the test found is under THE PLAN, above.');
  });

  it('says nothing about how many once the plan covers three of them, a holding that is too big included', () => {
    const three = [holding('AMD', {verdict: 'DIP BUY'}), holding('ARM', {verdict: 'DIP BUY'}),
      holding('AVGO', {verdict: 'WATCH', day: '2026-10-15', boughtAsDipBuy: true})];
    expect(kinds(steps({holdings: three, candidates: [candidate('MU')]}))).toEqual(['buy', 'hold']);
    const withBig = [holding('NVDA', {verdict: 'DIP BUY', shares: 60}), holding('AMD', {verdict: 'DIP BUY'}), holding('ARM', {verdict: 'DIP BUY'})];
    expect(kinds(steps({holdings: withBig, candidates: [candidate('MU')]}))).toEqual(['trim', 'buy', 'hold']);
    const two = three.slice(0, 2);
    expect(kinds(steps({holdings: two, candidates: [candidate('MU')]}))).toEqual(['buy', 'spread', 'hold']);
    expect(step(steps({holdings: two, candidates: [candidate('MU')]}), 'spread').why).toContain('The plan covers 2 of your stocks today.');
  });

  it('does not count a holding the plan has no opinion on, and says nothing while there is nothing to buy', () => {
    const outside = [holding('AMZN', {verdict: 'PASS', day: '2026-10-23', boughtAsDipBuy: false}), holding('SPCX', {}), holding('KO', {})];
    expect(kinds(steps({holdings: outside, candidates: [candidate('MU')]}))).toEqual(['buy', 'spread', 'outside']);
    expect(kinds(steps({holdings: [holding('AMD', {verdict: 'DIP BUY', shares: 23})]}))).toEqual(['hold']);
  });

  it('says how much more of a stock you own would bring it to its share, when it is marked to buy today', () => {
    // AMD: 10 shares at 100 = 1,000 held. An equal share of the risk would be far more, but only 2,439 fits the limit: 1,439 more.
    const list = steps({holdings: [holding('AMD', {verdict: 'DIP BUY'})], candidates: [candidate('MU')]});
    expect(kinds(list)).toEqual(['buy', 'spread', 'hold']);
    expect(step(list, 'buy').inRows).toEqual([{symbol: 'AMD', label: 'add 1.4% ($1,439)'}]);
    expect(symbols(step(list, 'hold'))).toEqual(['AMD']);
  });

  it('works that share out as an equal share of the risk when the limit leaves room for it', () => {
    // A limit of 20% of 100,000. Three stocks alike, 1,000 held of each: a third of the portfolio each, so 32,333 more.
    const roomy: Limit = {dollars: 20_000, percent: 20, own: true};
    const three = ['AMD', 'ARM', 'MU'].map(symbol => holding(symbol, {verdict: 'DIP BUY'}));
    expect(step(steps({limit: roomy, holdings: three}), 'buy').inRows)
      .toEqual(['AMD', 'ARM', 'MU'].map(symbol => ({symbol, label: 'add 32.3% ($32,333)'})));
    // A calm stock beside two that swing a lot takes more: 41 / (41 + 24 + 24) of the portfolio, 46,067, less the 1,000 held.
    const mixed = [holding('KO', {verdict: 'DIP BUY', cases: CALM}), holding('AMD', {verdict: 'DIP BUY'}), holding('ARM', {verdict: 'DIP BUY'})];
    expect(step(steps({limit: roomy, holdings: mixed}), 'buy').inRows).toEqual([
      {symbol: 'AMD', label: 'add 26.0% ($25,966)'}, {symbol: 'ARM', label: 'add 26.0% ($25,966)'}, {symbol: 'KO', label: 'add 45.1% ($45,067)'},
    ]);
  });

  it('does not offer to add to a holding that is nearly as big as fits, is over the limit, or is not marked to buy today', () => {
    const list = steps({holdings: [
      holding('FULL', {verdict: 'DIP BUY', shares: 23}),      // 2,300 of the 2,439 that fits: under a tenth of it is left
      holding('OVER', {verdict: 'DIP BUY', shares: 60}),
      holding('WAIT', {verdict: 'WATCH', day: '2026-10-01', boughtAsDipBuy: true}),
    ]});
    expect(kinds(list)).toEqual(['trim', 'hold']);
  });

  it('does not offer to add to a holding while the portfolio\'s worth is unknown: how much fits is not known', () => {
    const list = steps({limit: undefined, holdings: [holding('AMD', {verdict: 'DIP BUY'})], candidates: [candidate('MU')]});
    expect(step(list, 'buy').inRows).toEqual([]);
    expect(step(list, 'buy').text).toBe('1 stock could be added: see "Could add".');
  });

  it('says when a fearful market makes it the better time to buy', () => {
    const list = steps({candidates: [candidate('COHR')], fear: {vix: 35.9, high: true}});
    expect(kinds(list)).toEqual(['timing', 'buy', 'spread']);
    expect(list[0].verb).toBe('GOOD TIME');
    expect(list[0].text).toBe('The market is fearful now. In the past, that was the better time to buy.');
    expect(list[0].why).toBe(
      'The VIX measures how nervous investors are; 25 or more counts as fearful. In tests, stocks bought after a drop in fearful months ' +
      'gained +20.4% on average over the next 6 months, against +7.3% in calm months, and about 7 in 10 were up. ' +
      'Fear can still get worse first: about 15% fell a further 20%. ' +
      'This rests on only about 16 fearful periods between 1994 and 2026, and a one-day spike may fade before the month ends. ' +
      'Today the VIX is at 35.9.');
  });

  it('says nothing about timing in a calm market: there is nothing to act on', () => {
    expect(kinds(steps({candidates: [candidate('COHR')], fear: {vix: 16.2, high: false}}))).toEqual(['buy', 'spread']);
  });

  it('puts what needs doing before what does not', () => {
    const list = steps({
      fear: {vix: 35.9, high: true},
      holdings: [
        holding('NVDA', {verdict: 'DIP BUY', shares: 60}),
        holding('AMD', {verdict: 'DIP BUY', shares: 24}),
        holding('OLD', {verdict: 'WATCH', day: '2025-01-10', boughtAsDipBuy: true}),
        holding('AMZN', {verdict: 'PASS', day: '2026-10-23', boughtAsDipBuy: false}),
      ],
      candidates: [candidate('COHR'), candidate('MU')],
    });
    expect(kinds(list)).toEqual(['trim', 'review', 'timing', 'buy', 'spread', 'hold', 'outside']);
  });

  it('names each holding once among the steps about what you own', () => {
    const list = steps({holdings: [
      holding('NVDA', {verdict: 'DIP BUY', shares: 60}), holding('AMD', {verdict: 'DIP BUY'}),
      holding('OLD', {verdict: 'WATCH', day: '2025-01-10', boughtAsDipBuy: true}), holding('SPCX', {}),
    ]});
    const owned = list.filter(it => ['trim', 'review', 'hold', 'outside'].includes(it.kind));
    expect(owned.flatMap(symbols).sort()).toEqual(['AMD', 'NVDA', 'OLD', 'SPCX']);
  });

  // A second limit of the user's own: a share of the portfolio to keep in cash, the one part that cannot fall with
  // the stocks. The plan says when the cash is under it and by how much. It names no stock to sell, and does not
  // say to sell: how much, never which.
  describe('HOLD BACK: the share to keep outside stocks', () => {
    // Of a 100,000 portfolio a fifth, 20,000, is to stay outside stocks, and 9,900 is in cash.
    const short = {percent: 20, dollars: 20_000, cash: 9900, cashPercent: 9.9};
    const text = (reserve: PlanInput['reserve']) => step(steps({reserve}), 'reserve').text;

    // "What you keep outside stocks" is the share that was set, everywhere on the page: the line says the cash in
    // other words, so that the two are not one name for two amounts.
    it('says what was set, what the cash is, and how much it is short', () => {
      const list = steps({reserve: short});
      expect(kinds(list)).toEqual(['reserve']);
      expect(step(list, 'reserve').verb).toBe('HOLD BACK');
      expect(step(list, 'reserve').text).toBe('You set 20% to keep outside stocks; your cash is 9.9%: $10,100 short.');
      expect(step(list, 'reserve').items).withContext('it names no stock').toEqual([]);
      expect(asks(step(list, 'reserve'))).withContext('it asks for something').toBeTrue();
    });

    it('says so when there is no cash, and does not call a little cash 0.0%', () => {
      expect(text({...short, cash: 0, cashPercent: 0})).toBe('You set 20% to keep outside stocks; you have no cash here: $20,000 short.');
      expect(text({...short, cash: 30, cashPercent: 0.03})).toBe('You set 20% to keep outside stocks; your cash is under 0.1%: $19,970 short.');
    });

    // The amount to keep moves with prices every day. Like SELL SOME, the line waits until the gap is more than a
    // tenth, so that it does not come and go by the day for someone who is at the share.
    it('says nothing while the cash covers the share, is a tenth or less short of it, or no share is set', () => {
      expect(steps({reserve: {...short, cash: 20_000, cashPercent: 20}})).toEqual([]);
      expect(steps({reserve: {...short, cash: 19_999.8, cashPercent: 20}})).withContext('short by cents').toEqual([]);
      expect(steps({reserve: {...short, cash: 18_000, cashPercent: 18}})).withContext('a tenth short').toEqual([]);
      expect(kinds(steps({reserve: {...short, cash: 17_999, cashPercent: 18}}))).withContext('more than a tenth short').toEqual(['reserve']);
      expect(steps({})).toEqual([]);
    });

    it('prints the share with two decimals at most, however it was typed', () => {
      expect(text({percent: 33.3333333, dollars: 33_333.33, cash: 9900, cashPercent: 9.9}))
        .toBe('You set 33.33% to keep outside stocks; your cash is 9.9%: $23,433 short.');
      expect(text({percent: 0.5, dollars: 500, cash: 100, cashPercent: 0.1})).toBe('You set 0.5% to keep outside stocks; your cash is 0.1%: $400 short.');
    });

    // A holding without a price adds nothing to the worth, so the amount to keep is the least it can be. NO PRICE,
    // the first line of the plan then, says that the amounts may be too low; the reason of this line says it of its own.
    it('says in its reason that the amounts are the least they can be while a stock has no price', () => {
      expect(text({...short, atLeast: true})).toBe('You set 20% to keep outside stocks; your cash is 9.9%: $10,100 short.');
      expect(step(steps({reserve: {...short, atLeast: true}}), 'reserve').why).toContain(
        'One of your stocks has no price, so this portfolio is worth more than could be counted: these amounts are the least they can be.');
      expect(step(steps({reserve: short}), 'reserve').why).not.toContain('no price');
    });

    // The line BUY stays, with its sizes: what could be bought is shown whatever the cash. But while the cash is
    // under what the user keeps outside stocks there is nothing to buy with today, so BUY is not among what there
    // is to do and its mark is not filled.
    it('does not name BUY in what there is to do today while it says HOLD BACK', () => {
      const list = steps({reserve: short, candidates: [candidate('COHR')]});
      expect(kinds(list)).toEqual(['reserve', 'buy', 'spread']);
      expect(toDoVerbs(list)).toEqual(['HOLD BACK']);
      expect(asks(step(list, 'buy'))).toBeFalse();
      expect(step(list, 'buy').why).toContain(
        'Today your cash is under what you keep outside stocks (HOLD BACK), so buying is not among what there is to do.');
      const free = steps({candidates: [candidate('COHR')]});
      expect(asks(step(free, 'buy'))).withContext('nothing held back: BUY asks').toBeTrue();
      expect(step(free, 'buy').why).not.toContain('HOLD BACK');
    });

    it('stands before the lines about buying: it is about the money they would spend', () => {
      const list = steps({
        reserve: short, fear: {vix: 35.9, high: true}, candidates: [candidate('COHR')],
        holdings: [
          holding('NVDA', {verdict: 'DIP BUY', shares: 60}), holding('AMD', {verdict: 'DIP BUY'}),
          holding('OLD', {verdict: 'WATCH', day: '2025-01-10', boughtAsDipBuy: true}),
        ],
      });
      expect(kinds(list)).toEqual(['trim', 'review', 'reserve', 'timing', 'buy', 'spread', 'hold']);
    });

    // The amount on the line is what would have to move from stocks into cash. New cash closes the gap too, but
    // it takes more, because it also makes the portfolio larger: the reason gives that amount as well.
    it('explains itself: where the share is set, what each way of closing the gap takes, and that no test is behind it', () => {
      expect(step(steps({reserve: short}), 'reserve').why).toBe(
        'You set the share of this portfolio to keep outside stocks in the "Your plan today" box, under "Keep outside stocks": 20%, ' +
        'which is $20,000 today. Your cash is $9,900, so it is $10,100 short. Money outside stocks cannot fall with them. ' +
        'Moving $10,100 from stocks into cash would close the gap; so would $12,625 of new cash, which is more because new cash also ' +
        'makes the portfolio larger. The plan does not say which stock to sell, or that you should. ' +
        'The split in "Could add" leaves that money out. The line shows once the cash is more than a tenth short, because the amount ' +
        'moves with prices every day. No test is behind it: the share is your own number, like your limit.');
    });

    it('keeps the line short and in everyday words with large amounts too', () => {
      const big = step(steps({reserve: {percent: 33.33, dollars: 33_330_000, cash: 12_345_678, cashPercent: 12.3}}), 'reserve');
      expect(big.text).toBe('You set 33.33% to keep outside stocks; your cash is 12.3%: $20,984,322 short.');
      expect(big.text.length).toBeLessThanOrEqual(80);
      expect(big.verb.length).toBeLessThanOrEqual(10);
    });
  });
});

describe('toDoVerbs (what a plan expects of you today, by name)', () => {
  const stepOf = (kind: PlanStep['kind']): PlanStep => ({kind, verb: kind, text: 'What to do.', why: 'Why.', items: []});
  const plan = (...kinds: PlanStep['kind'][]) => kinds.map(stepOf);

  it('names the steps that ask for something, in the plan\'s order, not the ones that only say where things stand', () => {
    expect(toDoVerbs(plan('news', 'missing', 'setup', 'trim', 'review', 'timing', 'buy', 'spread', 'hold', 'outside')))
      .toEqual(['missing', 'setup', 'trim', 'review', 'buy']);
    expect(toDoVerbs(plan('timing', 'spread', 'hold', 'outside'))).toEqual([]);
    expect(toDoVerbs([])).toEqual([]);
  });

  it('uses the words the lines themselves carry', () => {
    const list = steps({
      limit: STARTING, holdings: [holding('NVDA', {verdict: 'DIP BUY', shares: 60}), holding('AMD', {verdict: 'DIP BUY'})],
      candidates: [candidate('MU')],
    });
    expect(toDoVerbs(list)).toEqual(['YOUR LIMIT', 'SELL SOME', 'BUY']);
  });

  it('tells one kind of step from the other', () => {
    expect(plan('trim', 'timing', 'buy', 'spread', 'hold').map(asks)).toEqual([true, false, true, false, false]);
  });
});

describe('saidInRows (the steps said once, in the row of each stock they are about)', () => {
  const stepOf = (kind: PlanStep['kind']): PlanStep => ({kind, verb: kind, text: 'What to do.', why: 'Why.', items: []});
  const EVERY_KIND: PlanStep['kind'][] = ['news', 'missing', 'setup', 'trim', 'review', 'timing', 'buy', 'spread', 'hold', 'outside'];

  it('is "keep" and "no opinion": they say where a stock you own stands and ask for nothing', () => {
    expect(EVERY_KIND.filter(kind => saidInRows(stepOf(kind)))).toEqual(['hold', 'outside']);
  });

  it('never takes a step that asks for something off the top of the box', () => {
    expect(EVERY_KIND.map(stepOf).filter(saidInRows).some(asks)).toBe(false);
  });

  it('loses no stock: each one such a step names has a row that says the step\'s verb', () => {
    const list = steps({
      holdings: [
        holding('AMD', {verdict: 'DIP BUY'}),
        holding('AVGO', {verdict: 'WATCH', day: '2026-10-15', boughtAsDipBuy: true}),
        holding('AMZN', {verdict: 'PASS', day: '2026-10-23', boughtAsDipBuy: false}),
        holding('SPCX', {}),
      ],
      candidates: [candidate('MU')],
    });
    const inRows = list.filter(saidInRows), rows = holdingPlans(list);
    expect(kinds(inRows)).toEqual(['hold', 'outside']);
    expect(inRows.flatMap(symbols).sort()).toEqual(['AMD', 'AMZN', 'AVGO', 'SPCX']);
    inRows.forEach(it => symbols(it).forEach(symbol => expect(rows.get(symbol)?.verb).withContext(symbol).toBe(it.verb)));
  });
});

describe('holdingPlans (what the plan says about each stock you own)', () => {
  const KEEP_ONE = 'Keep this one for 6 months. In tests, selling early, up or down, paid less.';

  it('gives every holding the verb and the sentence of the step that names it, with the amount when the step has one', () => {
    const plans = holdingPlans(steps({holdings: [
      holding('GONE', {noPrice: true}),
      holding('NVDA', {verdict: 'DIP BUY', shares: 60}),     // could lose more than the limit
      holding('FULL', {verdict: 'DIP BUY', shares: 23}),     // about as much as fits
      holding('OLD', {verdict: 'WATCH', day: '2025-01-10', boughtAsDipBuy: true}),
      holding('AMZN', {verdict: 'PASS', day: '2026-10-23', boughtAsDipBuy: false}),
    ]}));
    expect([...plans.keys()].sort()).toEqual(['AMZN', 'FULL', 'GONE', 'NVDA', 'OLD']);
    expect(plans.get('GONE')).toEqual(
      {kind: 'missing', verb: 'NO PRICE', text: 'The price of this stock did not load. Use "Reload prices" at the top.'});
    expect(plans.get('NVDA')).toEqual({
      kind: 'trim', verb: 'SELL SOME', text: 'This stock could lose more than your $1,000 limit. Keep only the amount shown.', amount: 'keep $2,439',
    });
    expect(plans.get('FULL')).toEqual({kind: 'hold', verb: 'KEEP', text: KEEP_ONE});
    expect(plans.get('OLD')).toEqual({kind: 'review', verb: 'YOUR CALL', text: 'Held for over 6 months. After that the tests disagree.'});
    expect(plans.get('AMZN')).toEqual({kind: 'outside', verb: 'NO OPINION', text: 'The plan does not cover this stock.'});
  });

  it('carries over an amount, not the week: how long a stock has been held has a column of its own', () => {
    const list = steps({holdings: [holding('AVGO', {verdict: 'WATCH', day: '2026-10-15', boughtAsDipBuy: true})]});
    expect(step(list, 'hold').items).toEqual([{symbol: 'AVGO', label: 'week 6'}]);
    expect(holdingPlans(list).get('AVGO')).toEqual({kind: 'hold', verb: 'KEEP', text: KEEP_ONE});
  });

  it('says how much can be added to a holding the plan would also buy today, and what that amount is', () => {
    // AMD: 1,439 more fits the limit.
    const plans = holdingPlans(steps({holdings: [holding('AMD', {verdict: 'DIP BUY'})], candidates: [candidate('MU')]}));
    expect(plans.get('AMD')).toEqual({
      kind: 'hold', verb: 'KEEP', text: KEEP_ONE,
      add: {verb: 'BUY', label: 'add 1.4% ($1,439)', text: 'You own less of this stock than the size the plan gives it. This is how much more you could buy to bring it up to that size.'},
    });
    expect(plans.has('MU')).withContext('a stock that is not owned has no row to put a plan in').toBe(false);
  });

  it('adds nothing to a row for a stock the step names without an amount', () => {
    const by = (kind: PlanStep['kind'], verb: string): PlanStep =>
      ({kind, verb, text: 'What to do.', why: 'Why.', items: [{symbol: 'AMD'}], inRows: [{symbol: 'AMD'}]});
    expect(holdingPlans([by('hold', 'KEEP'), by('buy', 'BUY')]).get('AMD')).toEqual({kind: 'hold', verb: 'KEEP', text: 'What to do.'});
  });

  it('is empty for an empty plan', () => {
    expect(holdingPlans([]).size).toBe(0);
  });
});
