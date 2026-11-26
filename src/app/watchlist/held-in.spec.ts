import {heldIn, heldText} from "./held-in";
import {PortfolioBook} from "./portfolio-book";

// The owner, of the Watchlist's line '"held" means held in <the portfolio last chosen>': "the fact that watchlist
// is mapping to a random portfolio is odd". A stock is tagged when any portfolio holds it, and the tag says where.
describe('heldIn and heldText (which portfolios hold a stock)', () => {
  const position = (symbol: string) => ({symbol, shares: 2, price: 50});
  // Made-up accounts.
  const BOOK = {
    v: 2, active: 'p2',
    portfolios: [
      {id: 'p1', name: 'Savings', v: 1, positions: {ACME: position('ACME'), ZED: position('ZED')}},
      {id: 'p2', name: 'Brokerage', v: 1, positions: {ACME: position('ACME')}},
      {id: 'p3', name: 'Pension', v: 1, positions: {ACME: position('ACME'), BOLT: position('BOLT')}},
    ],
  } as unknown as PortfolioBook;

  it('names every portfolio that holds the stock, whichever one is shown on the other view', () => {
    expect(heldIn(BOOK, 'ACME')).toEqual(['Savings', 'Brokerage', 'Pension']);
    expect(heldIn(BOOK, 'ZED')).withContext('not in the portfolio that is shown').toEqual(['Savings']);
    expect(heldIn(BOOK, 'NONE')).toEqual([]);
  });

  it('says in a sentence where it is held', () => {
    expect(heldText(['Savings'], 3)).toBe('You hold this in Savings.');
    expect(heldText(['Savings', 'Brokerage'], 3)).toBe('You hold this in Savings and Brokerage.');
    expect(heldText(['Savings', 'Brokerage', 'Pension'], 3)).toBe('You hold this in Savings, Brokerage and Pension.');
  });

  it('names nothing when there is one portfolio, and says nothing of a stock that is not held', () => {
    expect(heldText(['Portfolio'], 1)).toBe('You hold this.');
    expect(heldText([], 3)).toBe('');
  });
});
