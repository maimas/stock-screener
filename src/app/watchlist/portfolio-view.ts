import {ChartSeries, Stock} from "../api/microsoft-money.service";
import {computeSignal, signalFor, SignalVerdict} from "./signal";
import {closeOnOrBefore} from "./market-math";
import {Portfolio, PositionView, viewOf} from "./positions";
import {casesFor, DEFAULT_LIMIT_PERCENT, lossBudget, PortfolioSummary, PositionRisk, riskOf, summarize, TestedCases} from "./sizing";
import {Figures} from "./evidence";

/** One holding joined with what the page knows about its stock today. */
export type PositionRow = {
  symbol: string
  view: PositionView
  /** The stock's verdict now, when it has one. */
  verdict?: SignalVerdict
  /** What tested DIP BUYs of its volatility did, for a holding that is a DIP BUY now. */
  cases?: TestedCases
  /** What those cases would mean for this holding, in dollars. */
  risk?: PositionRisk
};

export type PortfolioView = {
  rows: PositionRow[]
  summary: PortfolioSummary
  /** The positions at today's prices plus the cash. Weights and the loss budget are measured against it. */
  portfolioValue?: number
  /**
   * The limit for a loss on one stock, in dollars: `limitPercent` of the portfolio value. Unknown only while the
   * portfolio is worth nothing yet.
   */
  budget?: number
  /** That limit as % of the portfolio: the user's own number, or the app's starting one until they enter it. */
  limitPercent: number
  /** The limit in use is the app's starting one, not the user's. */
  limitIsDefault: boolean
  /**
   * The share the user wants to keep outside stocks, once they entered one and the portfolio is worth something:
   * that share in percent and in dollars, the cash there is, and how much the cash is short of it (0 when it
   * covers it). Cash is all that counts as outside stocks.
   */
  reserve?: Reserve
};

/**
 * `cashPercent` is the cash as a share of what the portfolio is worth, worked out here once so that every place
 * that prints it prints the same figure. `atLeast` is set while a holding has no price: the portfolio is then
 * worth more than could be counted, so the dollars to keep and what the cash is short of them are the least they
 * can be, and "the cash covers it" cannot be said.
 */
export type Reserve = { percent: number, dollars: number, cash: number, short: number, cashPercent: number, atLeast: boolean };

/**
 * Joins the recorded holdings with today's quotes, verdicts and the S&P 500's path since each purchase.
 *
 * @param stocks every stock loaded on the page (the watchlists and the holdings outside them), by symbol
 * @param o.now  fixes "today" for the verdict (tests); the cached live verdict is used when omitted
 * @param o.cases fixes the tested results by volatility group (tests); the app's own figures when omitted
 */
export function portfolioView(portfolio: Portfolio, stocks: Map<string, Stock>, o: {
  today: string, indexNow?: number, indexHistory?: ChartSeries, now?: Date, cases?: Figures['cases']
}): PortfolioView {
  const priceOf = (symbol: string) => stocks.get(symbol)?.quote?.price;
  const portfolioValue = valueOf(portfolio, priceOf);
  const limitIsDefault = portfolio.lossBudgetPercent === undefined;
  const limitPercent = portfolio.lossBudgetPercent ?? DEFAULT_LIMIT_PERCENT;
  const budget = lossBudget(limitPercent, portfolioValue);
  const risks = new Map<string, PositionRisk>();
  const rows = Object.keys(portfolio.positions).sort().map(symbol => {
    const position = portfolio.positions[symbol];
    const stock = stocks.get(symbol);
    const signal = !stock ? null : o.now ? computeSignal(stock, o.now) : signalFor(stock);
    const view = viewOf(position, {
      price: priceOf(symbol), portfolioValue, today: o.today,
      indexThen: position.day ? closeOnOrBefore(o.indexHistory, position.day) : undefined, indexNow: o.indexNow,
    });
    const cases = casesFor(signal, o.cases);
    const risk = riskOf(view, cases, budget, portfolioValue);
    if (risk) {
      risks.set(symbol, risk);
    }
    return {symbol, view, verdict: signal?.verdict, cases, risk} as PositionRow;
  });
  return {
    rows, summary: summarize(rows.map(it => it.view), risks, portfolioValue), portfolioValue, budget, limitPercent, limitIsDefault,
    reserve: reserveOf(portfolio, portfolioValue, rows.some(it => it.view.value === undefined)),
  };
}

/** What the user's share to keep outside stocks comes to today; undefined without such a share or without a worth. */
function reserveOf(portfolio: Portfolio, portfolioValue: number | undefined, unpriced: boolean): Reserve | undefined {
  const percent = portfolio.reservePercent;
  if (percent === undefined || !(percent > 0) || portfolioValue === undefined || !(portfolioValue > 0)) {
    return undefined;
  }
  const dollars = portfolioValue * percent / 100, cash = portfolio.cash ?? 0;
  return {percent, dollars, cash, short: Math.max(0, dollars - cash), cashPercent: cash / portfolioValue * 100, atLeast: unpriced};
}

/**
 * What the portfolio is worth: its positions at today's prices plus its cash. A holding without a price adds
 * nothing. Unknown when there is neither a priced position nor cash.
 */
function valueOf(portfolio: Portfolio, priceOf: (symbol: string) => number | undefined): number | undefined {
  let total = portfolio.cash ?? 0;
  Object.values(portfolio.positions).forEach(position => {
    const price = priceOf(position.symbol);
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      total += position.shares * price;
    }
  });
  return total > 0 ? total : undefined;
}
