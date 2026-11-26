import {
  afterSale, emptyPortfolio, parsePortfolio, Portfolio, positionProblem, purchaseProblem, saleProblem, viewOf, withoutPosition,
  withPosition, withPurchase,
} from "./positions";

const TODAY = '2026-11-21';
const NVDA = {symbol: 'NVDA', shares: 10, price: 100, day: '2026-11-01'};

describe('positionProblem', () => {
  it('accepts a complete position bought today or earlier', () => {
    expect(positionProblem(NVDA, TODAY)).toBeUndefined();
    expect(positionProblem({...NVDA, day: TODAY}, TODAY)).toBeUndefined();
  });

  it('accepts a fraction of a share', () => {
    expect(positionProblem({...NVDA, shares: 0.25}, TODAY)).toBeUndefined();
  });

  it('asks for the number of shares when it is missing, zero or negative', () => {
    [undefined, 0, -5, NaN].forEach(shares => expect(positionProblem({...NVDA, shares}, TODAY)).toMatch(/shares/i));
  });

  it('asks for the price paid when it is missing or not positive', () => {
    [undefined, 0, -1, NaN].forEach(price => expect(positionProblem({...NVDA, price}, TODAY)).toMatch(/price/i));
  });

  it('rejects a purchase date in the future', () => {
    expect(positionProblem({...NVDA, day: '2026-11-22'}, TODAY)).toMatch(/future/i);
  });

  it("accepts a position without a purchase date: a broker's position list does not give one", () => {
    expect(positionProblem({symbol: 'NVDA', shares: 40, price: 150.5}, TODAY)).toBeUndefined();
    expect(positionProblem({...NVDA, day: ''}, TODAY)).toBeUndefined();
  });

  it('rejects a malformed date', () => {
    expect(positionProblem({...NVDA, day: '21/11/2026'}, TODAY)).toMatch(/date/i);
  });
});

describe('withPosition / withoutPosition', () => {
  it('adds a position without changing the portfolio it was given', () => {
    const before = emptyPortfolio();
    const after = withPosition(before, NVDA);
    expect(after.positions['NVDA']).toEqual(NVDA);
    expect(before.positions['NVDA']).toBeUndefined();
  });

  it('replaces the position of the same symbol', () => {
    const after = withPosition(withPosition(emptyPortfolio(), NVDA), {...NVDA, shares: 25, price: 90});
    expect(Object.keys(after.positions)).toEqual(['NVDA']);
    expect(after.positions['NVDA'].shares).toBe(25);
  });

  it('keeps the settings and the other positions when one is removed', () => {
    let portfolio: Portfolio = {...emptyPortfolio(), cash: 500, lossBudgetPercent: 1};
    portfolio = withPosition(withPosition(portfolio, NVDA), {symbol: 'AMD', shares: 3, price: 400, day: TODAY});
    const after = withoutPosition(portfolio, 'NVDA');
    expect(Object.keys(after.positions)).toEqual(['AMD']);
    expect(after.cash).toBe(500);
    expect(after.lossBudgetPercent).toBe(1);
  });
});

describe('viewOf', () => {
  it('works out cost, value, result, weight and time held for a priced position', () => {
    // 10 shares bought at 100 on Nov 1; now 80; a 10,000 portfolio; the S&P went from 750 to 690.
    const view = viewOf(NVDA, {price: 80, portfolioValue: 10_000, today: TODAY, indexThen: 750, indexNow: 690});
    expect(view.cost).toBe(1000);
    expect(view.value).toBe(800);
    expect(view.gain).toBe(-200);
    expect(view.gainPercent).toBeCloseTo(-20, 6);
    expect(view.weightPercent).toBeCloseTo(8, 6);
    expect(view.daysHeld).toBe(20);
    expect(view.week).toBe(3);                       // days 14-20 are the third week
    expect(view.indexPercent).toBeCloseTo(-8, 6);
    expect(view.beyondTested).toBe(false);
  });

  it('counts the purchase day as the first day of week 1', () => {
    expect(viewOf({...NVDA, day: TODAY}, {price: 100, today: TODAY}).week).toBe(1);
  });

  it('says a position is beyond the 6 months the tests followed from day 182 on', () => {
    const lastDay = viewOf({...NVDA, day: '2026-05-24'}, {price: 100, today: TODAY});                     // day 181
    expect([lastDay.week, lastDay.beyondTested]).toEqual([26, false]);
    const dayAfter = viewOf({...NVDA, day: '2026-05-23'}, {price: 100, today: TODAY});                    // day 182
    expect([dayAfter.week, dayAfter.beyondTested]).toEqual([27, true]);
  });

  it('leaves value, result and weight unknown when the stock has no price (its quote did not load)', () => {
    const view = viewOf(NVDA, {today: TODAY, portfolioValue: 10_000});
    expect(view.cost).toBe(1000);
    expect(view.value).toBeUndefined();
    expect(view.gainPercent).toBeUndefined();
    expect(view.weightPercent).toBeUndefined();
  });

  it('has no time held and no index comparison for a position without a purchase date', () => {
    const view = viewOf({symbol: 'NVDA', shares: 40, price: 150.5}, {price: 125.53, today: TODAY, indexThen: 750, indexNow: 690});
    expect(view.value).toBeCloseTo(5021.2, 2);
    expect(view.daysHeld).toBeUndefined();
    expect(view.week).toBeUndefined();
    expect(view.beyondTested).toBe(false);
    expect(view.indexPercent).toBeUndefined();
  });

  it('leaves the weight unknown without a portfolio value, and the index comparison without index levels', () => {
    const view = viewOf(NVDA, {price: 80, today: TODAY});
    expect(view.weightPercent).toBeUndefined();
    expect(view.indexPercent).toBeUndefined();
  });
});

describe('parsePortfolio (reading an exported or stored file)', () => {
  const good = {v: 1, cash: 120.4, lossBudgetPercent: 1, savedAt: '2026-11-21T10:00:00.000Z', positions: {NVDA}};

  it('reads back a portfolio written by this app', () => {
    expect(parsePortfolio(JSON.stringify(good))).toEqual(good as Portfolio);
  });

  it('accepts a portfolio without settings or a save time', () => {
    expect(parsePortfolio(JSON.stringify({v: 1, positions: {NVDA}}))).toEqual({v: 1, positions: {NVDA}});
  });

  it('drops fields it does not know, such as something added by hand', () => {
    const text = JSON.stringify({...good, note: 'mine', positions: {NVDA: {...NVDA, broker: 'x'}}});
    expect(parsePortfolio(text)).toEqual(good as Portfolio);
  });

  it('rejects text that is not JSON, or not a portfolio', () => {
    ['', 'not json', '[]', '{"v":2,"positions":{}}', '{"v":1}', '{"v":1,"positions":[]}'].forEach(text =>
      expect(parsePortfolio(text)).withContext(text).toBeUndefined());
  });

  it('rejects a file with a broken position rather than importing half of it', () => {
    const broken = [{...NVDA, shares: 0}, {...NVDA, price: 'cheap'}, {...NVDA, day: 'yesterday'}, {...NVDA, symbol: ''}];
    broken.forEach(position => expect(parsePortfolio(JSON.stringify({v: 1, positions: {NVDA: position}})))
      .withContext(JSON.stringify(position)).toBeUndefined());
  });

  it('rejects negative cash and a loss budget that is not a number', () => {
    expect(parsePortfolio(JSON.stringify({v: 1, cash: -5, positions: {}}))).toBeUndefined();
    expect(parsePortfolio(JSON.stringify({v: 1, lossBudgetPercent: 'one', positions: {}}))).toBeUndefined();
  });

  // The share to keep outside stocks is a setting like the limit: read back as written, absent in older files, and a
  // value that cannot be a share makes the file unsound rather than being dropped in silence.
  it('reads the share to keep outside stocks, and does without it in a file written before there was one', () => {
    expect(parsePortfolio(JSON.stringify({...good, reservePercent: 20}))).toEqual({...good, reservePercent: 20} as Portfolio);
    expect(parsePortfolio(JSON.stringify({...good, reservePercent: null}))).toEqual(good as Portfolio);
    expect(parsePortfolio(JSON.stringify(good))!.reservePercent).toBeUndefined();
  });

  it('rejects a share to keep outside stocks that is below 0, or all of the portfolio and more, or not a number', () => {
    [-5, 100, 150, 'a fifth'].forEach(reservePercent =>
      expect(parsePortfolio(JSON.stringify({v: 1, reservePercent, positions: {}}))).withContext(String(reservePercent)).toBeUndefined());
  });

  // The level for taking a profit is a setting too: read back as written, absent in older files, none for a zero.
  it('reads the level for taking a profit, and does without it in a file written before there was one', () => {
    expect(parsePortfolio(JSON.stringify({...good, takeProfitPercent: 15}))).toEqual({...good, takeProfitPercent: 15} as Portfolio);
    expect(parsePortfolio(JSON.stringify({...good, takeProfitPercent: null}))).toEqual(good as Portfolio);
    expect(parsePortfolio(JSON.stringify({...good, takeProfitPercent: 0}))).toEqual(good as Portfolio);
    expect(parsePortfolio(JSON.stringify(good))!.takeProfitPercent).toBeUndefined();
  });

  it('rejects a level for taking a profit that is not a number above 0', () => {
    [-5, 'fifteen'].forEach(takeProfitPercent =>
      expect(parsePortfolio(JSON.stringify({v: 1, takeProfitPercent, positions: {}}))).withContext(String(takeProfitPercent)).toBeUndefined());
  });

  // The field takes a zero as "none". A file with a zero in it (typed by hand, or from another tool) means the
  // same: one stray zero is no reason to refuse the whole book.
  it('reads a share of zero as no share', () => {
    expect(parsePortfolio(JSON.stringify({...good, reservePercent: 0}))).toEqual(good as Portfolio);
  });

  it('accepts zero cash, and drops the portfolio value the first version stored (it is now worked out)', () => {
    expect(parsePortfolio(JSON.stringify({v: 1, cash: 0, value: 100_000, positions: {}}))).toEqual({v: 1, cash: 0, positions: {}});
  });

  it('keeps a position without a purchase date exactly as it is', () => {
    const undated = {symbol: 'NVDA', shares: 40, price: 150.5};
    expect(parsePortfolio(JSON.stringify({v: 1, positions: {NVDA: undated}}))!.positions['NVDA']).toEqual(undated);
  });

  it('files each position under its own symbol, whatever key the file used', () => {
    expect(Object.keys(parsePortfolio(JSON.stringify({v: 1, positions: {first: NVDA}}))!.positions)).toEqual(['NVDA']);
  });
});

// Until now a second purchase had to be typed over the first: the reader worked out the new number of shares and
// the new average price themselves, and a slip there was silent. The page does that arithmetic.
describe('withPurchase (one more purchase of a stock that is already held)', () => {
  const held = {symbol: 'ACME', shares: 10, price: 100, day: '2026-10-01'};

  it('adds the shares up and averages the price paid by what each part cost', () => {
    // 10 at 100 cost 1,000; 30 more at 60 cost 1,800: 40 shares that cost 2,800, so 70 a share.
    const after = withPurchase(held, {shares: 30, price: 60, day: '2026-10-01'});
    expect(after).toEqual({symbol: 'ACME', shares: 40, price: 70, day: '2026-10-01'});
  });

  it('keeps one day for the whole holding: the average day the money went in, each part weighted by its cost', () => {
    // 1,000 went in on Oct 3 and 3,000 on Oct 23, twenty days later: three quarters of the way, Oct 18. (Made-up
    // days, a Saturday and a Sunday among them: no day in a test is a day anything was really bought.)
    const first = {...held, day: '2026-10-03'};
    expect(withPurchase(first, {shares: 30, price: 100, day: '2026-10-23'}).day).toBe('2026-10-18');
    // A small later purchase moves the day a little; it does not start the 6 months again.
    expect(withPurchase(held, {shares: 1, price: 100, day: '2026-11-20'}).day).toBe('2026-10-06');
  });

  it('leaves the day as it was recorded when one of the two days is not known', () => {
    expect(withPurchase(held, {shares: 5, price: 100}).day).toBe('2026-10-01');
    const undated = {symbol: 'ACME', shares: 10, price: 100};
    expect(withPurchase(undated, {shares: 5, price: 100, day: '2026-11-20'}).day).withContext('the earlier day is unknown, so no average').toBeUndefined();
  });

  it('handles fractions of a share without leaving rounding dust', () => {
    const after = withPurchase({symbol: 'ACME', shares: 0.1, price: 100}, {shares: 0.2, price: 130});
    expect(after.shares).toBe(0.3);
    expect(after.price).toBe(120);
  });

  it('does not change the holding it was given', () => {
    withPurchase(held, {shares: 30, price: 60});
    expect(held).toEqual({symbol: 'ACME', shares: 10, price: 100, day: '2026-10-01'});
  });
});

describe('purchaseProblem', () => {
  it('accepts a purchase with shares and a price, with a day or without', () => {
    expect(purchaseProblem({shares: 5, price: 61.5, day: '2026-11-20'}, TODAY)).toBeUndefined();
    expect(purchaseProblem({shares: 0.5, price: 61.5}, TODAY)).toBeUndefined();
  });

  it('says in words what is missing or cannot be right', () => {
    expect(purchaseProblem({price: 60}, TODAY)).toBe('Enter how many shares you bought.');
    expect(purchaseProblem({shares: 5, price: 0}, TODAY)).toBe('Enter the price you paid per share.');
    expect(purchaseProblem({shares: 5, price: 60, day: '2026-11-22'}, TODAY)).toBe('The purchase date cannot be in the future.');
  });
});

describe('afterSale (some of the shares of a holding sold)', () => {
  const held = {symbol: 'ACME', shares: 10, price: 100, day: '2026-10-01'};

  it('takes the shares off and leaves the price paid and the day as they were', () => {
    expect(afterSale(held, 4)).toEqual({symbol: 'ACME', shares: 6, price: 100, day: '2026-10-01'});
    expect(afterSale({symbol: 'ACME', shares: 0.3, price: 100}, 0.1)).toEqual({symbol: 'ACME', shares: 0.2, price: 100});
  });

  it('leaves nothing when every share is sold', () => {
    expect(afterSale(held, 10)).toBeUndefined();
  });
});

describe('saleProblem', () => {
  const held = {symbol: 'ACME', shares: 10, price: 100};

  it('accepts a sale of some or of all of the shares held', () => {
    expect(saleProblem(held, 4)).toBeUndefined();
    expect(saleProblem(held, 10)).toBeUndefined();
  });

  it('says in words what is missing or cannot be right', () => {
    expect(saleProblem(held, undefined)).toBe('Enter how many shares you sold.');
    expect(saleProblem(held, 0)).toBe('Enter how many shares you sold.');
    // A number below zero is a slip of its own, and is named as that: it used to get the sentence for an empty field.
    expect(saleProblem(held, -3)).toBe('The shares sold cannot be less than 0.');
    expect(purchaseProblem({shares: -3, price: 60}, TODAY)).toBe('The shares bought cannot be less than 0.');
    expect(saleProblem(held, 12)).toBe('You hold 10 shares: enter that many or fewer.');
    expect(saleProblem({symbol: 'ACME', shares: 1, price: 100}, 2)).toBe('You hold 1 share: enter that many or fewer.');
  });
});
