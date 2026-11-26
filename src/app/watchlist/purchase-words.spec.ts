import {
  cashAfter, coveredByCash, keptShareCaution, leftAsItIs, overCash, purchaseCaution, purchaseTrade, saleCaution, startFrom
} from "./purchase-words";

describe('purchaseTrade (a purchase as it is handed to the page)', () => {
  it('makes a new holding of a stock that is not held, and takes its cost out of the cash when asked to', () => {
    expect(purchaseTrade('ACME', undefined, {shares: 10, price: 50, day: '2026-11-21'}, true)).toEqual({
      symbol: 'ACME', holding: {symbol: 'ACME', shares: 10, price: 50, day: '2026-11-21'}, cashChange: -500,
      text: 'Added 10 shares of ACME at 50.00.',
    });
  });

  it('adds to a stock that is held: the shares added up, the price averaged, and the cash left alone when not asked', () => {
    const trade = purchaseTrade('ACME', {symbol: 'ACME', shares: 30, price: 60}, {shares: 10, price: 50}, false);
    expect([trade.holding!.shares, trade.holding!.price, trade.cashChange]).toEqual([40, 57.5, 0]);
    expect(trade.text).toBe('Bought 10 more shares of ACME at 50.00.');
  });

  it('says one share in the singular, and leaves the day out when none was given', () => {
    const trade = purchaseTrade('ACME', undefined, {shares: 1, price: 50}, false);
    expect(trade.text).toBe('Added 1 share of ACME at 50.00.');
    expect(trade.holding).toEqual({symbol: 'ACME', shares: 1, price: 50});
  });
});

// Found by a review of the page: the forms that record a purchase did not agree about their cash box. One arrived
// unticked when the cash was short; another arrived ticked and turned red as soon as three shares were typed.
describe('the one rule of the box "Paid from this portfolio\'s cash"', () => {
  it('is ticked while the cash recorded covers what is entered', () => {
    expect(coveredByCash(600, 5000)).toBeTrue();
    expect(coveredByCash(5000, 5000)).toBeTrue();
    expect(coveredByCash(0, 40)).withContext('nothing entered yet').toBeTrue();
  });

  it('is not ticked when the cash is short, when there is none, or when none is recorded', () => {
    expect(coveredByCash(600, 40)).toBeFalse();
    expect(coveredByCash(600, 0)).toBeFalse();
    expect(coveredByCash(600, undefined)).toBeFalse();
  });

  it('says why it is unticked when the cash is short, and nothing otherwise', () => {
    expect(leftAsItIs(600, 40, false)).toBe(' It is more than the $40 of cash recorded, so the cash is left as it is.');
    expect(leftAsItIs(600, 5000, false)).withContext('the reader unticked it; the cash would cover it').toBe('');
    expect(leftAsItIs(600, 40, true)).withContext('ticked: the form refuses instead').toBe('');
    expect(leftAsItIs(600, undefined, false)).toBe('');
  });
});

describe('what is refused and what is said about the cash', () => {
  it('refuses a purchase paid from more cash than is recorded, with the two ways on', () => {
    expect(overCash(1800, 1000, true)).toBe(
      'That is $1,800, more than the $1,000 of cash recorded. Untick the box to leave your cash as it is, or correct "Cash" first.');
    expect(overCash(1800, 1000, false)).withContext('not paid from the cash').toBeUndefined();
    expect(overCash(1000, 1000, true)).withContext('the cash covers it').toBeUndefined();
    expect(overCash(1800, undefined, true)).withContext('no cash on record').toBeUndefined();
  });

  it('says what the cash would be, only when the purchase is paid from it', () => {
    expect(cashAfter(1800, 5000, true)).toBe(' Cash would go from $5,000 to $3,200.');
    expect(cashAfter(1800, 5000, false)).toBe('');
  });
});

// Found by a review of the page: with two rows ticked the form for several came to 2 cents more than the cash it
// was filled in from, so its box for the cash arrived unticked and the purchases would not have left the cash.
describe('startFrom (the shares and the price a form is filled in with)', () => {
  it('gives the price to the cent and the shares the amount buys at it, to four decimals', () => {
    expect(startFrom(2013, 50)).toEqual({shares: 40.26, paid: 50});
    expect(startFrom(2012.99, 50)).toEqual({shares: 40.2598, paid: 50});
  });

  it('rounds the shares down, so that they never cost more than the amount', () => {
    // 1,000 at 7.77 is 128.70012...; to the nearest that is the same, but 500 at 7.77 is 64.35006 and 333.34 at
    // 13.13 is 25.38766...: to the nearest 25.3877, which costs 333.3405.
    const filled = startFrom(333.34, 13.13);
    expect(filled.shares).toBe(25.3876);
    expect(filled.shares! * filled.paid!).toBeLessThanOrEqual(333.34);
  });

  it('never comes to more than the cash when the amounts are that cash split between several stocks', () => {
    const cash = 1000;
    const parts: [number, number][] = [[333.33, 7.774], [333.33, 13.136], [333.34, 101.015]];
    const total = parts.map(([dollars, price]) => startFrom(dollars, price)).reduce((sum, it) => sum + it.shares! * it.paid!, 0);
    expect(total).toBeLessThanOrEqual(cash);
    expect(total).withContext('and not far under it').toBeGreaterThan(cash - 0.05);
  });

  it('has no shares without an amount or without a price, and no price without one', () => {
    expect(startFrom(undefined, 50)).toEqual({shares: null, paid: 50});
    expect(startFrom(2013, undefined)).toEqual({shares: null, paid: null});
    expect(startFrom(0, 50)).toEqual({shares: null, paid: 50});
  });
});

// The user may set a share of the portfolio to keep outside stocks. A purchase paid from the cash can take the
// cash under it: the form says so before saving, as the plan would say HOLD BACK the day after.
describe('keptShareCaution (a purchase that takes the cash under what is kept outside stocks)', () => {
  it('says what the cash would be and how far under the kept amount', () => {
    expect(keptShareCaution(800, {cash: 2000, keep: 2000, viaCash: true}))
      .toBe('After this purchase your cash would be $1,200: $800 under the $2,000 you keep outside stocks.');
    expect(keptShareCaution(800, {cash: 2000, keep: 2000, viaCash: true, several: true}))
      .toBe('After these purchases your cash would be $1,200: $800 under the $2,000 you keep outside stocks.');
  });

  it('says so also when the cash was under it already', () => {
    expect(keptShareCaution(100, {cash: 500, keep: 2000, viaCash: true}))
      .toBe('After this purchase your cash would be $400: $1,600 under the $2,000 you keep outside stocks.');
  });

  it('says nothing while the cash left covers it, to within 50 cents', () => {
    expect(keptShareCaution(800, {cash: 3000, keep: 2000, viaCash: true})).toBe('');
    expect(keptShareCaution(1000.4, {cash: 3000, keep: 2000, viaCash: true})).withContext('40 cents under').toBe('');
    expect(keptShareCaution(1000.5, {cash: 3000, keep: 2000, viaCash: true})).withContext('50 cents under').not.toBe('');
  });

  it('says nothing when no share is kept, or when the purchase is not paid from the cash', () => {
    expect(keptShareCaution(800, {cash: 2000, keep: undefined, viaCash: true})).toBe('');
    expect(keptShareCaution(800, {cash: 2000, keep: null, viaCash: true})).toBe('');
    expect(keptShareCaution(800, {cash: 2000, keep: 0, viaCash: true})).toBe('');
    expect(keptShareCaution(800, {cash: 2000, keep: 2000, viaCash: false})).toBe('');
    expect(keptShareCaution(800, {cash: undefined, keep: 2000, viaCash: true})).toBe('');
  });
});

// A digit too many or too few in a price or in a number of shares was caught only by reading the preview. Two
// signs of such a slip are now said while the purchase is typed. They are questions: nothing is refused.
// Found by a review of the page: "Sold some" took a price ten times today's without a word, and the cash recorded
// (and with it the split in "Could add") followed it.
describe('saleCaution (a sale price that looks like a slip of a finger)', () => {
  it('asks about a price a fifth or more from today\'s, above or below', () => {
    expect(saleCaution(500, 50)).toBe('The price sold at is 900% above today\'s price of 50.00. Check the numbers before you record it.');
    expect(saleCaution(5, 50)).toBe('The price sold at is 90% below today\'s price of 50.00. Check the numbers before you record it.');
  });

  it('says nothing of a price near today\'s, and nothing while either price is missing', () => {
    expect(saleCaution(55, 50)).toBe('');
    expect(saleCaution(undefined, 50)).toBe('');
    expect(saleCaution(50, undefined)).toBe('');
  });
});

describe('purchaseCaution (what looks like a slip of a finger)', () => {
  const o = {todayPrice: 50, rowDollars: 2000, today: '2026-11-21'};

  it('says nothing of a purchase near today\'s price and near the amount of its row', () => {
    expect(purchaseCaution({shares: 40, price: 50, day: '2026-11-21'}, o)).toBe('');
    expect(purchaseCaution({shares: 30, price: 58}, o)).withContext('16% above, less than the row').toBe('');
  });

  it('points out a price far from today\'s, above or below', () => {
    expect(purchaseCaution({shares: 4, price: 500, day: '2026-11-21'}, o)).toBe("The price paid is 900% above today's price of 50.00.");
    expect(purchaseCaution({shares: 40, price: 5}, o)).toBe("The price paid is 90% below today's price of 50.00.");
  });

  it('does not compare the price of a purchase made on an earlier day with today\'s', () => {
    expect(purchaseCaution({shares: 40, price: 30, day: '2026-08-03'}, o)).toBe('');
  });

  it('points out an amount of twice the row\'s or more, and says how many times', () => {
    expect(purchaseCaution({shares: 100, price: 50}, o)).toBe('That is $5,000, 2.5 times the amount in its row ($2,000).');
    expect(purchaseCaution({shares: 400, price: 50}, o)).toBe('That is $20,000, 10 times the amount in its row ($2,000).');
  });

  it('says both when both stand out, and nothing of an amount where the row has none', () => {
    expect(purchaseCaution({shares: 40, price: 500}, o)).toBe(
      "The price paid is 900% above today's price of 50.00. That is $20,000, 10 times the amount in its row ($2,000).");
    expect(purchaseCaution({shares: 400, price: 50}, {todayPrice: 50, today: '2026-11-21'})).toBe('');
  });
});
