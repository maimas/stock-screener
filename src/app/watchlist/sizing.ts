import {Signal, VOL_HIGH, VOL_LOW} from "./signal";
import {EVIDENCE, Figures} from "./evidence";
import {PositionView} from "./positions";

/**
 * Position sizing as arithmetic on two things: the loss the user is prepared to take on one position (their own
 * number) and how badly the tested DIP BUYs of that kind did in their worst tenth. It answers "how big a position
 * loses my budget in a tested bad case?" and nothing more: it does not say whether or what to buy.
 * The typical result and the best tenth of the same tests are carried along, so the bad case is never shown
 * alone; the size itself is worked out from the bad case only.
 */

/**
 * The title of the first box on the page: the portfolio being shown, with its cash and limit, today's plan for it
 * and what it holds. Texts read elsewhere on the page point to it by name.
 */
export const PLAN_BOX = 'Your plan today';
/**
 * What the page calls the user's loss budget: a field at the top of that box, which the plan points to by name.
 * In the texts it is "your limit".
 */
export const LIMIT_LABEL = 'Most I can lose on one stock';
/** The field beside it: the cash in the portfolio. */
export const CASH_LABEL = 'Cash';
/**
 * The third field: the share of the portfolio to keep outside stocks, a second limit of the user's own. In the
 * texts it is "what you keep outside stocks".
 */
export const KEEP_OUT_LABEL = 'Keep outside stocks';
/**
 * The fourth field, there only while the take-profit test offers a level: the level at which the user wants to take
 * a profit on a stock the plan covers. In the texts it is "the level you set".
 */
export const TAKE_PROFIT_LABEL = 'Take a profit at';
/** The heading of the table of holdings in that box ("positions" is the trade's word). */
export const OWN_TABLE = 'What you own';

/**
 * The limit the plan starts from until the user enters their own, as % of the portfolio, so that amounts show from
 * the first visit. 10% is the value the user chose for it on 2026-11-22 (the first version used 4%, about a tenth
 * of the portfolio in one stock of the riskiest kind). It is a starting value, said as such wherever an amount
 * depends on it; how much of the portfolio it lets into one stock is worked out, not written down (`shareThatFits`).
 */
export const DEFAULT_LIMIT_PERCENT = 10;

/**
 * How much of the portfolio, in whole %, fits in one stock under a limit: the limit divided by the tested bad case.
 * A 10% limit and a 41% bad case let 24% of the portfolio into that stock.
 */
export function shareThatFits(limitPercent: number, lossPercent: number): number {
  return Math.min(100, Math.round(limitPercent / lossPercent * 100));
}

/**
 * A tenth either way is not worth acting on: a holding counts as over the limit only when its bad case is more
 * than this share above it (prices move that much in days), and adding to one is offered only while this share
 * of what fits is still free.
 */
export const LIMIT_SLACK = 0.1;

/**
 * The same tenth for the share kept outside stocks: the plan's line HOLD BACK waits until the cash is more than
 * this share short of the amount to keep, because that amount moves with prices every day. The sentence under the
 * field, the split in "Could add" and the purchase forms say the gap to the dollar.
 */
export const KEEP_OUT_SLACK = LIMIT_SLACK;

/**
 * Amounts are said in whole dollars: a gap under half a dollar is no gap. One number for every place that decides
 * whether the cash "covers" the amount to keep.
 */
export const NO_GAP_UNDER = 0.5;

export type VolatilityGroup = 'volatile' | 'middle' | 'calm';

/**
 * What the tested DIP BUYs of one volatility group did in 26 weeks: the worst tenth lost `lossPercent` or more,
 * the typical one returned `typicalPercent`, and the best tenth gained `gainPercent` or more.
 */
export type TestedCases = { group: VolatilityGroup, lossPercent: number, typicalPercent: number, gainPercent: number };

export function volatilityGroup(volatility: number): VolatilityGroup {
  return volatility >= VOL_HIGH ? 'volatile' : volatility < VOL_LOW ? 'calm' : 'middle';
}

/**
 * The tested cases for a stock that is a DIP BUY now. Unknown otherwise: only DIP BUYs were measured.
 *
 * @param cases the tested results by group; the app's own figures unless a test fixes them
 */
export function casesFor(signal: Signal, cases: Figures['cases'] = EVIDENCE.cases): TestedCases | undefined {
  if (signal?.verdict !== 'DIP BUY' || signal.volatility === undefined) {
    return undefined;
  }
  const group = volatilityGroup(signal.volatility);
  const tested = cases[group];
  return {group, lossPercent: tested.bad, typicalPercent: tested.typical, gainPercent: tested.good};
}

/**
 * The user's loss budget for one position, in dollars: their chosen share of the portfolio value.
 * Unknown until there is both a percentage and a portfolio value to take it from.
 */
export function lossBudget(lossBudgetPercent: number | undefined, portfolioValue: number | undefined): number | undefined {
  return isPositive(lossBudgetPercent) && isPositive(portfolioValue) ? portfolioValue * lossBudgetPercent / 100 : undefined;
}

/** The position that loses exactly the budget if the bad case happens, in dollars and in whole shares. */
export function sizeForBudget(budget: number | undefined, lossPercent: number | undefined, price: number | undefined): { dollars: number, shares: number } | undefined {
  if (!isPositive(budget) || !isPositive(lossPercent) || !isPositive(price)) {
    return undefined;
  }
  const dollars = budget / (lossPercent / 100);
  return {dollars, shares: Math.floor(dollars / price)};
}

/** What the tested cases would mean, in dollars, for a position already held. */
export type PositionRisk = {
  /** What the bad case would cost. */
  loss: number
  /** What the typical tested result would add (it can be a small loss). */
  typical: number
  /** What the good case would add. */
  gain: number
  ofPortfolioPercent?: number
  /** More than LIMIT_SLACK over the loss budget; undefined when no budget is known. */
  overBudget?: boolean
};

export function riskOf(view: PositionView, cases: TestedCases | undefined, budget: number | undefined, portfolioValue: number | undefined): PositionRisk | undefined {
  if (!cases || view.value === undefined) {
    return undefined;
  }
  const loss = view.value * cases.lossPercent / 100;
  return {
    loss,
    typical: view.value * cases.typicalPercent / 100,
    gain: view.value * cases.gainPercent / 100,
    ofPortfolioPercent: isPositive(portfolioValue) ? loss / portfolioValue * 100 : undefined,
    overBudget: isPositive(budget) ? loss > budget * (1 + LIMIT_SLACK) : undefined,
  };
}

export type PortfolioSummary = {
  count: number
  cost: number
  /** Totals over the positions that have a current price. */
  value?: number
  gain?: number
  gainPercent?: number
  /** Symbols held whose quote did not load, so they have no price. */
  unpriced: string[]
  /** The bad cases of the holdings that have one, added up as if they all happened together. */
  togetherLoss?: number
  togetherPercent?: number
  /** Their good cases added up the same way. */
  togetherGain?: number
  /**
   * Those bad cases on top of the result so far (`gain`): where the holdings would stand, counted from what was
   * paid for them, in dollars and as % of that cost.
   */
  sinceBoughtIfBad?: number
  sinceBoughtIfBadPercent?: number
  /** The good cases on top of it, the same way. */
  sinceBoughtIfGood?: number
  sinceBoughtIfGoodPercent?: number
  togetherCount: number
};

export function summarize(views: PositionView[], risks: Map<string, PositionRisk>, portfolioValue: number | undefined): PortfolioSummary {
  const priced = views.filter(it => it.value !== undefined);
  const summary: PortfolioSummary = {
    count: views.length,
    cost: views.reduce((sum, it) => sum + it.cost, 0),
    unpriced: views.filter(it => it.value === undefined).map(it => it.position.symbol),
    togetherCount: 0,
  };
  const pricedCost = priced.reduce((sum, it) => sum + it.cost, 0);
  if (priced.length) {
    summary.value = priced.reduce((sum, it) => sum + it.value!, 0);
    summary.gain = summary.value - pricedCost;
    summary.gainPercent = (summary.value / pricedCost - 1) * 100;
  }
  const held = views.map(it => risks.get(it.position.symbol)).filter((it): it is PositionRisk => !!it);
  if (held.length) {
    summary.togetherCount = held.length;
    summary.togetherLoss = held.reduce((sum, it) => sum + it.loss, 0);
    summary.togetherGain = held.reduce((sum, it) => sum + it.gain, 0);
    summary.togetherPercent = isPositive(portfolioValue) ? summary.togetherLoss / portfolioValue * 100 : undefined;
    if (summary.gain !== undefined) {
      summary.sinceBoughtIfBad = summary.gain - summary.togetherLoss;
      summary.sinceBoughtIfBadPercent = summary.sinceBoughtIfBad / pricedCost * 100;
      summary.sinceBoughtIfGood = summary.gain + summary.togetherGain;
      summary.sinceBoughtIfGoodPercent = summary.sinceBoughtIfGood / pricedCost * 100;
    }
  }
  return summary;
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
