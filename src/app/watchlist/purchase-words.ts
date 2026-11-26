import {money, shareCount} from "./format";
import {Trade} from "./position-panel/position-panel.component";
import {Position, withPurchase} from "./positions";

/**
 * What the two forms that record purchases in "Could add" share (one purchase under its row, and several ticked
 * ones at once): the trade a purchase is handed to the page as, what is refused, and what is only pointed out.
 */

/** A purchase as it is typed: any of its numbers may still be missing. */
export type Typed = { shares?: number, price?: number, day?: string };

/** From this far from today's price a price paid today is pointed out: most often a digit too many or too few. */
export const PRICE_OFF_PERCENT = 20;
/** From this many times the amount of its row a purchase is pointed out, for the same reason. */
export const AMOUNT_TIMES = 2;

/**
 * The trade a purchase comes to: a new holding, or the holding there is with the purchase added to it and the
 * price paid averaged, and what it takes out of the cash when it is paid from it.
 */
export function purchaseTrade(symbol: string, held: Position | undefined, purchase: { shares: number, price: number, day?: string },
                              viaCash: boolean): Trade {
  const first: Position = {symbol, shares: purchase.shares, price: purchase.price};
  if (purchase.day) {
    first.day = purchase.day;
  }
  const count = `${shareCount(purchase.shares)}${held ? ' more' : ''} share${purchase.shares === 1 ? '' : 's'}`;
  return {
    symbol,
    holding: held ? withPurchase(held, purchase) : first,
    cashChange: viaCash ? -purchase.shares * purchase.price : 0,
    text: `${held ? 'Bought' : 'Added'} ${count} of ${symbol} at ${purchase.price.toFixed(2)}.`,
  };
}

/** What is wrong when what is being recorded is to be paid from less cash than is recorded; nothing otherwise. */
export function overCash(cost: number, cash: number | undefined, viaCash: boolean): string | undefined {
  return viaCash && cash !== undefined && cost > cash + 0.005
    ? `That is ${money(cost)}, more than the ${money(cash)} of cash recorded. Untick the box to leave your cash as it is, ` +
    'or correct "Cash" first.' : undefined;
}

/**
 * The one rule of the box "Paid from this portfolio's cash", in every form that records a purchase: it is ticked
 * while the cash recorded covers what is entered, and follows the numbers as they are typed, until the reader sets
 * the box themself. (The forms used to differ: one arrived unticked when the cash was short, another arrived
 * ticked and then refused the purchase in red as soon as three shares were typed.)
 */
export function coveredByCash(cost: number, cash: number | undefined): boolean {
  return (cash ?? 0) > 0 && cost <= (cash ?? 0) + 0.005;
}

/**
 * Said after the sum when the box is unticked because the cash does not cover the purchase: why it is unticked,
 * and that the cash stays. Empty when the cash covers it, or when no cash is recorded.
 */
export function leftAsItIs(cost: number, cash: number | undefined, viaCash: boolean): string {
  return !viaCash && (cash ?? 0) > 0 && cost > (cash ?? 0) + 0.005
    ? ` It is more than the ${money(cash)} of cash recorded, so the cash is left as it is.` : '';
}

/** " Cash would go from $5,000 to $3,200.": what paying from the cash leads to. Empty when the cash is left alone. */
export function cashAfter(cost: number, cash: number | undefined, viaCash: boolean): string {
  return viaCash && cash !== undefined ? ` Cash would go from ${money(cash)} to ${money(cash - cost)}.` : '';
}

/**
 * What looks like a slip of a finger in a purchase, said while it is typed. It stops nothing: a price can really
 * be far from today's (a purchase of an earlier day is not compared at all), and more can really have been bought
 * than the row said. Empty when nothing stands out.
 *
 * @param o `todayPrice` the stock's price today; `rowDollars` the amount its row gives it; `today` as YYYY-MM-DD
 */
export function purchaseCaution(typed: Typed, o: { todayPrice?: number, rowDollars?: number, today: string }): string {
  const lines: string[] = [];
  const boughtToday = !typed.day || typed.day === o.today;
  if (boughtToday && isPositive(typed.price) && isPositive(o.todayPrice)) {
    const off = (typed.price / o.todayPrice - 1) * 100;
    if (Math.abs(off) >= PRICE_OFF_PERCENT) {
      lines.push(`The price paid is ${Math.abs(off).toFixed(0)}% ${off > 0 ? 'above' : 'below'} today's price of ${o.todayPrice.toFixed(2)}.`);
    }
  }
  const cost = (typed.shares ?? 0) * (typed.price ?? 0);
  if (isPositive(o.rowDollars) && cost >= o.rowDollars * AMOUNT_TIMES) {
    const times = cost / o.rowDollars;
    lines.push(`That is ${money(cost)}, ${times >= 10 ? times.toFixed(0) : times.toFixed(1)} times the amount in its row (${money(o.rowDollars)}).`);
  }
  return lines.join(' ');
}

/**
 * What looks like a slip of a finger in the price of a sale, said while it is typed, as `purchaseCaution` says it
 * for a purchase: the cash recorded follows that price. It stops nothing. Empty when the price is near today's.
 */
export function saleCaution(price: number | undefined, todayPrice: number | undefined): string {
  if (!isPositive(price) || !isPositive(todayPrice)) {
    return '';
  }
  const off = (price / todayPrice - 1) * 100;
  return Math.abs(off) < PRICE_OFF_PERCENT ? ''
    : `The price sold at is ${Math.abs(off).toFixed(0)}% ${off > 0 ? 'above' : 'below'} today's price of ${todayPrice.toFixed(2)}. ${CHECK_FIRST}`;
}

/**
 * What a purchase paid from the portfolio's cash does to the share the user keeps outside stocks ("Keep outside
 * stocks", a limit of their own): said when the cash left would be under it, by the 50 cents from which the plan
 * says HOLD BACK. A purchase paid from the cash does not change what the portfolio is worth, so the dollars kept
 * stay the same and only the cash goes down. It stops nothing and advises nothing: it says what the purchase does
 * to the user's own number. Empty when no share is set, or when the purchase is not paid from the cash.
 *
 * @param keep the dollars to keep outside stocks; `several` when more than one purchase is being recorded
 */
export function keptShareCaution(cost: number, o: { cash?: number, keep?: number | null, viaCash: boolean, several?: boolean }): string {
  if (!o.viaCash || o.cash === undefined || !isPositive(o.keep)) {
    return '';
  }
  const left = o.cash - cost, short = o.keep - left;
  return short < 0.5 ? ''
    : `After ${o.several ? 'these purchases' : 'this purchase'} your cash would be ${money(Math.max(0, left))}: ` +
    `${money(short)} under the ${money(o.keep)} you keep outside stocks.`;
}

/**
 * What a form starts from for an amount of its row at today's price: the price to the cent, and the shares that
 * amount buys at that price, to four decimals and rounded DOWN. Rounded to the nearest, the shares times the price
 * came to a cent or two more than the amount; when the amounts are the cash split between the ticked stocks, the
 * form then asked for 2 cents more than the cash, its box for the cash arrived unticked, and the purchases would
 * have been recorded without being taken out of the cash. Rounded down, what the form comes to is never more than
 * what it was filled in from. Nothing when the price or the amount is missing.
 */
export function startFrom(dollars: number | undefined, price: number | undefined): { shares: number | null, paid: number | null } {
  const paid = isPositive(price) ? Number(price.toFixed(2)) : null;
  // The tiny addition keeps a quotient like 40.26, stored as 40.25999..., from losing its last digit.
  const shares = isPositive(paid) && isPositive(dollars) ? Math.floor(dollars / paid * 10_000 + 1e-6) / 10_000 : null;
  return {shares: shares !== null && shares > 0 ? shares : null, paid};
}

/** After what was pointed out: that it is a question, not a refusal. */
export const CHECK_FIRST = 'Check the numbers before you record it.';

export function isPositive(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
