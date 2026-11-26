import {ChartSeries, Stock} from "../api/microsoft-money.service";
import {Figures} from "./evidence";
import {Candidate, planSteps, PlanStep} from "./plan";
import {portfolioView, PortfolioView, PositionRow} from "./portfolio-view";
import {Portfolio} from "./positions";
import {Addition, additions, fitOf, readingOf, recommend, Recommendation, RowReading, sizingFor, SizingInput} from "./recommendations";
import {computeSignal, signalFor, wasDipBuy} from "./signal";
import {casesFor} from "./sizing";
import {SnapshotLog} from "./snapshot-log";
import {whatsNew} from "./whats-new";

/**
 * The tested plan for one portfolio, from what the page knows today. The page works it out for every portfolio,
 * not only the one being shown, so that each portfolio's button can name what its plan expects.
 * Nothing is decided here: it gathers what `planSteps` needs (the holdings at today's prices, what each was marked
 * on the day it was bought, the other stocks marked DIP BUY and the limit) and hands it over. The same stocks,
 * each sized for this portfolio, are the recommendations the page lists under "Could add" (recommendations.ts).
 */
export type PlanContext = {
  /** Every stock loaded on the page (the lists and the holdings outside them), by symbol. */
  stocks: Map<string, Stock>
  /** Today as YYYY-MM-DD. */
  today: string
  /** The daily log: it says what a stock was marked on the day it was bought, when that day is in it. */
  log: SnapshotLog
  /** The S&P 500 now and over the past year, to compare each holding with the market since it was bought. */
  indexNow?: number
  indexHistory?: ChartSeries
  /** Market fear: the VIX now, and whether it is at the level the tests found better for buying. */
  fear?: { vix: number, high: boolean }
  /** Fixes "today" for the marks (tests); the cached live marks are used when omitted. */
  now?: Date
  /** Fixes the tested figures (tests); the app's own when omitted. */
  figures?: Figures
};

export type PortfolioPlan = {
  /** The holdings joined with today's prices, marks and tested cases. */
  view: PortfolioView
  /** What to look at today, in the plan's order. */
  steps: PlanStep[]
  /**
   * The stocks marked DIP BUY that this portfolio does not hold, from A to Z, each with its size as a share of
   * the portfolio and with what the portfolio already holds that is like it.
   */
  recommendations: Recommendation[]
  /** What can still be added to the stocks it holds that are marked DIP BUY. */
  additions: Addition[]
  /** The first recommendation worked out in words, for "Could add" to show under its table; none while there is no size. */
  reading?: RowReading
  /**
   * What the sizes above were worked out from: "Could add" splits the portfolio's cash between the stocks the user
   * ticks from the same worth, limit and holdings (cash-split.ts). None while the portfolio is worth nothing.
   */
  sizing?: SizingInput
};

export function planFor(portfolio: Portfolio, context: PlanContext): PortfolioPlan {
  const {stocks, figures, now} = context;
  const view = portfolioView(portfolio, stocks, {
    today: context.today, indexNow: context.indexNow, indexHistory: context.indexHistory, now, cases: figures?.cases,
  });
  // The stocks marked DIP BUY that this portfolio does not own, with what the tests found for their kind. One that
  // another portfolio owns is still offered to this one.
  const candidates: Candidate[] = [];
  stocks.forEach((stock, symbol) => {
    const cases = portfolio.positions[symbol] ? undefined : casesFor(now ? computeSignal(stock, now) : signalFor(stock), figures?.cases);
    if (cases) {
      candidates.push({symbol, cases});
    }
  });
  const steps = planSteps({
    holdings: view.rows.map(row => ({row, boughtAsDipBuy: boughtAsDipBuy(row, context)})),
    candidates,
    limit: view.budget === undefined ? undefined : {dollars: view.budget, percent: view.limitPercent, own: !view.limitIsDefault},
    fear: context.fear,
    reserve: view.reserve,
    takeProfit: portfolio.takeProfitPercent === undefined ? undefined : {percent: portfolio.takeProfitPercent},
  }, figures);
  // What changed since the last day in the log goes first: it is what a daily look is for.
  const news = whatsNew(context.log, context.today, view.rows);
  // The same candidates as recommendations: each with its size for this portfolio, and with what the portfolio
  // holds that is like it. The cash only counts in what the portfolio is worth.
  const sizing = sizingFor(view);
  const held = view.rows.map(row => stocks.get(row.symbol)).filter((it): it is Stock => !!it);
  const recommendations = recommend(candidates, sizing, figures).map(it => ({...it, fit: fitOf(stocks.get(it.symbol), held)}));
  return {
    view, steps: news ? [news, ...steps] : steps,
    recommendations,
    additions: sizing ? additions(sizing, figures) : [],
    reading: readingOf(recommendations[0], sizing, figures),
    sizing,
  };
}

/**
 * Whether a holding was marked DIP BUY on the day it was bought, which is what the plan's 6 months count from.
 * The log says so when that day is in it; otherwise it is worked out from the price paid and the growth known then.
 * Undefined when it cannot be told.
 */
function boughtAsDipBuy(row: PositionRow, context: PlanContext): boolean | undefined {
  const {symbol, day, price} = row.view.position;
  if (!day) {
    return undefined;
  }
  const logged = context.log.days[day]?.s[symbol]?.v;
  if (logged === 'D') {
    return true;
  }
  const stock = context.stocks.get(symbol);
  const workedOut = stock ? wasDipBuy(stock, day, price) : undefined;
  // The log read the stock at that day's close; a price paid below it can still have been a drop.
  return workedOut === true ? true : logged === 'W' || logged === 'P' ? false : workedOut;
}
