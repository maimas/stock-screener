import {EVIDENCE, Figures} from "./evidence";
import {Held, sizeOfNew, SizingInput} from "./recommendations";
import {TestedCases} from "./sizing";

/**
 * The cash of one portfolio split between the stocks the user ticked in "Could add".
 *
 * The user chooses which stocks; this only says how much of each. The function sells nothing: it splits the cash it
 * is handed over the portfolio it is handed, and what the portfolio is worth does not change when cash becomes
 * stock. "Could add" may hand it the portfolio as it would be after the plan's SELL SOME (`afterSelling` in
 * recommendations.ts), with the money that would free counted in `cash`: the split is then as if those sales were
 * made, `cash` is more than the cash entered, and "today" in `togetherLossBefore` is the portfolio after the sale,
 * which the box replaces with the portfolio as it is.
 *  - The portfolio it aims at is what is held plus the ticked stocks that are new to it.
 *  - In that portfolio every stock has its equal share of the risk, never more than fits the limit
 *    (recommendations.ts). What a ticked stock is short of that share is its gap.
 *  - The cash goes to the ticked stocks in proportion to their gaps, and no stock gets more than its gap. What is
 *    left stays cash.
 * Like every size on the page this is arithmetic on the tested bad cases, not a tested rule: how to split money
 * between stocks was not tested.
 */

/** A ticked row: a stock marked DIP BUY, new to the portfolio or already held (then it is among the holdings). */
export type Picked = { symbol: string, cases: TestedCases };

/**
 * What bounded a ticked stock's amount: the cash covered only part of its gap ('cash'); it got its whole gap
 * ('share'); it got its whole gap and the limit had made that share smaller ('limit'); or it had no gap, being at
 * its share already with these stocks in the portfolio ('none').
 */
export type SplitBound = 'cash' | 'share' | 'limit' | 'none';

export type SplitPart = {
  symbol: string
  /** Already held: the amount is added to what is held. */
  owned: boolean
  /** What it is short of its share in the portfolio as it would be; 0 when it is at or above it. */
  gap: number
  /** What the cash gives it: never more than the gap. */
  dollars: number
  bound: SplitBound
  /** What the tested bad case and the tested good case would mean on the amount bought, in dollars. */
  loss: number
  gain: number
};

export type CashSplit = {
  /** One for each ticked stock, in the order given. */
  parts: SplitPart[]
  /** The cash the split starts from: never less than nothing, never more than the portfolio's worth less its priced holdings. */
  cash: number
  /** The gaps of the ticked stocks added up, what the cash gives them in all, and what is left of the cash. */
  gap: number
  placed: number
  left: number
  /** How many stocks the portfolio holds today, and would hold after the purchase (a new stock counts once it gets something). */
  stocksBefore: number
  stocksAfter: number
  /** The bad cases of every stock marked DIP BUY added up as if they all happened together: today, and after the purchase. */
  togetherLossBefore: number
  togetherLossAfter: number
};

/** Under half a cent an amount shows as $0: it counts as no gap, and as no shortfall of the cash. */
const CENT = 0.005;

/**
 * @param input  what the sizes of this portfolio are worked out from (`sizingFor`): its worth, its limit, its priced holdings
 * @param cash   the cash to split; counted as nothing when it is not a positive number, and never as more than the
 *               portfolio's worth less its priced holdings
 * @param picked the ticked stocks, each once. One that is among the holdings is owned; any other is new
 * @param f      the tested figures (tests); the app's own when omitted
 */
export function cashSplit(input: SizingInput, cash: number, picked: Picked[], f: Figures = EVIDENCE): CashSplit {
  const held = new Map(input.holdings.map(it => [it.symbol, it] as const));
  const invested = input.holdings.reduce((sum, it) => sum + it.value, 0);
  const available = Math.max(0, Math.min(Number.isFinite(cash) ? cash : 0, input.portfolioValue - invested));

  // The portfolio aimed at: what is held, and the ticked stocks that are new to it.
  const aimedAt: Held[] = [
    ...input.holdings,
    ...picked.filter(it => !held.has(it.symbol)).map(it => ({symbol: it.symbol, value: 0, cases: it.cases})),
  ];
  // What each ticked stock is short of its whole size in that portfolio. The whole size is `sizeOfNew`'s, with the
  // other stocks of that portfolio as the ones held: an equal share of the risk, within the limit, by the same
  // rules as the "Size" column (the stand-in for a stock without a mark and "as if three" included).
  const wanted = picked.map(it => {
    const whole = sizeOfNew(it.cases, {...input, holdings: aimedAt.filter(other => other.symbol !== it.symbol)}, f);
    const short = whole.dollars - (held.get(it.symbol)?.value ?? 0);
    return {it, capped: whole.capped, gap: short < CENT ? 0 : short};
  });
  const gap = wanted.reduce((sum, it) => sum + it.gap, 0);
  // The same part of its gap for every stock: all of it when the cash is enough.
  const share = gap <= available + CENT ? 1 : available / gap;

  const parts: SplitPart[] = wanted.map(({it, capped, gap: own}) => {
    const dollars = own * share;
    return {
      symbol: it.symbol, owned: held.has(it.symbol), gap: own, dollars,
      bound: own === 0 ? 'none' : share < 1 ? 'cash' : capped ? 'limit' : 'share',
      loss: dollars * it.cases.lossPercent / 100, gain: dollars * it.cases.gainPercent / 100,
    };
  });
  const placed = parts.reduce((sum, it) => sum + it.dollars, 0);
  const togetherLossBefore = input.holdings.reduce((sum, it) => sum + (it.cases ? it.value * it.cases.lossPercent / 100 : 0), 0);
  return {
    parts, cash: available, gap, placed, left: Math.max(0, available - placed),
    stocksBefore: input.holdings.length,
    stocksAfter: input.holdings.length + parts.filter(it => !it.owned && it.dollars >= CENT).length,
    togetherLossBefore,
    togetherLossAfter: togetherLossBefore + parts.reduce((sum, it) => sum + it.loss, 0),
  };
}
