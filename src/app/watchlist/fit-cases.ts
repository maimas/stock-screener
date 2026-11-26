import {signedWholeMoney} from "./format";
import {TestedCases} from "./sizing";

/**
 * What a stock's size in one portfolio could lose or make in 6 months, as "Could add" shows it in that stock's row:
 * the bad case, the typical one and the good one in dollars, the bad one first. For a stock's details, where the
 * size alone used to stand ("Brokerage: 16.8% ($1,978)") and what it could lose or make was on the other view.
 */
export type FitCases = { portfolio: string, bad: string, typical: string, good: string };

/**
 * The three cases of a size, in dollars, or nothing when there is no size (a stock that is held, or one that is
 * not marked DIP BUY) or the portfolio's name is not known.
 *
 * @param portfolio the portfolio the size is worked out for
 * @param sized     the stock's size there and what the bad and the good case come to at that size
 * @param cases     the tested cases of the stock, for the typical one
 */
export function fitCases(portfolio: string, sized: { dollars: number, loss: number, gain: number } | undefined,
                         cases: TestedCases | undefined): FitCases | undefined {
  if (!portfolio || !sized || !cases || !(sized.dollars > 0)) {
    return undefined;
  }
  // A portfolio worth a few cents gives a size of a few cents: three times "$0" would say nothing.
  if (Math.round(sized.loss) === 0 && Math.round(sized.gain) === 0) {
    return undefined;
  }
  return {
    portfolio,
    bad: signedWholeMoney(-sized.loss),
    typical: signedWholeMoney(sized.dollars * cases.typicalPercent / 100),
    good: signedWholeMoney(sized.gain),
  };
}
