import {portfolioView} from "./portfolio-view";
import {emptyPortfolio, Portfolio, withPosition} from "./positions";
import {Stock} from "../api/microsoft-money.service";
import {chartOf, makeStock, NOW, reportedQuarters, weeklyPattern} from "./testing/fixtures";
import {FIGURES_2026_11_21} from "./testing/figures";

const TODAY = '2026-11-21';
/** The tested results by volatility group, as recorded on 2026-11-21. */
const CASES = FIGURES_2026_11_21.cases;

/** A volatile growing company 20% below its high (a DIP BUY) priced at 80, and a fund priced at 110. */
function market(): Map<string, Stock> {
  const nvda = makeStock({
    symbol: 'NVDA', price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
    closes: weeklyPattern(250, [0.10, -1 / 11]),
  });
  const fund = makeStock({symbol: 'VGT', price: 110});
  return new Map([['NVDA', nvda], ['VGT', fund]]);
}

function holdings(): Portfolio {
  // 96,500 in cash beside positions worth 3,500 today: a portfolio of exactly 100,000.
  let portfolio: Portfolio = {...emptyPortfolio(), cash: 96_500, lossBudgetPercent: 1};
  portfolio = withPosition(portfolio, {symbol: 'VGT', shares: 10, price: 100, day: '2026-11-19'});
  portfolio = withPosition(portfolio, {symbol: 'NVDA', shares: 30, price: 100, day: '2026-11-19'});
  return withPosition(portfolio, {symbol: 'GONE', shares: 5, price: 20, day: '2026-11-19'});
}

// The S&P 500 fund closed at 750, 740 and 690 on Nov 18, 19 and 20.
const INDEX = chartOf([750, 740, 690], {endDay: '2026-11-20T05:00:00Z'});

describe('portfolioView', () => {
  const view = portfolioView(holdings(), market(), {today: TODAY, indexNow: 690, indexHistory: INDEX, now: NOW, cases: CASES});
  const row = (symbol: string) => view.rows.find(it => it.symbol === symbol)!;

  it('lists the positions A to Z', () => {
    expect(view.rows.map(it => it.symbol)).toEqual(['GONE', 'NVDA', 'VGT']);
  });

  it('prices each position from its watchlist quote', () => {
    expect(row('NVDA').view.value).toBe(2400);       // 30 x 80
    expect(row('VGT').view.gainPercent).toBeCloseTo(10, 6);
    expect(row('GONE').view.value).toBeUndefined();
  });

  it('compares with the S&P 500 from the purchase day: 740 then, 690 now', () => {
    expect(row('NVDA').view.indexPercent).toBeCloseTo((690 / 740 - 1) * 100, 6);
  });

  it("works out the portfolio value: the positions at today's prices plus the cash", () => {
    expect(view.portfolioValue).toBe(100_000);        // 2,400 + 1,100 + 96,500; the unpriced holding adds nothing
    expect(row('NVDA').view.weightPercent).toBeCloseTo(2.4, 6);
  });

  it('measures weights against the positions alone when no cash is entered', () => {
    const invested = portfolioView({...holdings(), cash: undefined}, market(), {today: TODAY, now: NOW});
    expect(invested.portfolioValue).toBe(3500);
    expect(invested.rows.find(it => it.symbol === 'VGT')!.view.weightPercent).toBeCloseTo(1100 / 3500 * 100, 6);
  });

  it('has no portfolio value, weights or budget when nothing is priced and no cash is entered', () => {
    const blind = portfolioView(withPosition({...emptyPortfolio(), lossBudgetPercent: 1}, {symbol: 'GONE', shares: 5, price: 20}), market(), {today: TODAY, now: NOW});
    expect(blind.portfolioValue).toBeUndefined();
    expect(blind.budget).toBeUndefined();
    expect(blind.rows[0].view.weightPercent).toBeUndefined();
  });

  it('prices a position without a purchase date, leaving out only the time held and the index comparison', () => {
    const undated = portfolioView(withPosition(emptyPortfolio(), {symbol: 'NVDA', shares: 30, price: 100}), market(),
      {today: TODAY, indexNow: 690, indexHistory: INDEX, now: NOW});
    expect(undated.rows[0].view.value).toBe(2400);
    expect(undated.rows[0].view.week).toBeUndefined();
    expect(undated.rows[0].view.indexPercent).toBeUndefined();
  });

  it('works out the loss budget from the settings: 1% of 100,000', () => {
    expect(view.budget).toBe(1000);
    expect([view.limitPercent, view.limitIsDefault]).toEqual([1, false]);
  });

  it('starts from the app\'s own limit until the user enters one, so amounts show from the first visit', () => {
    const fresh = portfolioView({...emptyPortfolio(), cash: 10_000}, market(), {today: TODAY, now: NOW});
    expect(fresh.budget).toBe(1000);                          // 10% of 10,000
    expect([fresh.limitPercent, fresh.limitIsDefault]).toEqual([10, true]);
  });

  it('gives a DIP BUY holding its tested bad case and what it would cost', () => {
    expect(row('NVDA').verdict).toBe('DIP BUY');
    expect(row('NVDA').cases).toEqual({group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85});
    expect(row('NVDA').risk!.loss).toBeCloseTo(984, 6);        // 2,400 x 41%
    expect(row('NVDA').risk!.overBudget).toBe(false);          // 984 is within the 1,000 budget
  });

  it('gives it the good case too', () => {
    expect(row('NVDA').risk!.gain).toBeCloseTo(2040, 6);       // 2,400 x 85%
  });

  it('gives no bad case to a holding without a verdict, such as a fund', () => {
    expect(row('VGT').verdict).toBeUndefined();
    expect(row('VGT').risk).toBeUndefined();
  });

  it('summarises the whole: value, positions without a price, and the bad cases together', () => {
    expect(view.summary.count).toBe(3);
    expect(view.summary.value).toBe(3500);                     // 2,400 + 1,100
    expect(view.summary.unpriced).toEqual(['GONE']);
    expect(view.summary.togetherCount).toBe(1);
    expect(view.summary.togetherLoss).toBeCloseTo(984, 6);
    expect(view.summary.togetherGain).toBeCloseTo(2040, 6);
  });

  // A second limit of the user's own: a share of the portfolio to keep in cash, whatever the plan offers.
  describe('the share to keep outside stocks', () => {
    const viewOf = (o: Partial<Portfolio>) => portfolioView({...holdings(), ...o}, market(), {today: TODAY, now: NOW, cases: CASES});
    // The same holdings without the one whose quote does not load.
    const {GONE: gone, ...priced} = holdings().positions;

    it('is that share of what the portfolio is worth, set against the cash', () => {
      // Worth 100,000 with 96,500 in cash: a fifth is 20,000, and the cash covers it.
      expect(viewOf({reservePercent: 20, positions: priced}).reserve)
        .toEqual({percent: 20, dollars: 20_000, cash: 96_500, short: 0, cashPercent: 96.5, atLeast: false});
    });

    it('says how much the cash is short of it', () => {
      // 5,000 in cash beside positions worth 3,500: worth 8,500. Four fifths is 6,800, and 1,800 is missing.
      const short = viewOf({cash: 5000, reservePercent: 80, positions: priced}).reserve!;
      expect([short.percent, short.dollars, short.cash, short.short]).toEqual([80, 6800, 5000, 1800]);
      // The cash as a share of the same worth, worked out once for every place that prints it.
      expect(short.cashPercent).toBeCloseTo(5000 / 8500 * 100, 9);
      // No cash at all: all of it is missing.
      const none = viewOf({cash: undefined, reservePercent: 20}).reserve!;
      expect([none.cash, none.dollars, none.short]).toEqual([0, 700, 700]);
    });

    // A holding whose quote did not load adds nothing to the worth, so a share of that worth is too small. For
    // the limit and the sizes too small is the careful side; for money to keep it is the other side.
    it('says that its amounts are the least they can be while a holding has no price', () => {
      const withOneUnpriced = viewOf({reservePercent: 20}).reserve!;
      expect(withOneUnpriced.atLeast).toBeTrue();
      expect(withOneUnpriced.dollars).withContext('worked out without the holding that has no price').toBe(20_000);
      expect(viewOf({reservePercent: 20, positions: priced}).reserve!.atLeast).toBeFalse();
    });

    it('is not there until the user enters a share, or while the portfolio is worth nothing', () => {
      expect(view.reserve).toBeUndefined();
      expect(portfolioView({...emptyPortfolio(), reservePercent: 20}, market(), {today: TODAY, now: NOW, cases: CASES}).reserve).toBeUndefined();
    });
  });

  it('is empty for an empty portfolio', () => {
    const empty = portfolioView(emptyPortfolio(), market(), {today: TODAY, now: NOW});
    expect(empty.rows).toEqual([]);
    expect(empty.budget).toBeUndefined();
  });
});
