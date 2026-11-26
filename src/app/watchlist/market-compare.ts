import {money, signedMoney, signedPercent} from "./format";
import {PositionView, TESTED_DAYS} from "./positions";
import type {Fact} from "./recommendations";

/**
 * "Your portfolio against the market": what the money that went into the stocks would have made had it gone into
 * the market instead, each purchase counted from its own day. It is the one figure that says whether owning these
 * stocks has paid off more than simply owning the market, which is what the tests of the plan left open (the plan
 * made money on new stocks, but no more than the market).
 *
 * A fact about what happened, not a tested signal: nothing in the plan depends on it. It counts only what is owned
 * now (a stock that was sold is not in the portfolio any more), and neither side counts dividends.
 */
export type AgainstMarket = {
  /** How many stocks could be compared, and how many are held. */
  compared: number
  held: number
  /** What was paid for the compared stocks. */
  cost: number
  /** What they have gained since bought, in dollars and as % of what was paid: like with like with the market's. */
  gain: number
  gainPercent: number
  /** What the same money would have gained in the market, each amount from the day it was paid. */
  marketGain: number
  marketPercent: number
  /** How far the stocks are ahead of that (behind when negative). */
  ahead: number
  /** How long the money has been in, in days: each purchase's time weighted by what was paid for it. */
  days: number
};

/**
 * A stock can be compared when it has a price today and the market's change since its purchase day. The page knows
 * that change for a purchase day within the year of market prices it loads; a stock without a purchase day, or
 * bought earlier than that, has none.
 */
export function againstMarket(views: PositionView[]): AgainstMarket | undefined {
  const compared = views.filter(it => it.gain !== undefined && it.indexPercent !== undefined && it.daysHeld !== undefined && it.cost > 0);
  if (compared.length === 0) {
    return undefined;
  }
  const sum = (amount: (view: PositionView) => number) => compared.reduce((total, view) => total + amount(view), 0);
  const cost = sum(it => it.cost);
  const gain = sum(it => it.gain!);
  const marketGain = sum(it => it.cost * it.indexPercent! / 100);
  return {
    compared: compared.length, held: views.length, cost,
    gain, gainPercent: gain / cost * 100,
    marketGain, marketPercent: marketGain / cost * 100,
    ahead: gain - marketGain,
    days: sum(it => it.cost * it.daysHeld!) / cost,
  };
}

/**
 * The comparison as sentences for the "What you own" box, a paragraph each:
 *  - "The same money in the market on the same days: +$310 (+2.4%). Your stocks are $95 ahead of it."
 *  - only when some stocks could not be compared, who is left out and why;
 *  - until the money has been in for the 6 months the tests looked at, that it is too early to mean much.
 * When not every stock is compared, the first sentence gives the result of the ones that are, so that the two
 * figures are about the same stocks; the headline above it counts every stock that has a price.
 */
export function againstMarketLines(it: AgainstMarket | undefined): string[] {
  if (!it) {
    return [];
  }
  const all = it.compared === it.held;
  const who = all ? (it.held === 1 ? 'Your stock is' : 'Your stocks are') : it.compared === 1 ? 'That one is' : `Those ${it.compared} are`;
  // Under half a cent shows as $0: then they are level.
  const stands = Math.abs(it.ahead) < 0.005 ? 'level with it' : `${money(it.ahead)} ${it.ahead > 0 ? 'ahead of' : 'behind'} it`;
  const own = all ? '' : `For ${it.compared} of your ${it.held} stocks: ${signedMoney(it.gain)} (${signedPercent(it.gainPercent)}) since bought. `;
  const lines = [
    `${own}The same money in the market on the same days: ${signedMoney(it.marketGain)} (${signedPercent(it.marketPercent)}). ${who} ${stands}.`,
  ];
  if (!all) {
    lines.push(`Left out: ${it.held - it.compared} with no price today, no purchase date, or bought over a year ago.`);
  }
  if (Math.round(it.days) < TESTED_DAYS) {
    lines.push(`Too early to mean much: on average this money has been in for ${timeIn(it.days)}. The tests looked at 6 months.`);
  }
  return lines;
}

/**
 * The comparison as figures with their names, for the place beside the "What you own" headline: how far the stocks
 * are from the market (named with how many of them it is about, when it cannot count them all), and, until the
 * money has been in for the 6 months the tests looked at, how long it has been in and that this is too early to
 * mean much. Each carries the sentences of `againstMarketLines` it comes from as its tip.
 */
export function againstMarketFacts(it: AgainstMarket | undefined): Fact[] {
  if (!it) {
    return [];
  }
  const lines = againstMarketLines(it);
  const early = Math.round(it.days) < TESTED_DAYS;
  // Under half a cent shows as $0: then they are level.
  const level = Math.abs(it.ahead) < 0.005;
  const facts: Fact[] = [{
    label: it.compared === it.held ? 'Against the market' : `Against the market, ${it.compared} of ${it.held} stocks`,
    value: level ? 'level' : `${money(it.ahead)} ${it.ahead > 0 ? 'ahead' : 'behind'}`,
    // The sentences about the comparison itself: all but the one about the time.
    tip: (early ? lines.slice(0, -1) : lines).join(' '),
  }];
  if (early) {
    facts.push({label: 'Money in for', value: `${timeIn(it.days)}: too early to mean much`, tip: lines[lines.length - 1]});
  }
  return facts;
}

/** "less than a day", "1 day", "13 days", then whole weeks: "2 weeks". */
function timeIn(days: number): string {
  const whole = Math.round(days);
  if (whole < 1) {
    return 'less than a day';
  }
  if (whole < 14) {
    return `${whole} day${whole === 1 ? '' : 's'}`;
  }
  return `${Math.floor(whole / 7)} weeks`;
}
