import {PortfolioBook} from "./portfolio-book";

/**
 * Which of the portfolios hold a stock. The Watchlist is about the market, not about one portfolio: its "held"
 * tags used to mean "held in the portfolio last chosen on the other view", which the owner called odd ("the
 * watchlist is mapping to a random portfolio"). A stock is tagged when any portfolio holds it, and the tag says
 * in which.
 */

/** The names of the portfolios that hold the stock, in the order the portfolios are listed. */
export function heldIn(book: PortfolioBook, symbol: string): string[] {
  return book.portfolios.filter(it => !!it.positions[symbol]).map(it => it.name);
}

/**
 * What the "held" tag says where the pointer rests on it, and to a screen reader: "You hold this in Savings.",
 * "You hold this in Savings and Brokerage." With one portfolio there is nothing to name: "You hold this." Empty
 * when no portfolio holds the stock.
 */
export function heldText(names: string[], portfolios: number): string {
  if (names.length === 0) {
    return '';
  }
  if (portfolios < 2) {
    return 'You hold this.';
  }
  const listed = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `You hold this in ${listed}.`;
}
