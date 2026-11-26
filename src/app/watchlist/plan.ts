import {PositionRow} from "./portfolio-view";
import {CASH_LABEL, KEEP_OUT_LABEL, KEEP_OUT_SLACK, LIMIT_LABEL, PLAN_BOX, shareThatFits, TAKE_PROFIT_LABEL, TestedCases} from "./sizing";
import {EVIDENCE, Figures, numberWord, takeProfitOffer, textsFor} from "./evidence";
import {money, orderPriceText, shareText, signedPercent as pct} from "./format";
import {Addition, additions, addLabel, COULD_ADD} from "./recommendations";

/**
 * "Your plan today": the tested plan applied to one portfolio as a short list of steps, in everyday words.
 *
 * Nothing here is invented. Each step is a rule that passed a pre-registered test on stocks it was not found on,
 * applied to a limit for the loss on one stock (the user's own, or the app's starting one until they enter it):
 *  - buy stocks marked DIP BUY (every test of the verdict; on the newest list they made money, though no more than
 *    the market: #7, G1 and G2), in no order: the one ordering that was tested, the fastest fallers first (#6, P1),
 *    had a higher average but was not ahead inside a given week, so it is not used;
 *  - size each as a share of the portfolio, so that every stock in it carries the same risk, and never more than
 *    loses that limit in a tested bad half-year (arithmetic on the tested bad cases and the user's own numbers,
 *    not a tested rule: recommendations.ts). The sizes do not depend on the cash: the plan is not told how much
 *    there is. The stocks to buy that are not owned are not listed on the plan's line: the page shows them, each
 *    with its size, in the "Could add" box; what can be added to a stock that is owned is said in its own row;
 *  - keep each for 6 months and do not sell early: a stop-loss lowered the result (#5, H3) and so did taking
 *    profits (#6, P2), both again on the newest list (#7, G5);
 *  - buy with more confidence when the market is fearful (#3);
 *  - hold three or more rather than one (#8, on 30 years of prices of stocks that dropped): a milder bad
 *    half-year and a higher typical result, the same average. It says how many, never which.
 * Two things were tested and are NOT in the plan: keeping for a second half-year (it beat the market on one list,
 * #6 P3, and not on the next, #7 G4), and any way of choosing among the stocks to buy (an order by how fast they
 * fell, #6; the one least tied to what is owned, looked at on 2026-11-22 and dropped).
 * Where the tests say nothing (a holding bought outside the plan, or held for over 6 months) the step says so
 * instead of guessing. It does not say whether to follow the plan: that, and every trade, stays the user's decision.
 *
 * A step is a verb and one short line a newcomer can read. The evidence behind it is in `why`, which the plan card
 * does not show: it is listed once, in "How the plan was tested" at the bottom of the page.
 * tools/evidence/figures.js stops an update of the numbers if a rule used here no longer passes.
 *
 * Where a step is shown: the plan's lines are at the top of the portfolio's box, under its cash and limit, so a
 * line can say "above" for those two fields; `why` is read at the bottom of the page and names the box instead.
 * The steps that only say where a stock you own stands (keep, no opinion) are not lines there: the table of
 * holdings in the same box says them, each in the stock's own row (`saidInRows`, `holdingPlans`).
 */

/**
 * Whether the tested plan covers a holding:
 *  - a DIP BUY today: yes, whenever it was bought (holding it is the same bet as buying it today);
 *  - bought as a DIP BUY less than 6 months ago: yes, also once the dip has closed or growth has slowed, because
 *    the tests held it for 26 weeks whatever happened;
 *  - past the 6 months and not a DIP BUY today: the tests disagree about what comes next;
 *  - anything else: outside the plan.
 */
export type Coverage = 'dip-buy-now' | 'within-6-months' | 'past-6-months' | 'outside';

export type Holding = {
  row: PositionRow
  /** Whether it was a DIP BUY on the day it was bought; undefined when that cannot be told. */
  boughtAsDipBuy?: boolean
};

/** A DIP BUY on the page that this portfolio does not hold. */
export type Candidate = { symbol: string, cases: TestedCases };

/** The most to lose on one stock: in dollars, as a share of the portfolio, and whether the user entered it. */
export type Limit = { dollars: number, percent: number, own: boolean };

export type PlanInput = {
  holdings: Holding[]
  candidates: Candidate[]
  /** Unknown while the portfolio is worth nothing yet (no cash, no priced stock): there is nothing to take a share of. */
  limit?: Limit
  /** Market fear: the VIX now, and whether it is at the level the tests found better for buying. */
  fear?: { vix: number, high: boolean }
  /**
   * The share the user wants to keep outside stocks, when they set one: in percent, what that is in dollars
   * today, and the cash there is. Their own number, like the limit: no test is behind it.
   */
  reserve?: { percent: number, dollars: number, cash: number, cashPercent: number, atLeast?: boolean }
  /**
   * The level the user picked for taking a profit, in % above what was paid. Their own choice among the levels that
   * passed pre-registered #9; a level the tests do not offer gives no line.
   */
  takeProfit?: { percent: number }
};

/**
 * 'spread' follows 'buy' while the plan covers fewer stocks of the portfolio than the tested number: how many to hold.
 * 'news' is not a step of the plan: it is what changed since the last day in the log, put first on the card
 * (whats-new.ts), in the same shape so that it is shown and explained like the steps.
 */
export type StepKind = 'news' | 'missing' | 'setup' | 'trim' | 'review' | 'level' | 'reserve' | 'timing' | 'buy' | 'spread' | 'order' | 'hold'
  | 'outside';

/**
 * What the row of a stock that is owned says about adding to it, under the amount. It says why there is an amount
 * (less is owned than the plan's size for the stock) and what the amount is (how much more would reach that size):
 * "This much more would bring it to its share of this portfolio." left the owner asking for a clearer sentence.
 */
export const ADD_TEXT = 'You own less of this stock than the size the plan gives it. ' +
  'This is how much more you could buy to bring it up to that size.';

/** A stock a step is about, with what the step says for it ("keep $2,439", "week 6"). */
export type PlanItem = { symbol: string, label?: string };

/**
 * One line of the plan: a verb, a short sentence, the stocks it is about, and the evidence behind it.
 * `inRows` are stocks the step is about that its line does not list, because each has a row of its own in the
 * table of holdings that says it: what can be added to a stock that is owned ("add 8.4% ($840)").
 */
export type PlanStep = {
  kind: StepKind, verb: string, text: string, why: string, items: PlanItem[], inRows?: PlanItem[]
  /**
   * Set on BUY while the plan says HOLD BACK: the line stays, with its sizes, but with the cash under what the user
   * keeps outside stocks there is nothing to buy with today, so it is not among what there is to do.
   */
  waits?: boolean
};

export function coverageOf(holding: Holding): Coverage {
  const {row, boughtAsDipBuy} = holding;
  if (row.verdict === 'DIP BUY') {
    return 'dip-buy-now';
  }
  if (row.view.daysHeld === undefined) {
    return 'outside';   // no purchase date: nothing to count the 6 months from
  }
  if (row.view.beyondTested) {
    return boughtAsDipBuy === false ? 'outside' : 'past-6-months';
  }
  return boughtAsDipBuy === true ? 'within-6-months' : 'outside';
}

/**
 * The steps for one portfolio, what needs doing first: no price, the limit, sell some, your call, your level, hold
 * back, good time, buy, how many, order price, keep, no opinion. Every holding is named once among the steps about
 * what is owned (sell some, your call, keep, no opinion); one that is marked DIP BUY today and has room under the
 * limit is also offered for adding to, and with a level picked for taking a profit one that the test followed is
 * also named by "your level" or given the price of a sell order.
 *
 * @param f the tested figures quoted in the evidence; the app's own unless a test fixes them
 */
export function planSteps(input: PlanInput, f: Figures = EVIDENCE): PlanStep[] {
  const {limit, fear} = input;
  const steps: PlanStep[] = [];
  const everyHolding = [...input.holdings].sort((a, b) => a.row.symbol.localeCompare(b.row.symbol));
  const plain = (list: Holding[]): PlanItem[] => list.map(it => ({symbol: it.row.symbol}));
  // How many to hold, as the tests found it (pre-registered #8): the number, and the finding in one clause.
  const several = numberWord(f.several.count), severalBrief = textsFor(f).severalBrief;

  // A holding whose quote did not load has no price and no verdict. Saying the plan has "no opinion" on it would
  // be wrong: it is set aside, first, because the portfolio's worth and so every amount below is short of it.
  const unpriced = everyHolding.filter(it => it.row.view.value === undefined);
  const holdings = everyHolding.filter(it => it.row.view.value !== undefined);
  if (unpriced.length > 0) {
    const one = unpriced.length === 1;
    steps.push({
      kind: 'missing', verb: 'NO PRICE', items: plain(unpriced),
      // A step that asks for something says what: here, to reload. The button is in the bar across the top of the
      // page, named by the words on it, so the sentence holds wherever on the page it is read.
      text: `${one ? 'The price of this stock' : 'The prices of these stocks'} did not load. Use "Reload prices" at the top.`,
      why: `The plan leaves ${one ? 'it out until its price loads' : 'them out until their prices load'}: reload the prices to try again ` +
        '("Reload prices", at the top of the page). Until then the amounts in the plan are worked out ' +
        `without ${one ? 'it' : 'them'}, so they may be too low.`,
    });
  }

  if (!limit) {
    steps.push({
      kind: 'setup', verb: 'START HERE', items: [],
      // The field is in the same box as this line: above it in a narrow window, beside it in a wide one. "In this
      // box" holds for both.
      text: `Enter your cash in this box, under "${CASH_LABEL}".`,
      why: 'The plan works out every amount from what this portfolio is worth, and the app cannot tell that yet: it holds no cash and no priced stocks.',
    });
  } else if (!limit.own) {
    // Amounts show from the first visit. The assumption they rest on is said first, with where to change it.
    steps.push({
      kind: 'setup', verb: 'YOUR LIMIT', items: [],
      // The field by its name: the box has four.
      // ("The plan assumes you can lose $4,000 on one stock. Change it in this box." named no field.)
      text: `Set "${LIMIT_LABEL}": until then the plan assumes ${money(limit.dollars)}.`,
      why: `You have not entered a limit, so the plan starts from ${limit.percent}% of this portfolio. With that, up to ` +
        `${shareThatFits(limit.percent, f.cases.volatile.bad)}% of your money fits in one stock whose price swings a lot. ` +
        `In tests, ${severalBrief}. To change it, enter your own number in the "${PLAN_BOX}" box, under "${LIMIT_LABEL}".`,
    });
  }

  const over = !limit ? [] : holdings.filter(it => it.row.risk?.overBudget && it.row.cases);
  if (over.length > 0 && limit) {
    const losses = over.map(it => it.row.cases!.lossPercent);
    const least = Math.min(...losses), most = Math.max(...losses);
    const one = over.length === 1;
    steps.push({
      kind: 'trim', verb: 'SELL SOME',
      items: over.map(it => ({symbol: it.row.symbol, label: `keep ${money(fitting(limit, it.row.cases!))}`})),
      text: `${one ? 'This stock' : 'These'} could lose more than ${limit.own ? 'your' : 'the'} ${money(limit.dollars)} limit. ` +
        `Keep only the amount${one ? '' : 's'} shown.`,
      why: `In tests, 1 in 10 stocks like these lost ${most > least ? `${least}% to ${most}%` : `${least}%`} or more after 6 months` +
        (most > least ? ', more for a stock whose price swings more' : '') +
        '. The amount shown is the most you can hold so that such a loss stays within your limit. ' +
        'If you can live with a bigger loss, raise your limit instead: the tests do not say that selling makes you more money, ' +
        'only that it caps what you can lose.',
    });
  }

  // The user's own level for taking a profit, among the levels that passed their test (pre-registered #9). As
  // written down before that test: applied to every holding the test followed (bought as a DIP BUY, inside its 6
  // months, with a price), also one that is over the limit. The plan reports and does not say to sell; KEEP stays
  // as it is, and nothing is taken from what could be bought.
  const profit = input.takeProfit === undefined ? undefined : takeProfitOffer(f).find(it => it.level === input.takeProfit!.percent);

  const rest = holdings.filter(it => !over.includes(it));
  const past = rest.filter(it => coverageOf(it) === 'past-6-months');
  if (past.length > 0) {
    const one = past.length === 1;
    const first = f.sixth.afterHolding, second = f.seventh.secondHalf;
    steps.push({
      kind: 'review', verb: 'YOUR CALL', items: plain(past),
      text: 'Held for over 6 months. After that the tests disagree.',
      why: 'The tests followed each stock for 6 months. Two of them went on for 6 months more: on one list the kept stocks then ' +
        `beat the market (${pct(first.stay)} against ${pct(first.sp500)}), on the other not clearly (${pct(second.stay)} against ` +
        `${pct(second.sp500)}). So the plan has no rule for it. ${one ? 'This one is' : 'These are'} not marked DIP BUY now.` +
        // The line with the order's price went when the 6 months were over: an order placed earlier may still stand.
        (profit?.order ? ' If you placed a sell order for it at your level, it may still be open: in the test such an order stood ' +
          'for the 6 months only.' : ''),
    });
  }

  const followed = !profit ? [] : holdings.filter(it => it.boughtAsDipBuy === true && it.row.view.daysHeld !== undefined
    && !it.row.view.beyondTested && it.row.view.price !== undefined && it.row.view.position.price > 0);
  /** The price of one share at the level: that much above the average price paid. */
  const levelPrice = (it: Holding) => it.row.view.position.price * (1 + profit!.level / 100);
  const reached = (it: Holding) => it.row.view.price! >= levelPrice(it) - LAST_BITS;
  // Named on a line of its own: only where selling once the level is seen passed its test.
  const atLevel = profit?.seen ? followed.filter(reached) : [];
  // Where the level was set and which stocks it counts for: the end of each line's first sentence, so that the two
  // reasons begin with what is their own (with "more" closed, a reason shows its first sentence).
  const asSet = `the level you set in the "${PLAN_BOX}" box, under "${TAKE_PROFIT_LABEL}". ` +
    'It counts for a stock you bought as a DIP BUY, in its first 6 months. ';
  // Why the plan keeps is said once, under THE PLAN. Here only that it does.
  const stillKeep = ' The plan still says KEEP: the level is your own, and so is the decision.';
  if (profit && atLevel.length > 0) {
    steps.push({
      kind: 'level', verb: 'YOUR LEVEL',
      // By how much it is up, in whole percent and never more than it is.
      items: atLevel.map(it => ({symbol: it.row.symbol, label: `up ${Math.floor((it.row.view.gainPercent ?? profit.level) + LAST_BITS)}%`})),
      text: `Up ${profit.level}% or more on what you paid: the level you set. Selling is your call.`,
      why: `${atLevel.length === 1 ? 'This stock is' : 'These stocks are'} up ${profit.level}% or more on the average price you paid: ` +
        asSet + textsFor(f).takeProfitWhy(profit.level, 'seen') + stillKeep,
    });
  }

  // The share the user wants to keep outside stocks, while the cash is under it. It is their own number, like the
  // limit, so no test is quoted. The line says how much is missing and names no stock: the plan has one reason to
  // sell (SELL SOME) and this is not a second one. It stands before the lines about buying, whose money it is about.
  // The line waits until the cash is more than a tenth short (KEEP_OUT_SLACK): the amount to keep moves with prices
  // every day, and a line that comes and goes by the day asks for nothing.
  const reserve = input.reserve;
  if (reserve && reserve.dollars - reserve.cash > reserve.dollars * KEEP_OUT_SLACK) {
    const short = reserve.dollars - reserve.cash, set = `${shareText(reserve.percent)}%`;
    // "What you keep outside stocks" is the share that was set, everywhere on the page. The cash is said in other
    // words, as a share of the same worth, worked out once (portfolio-view.ts) so that the card prints the same.
    const cash = !(reserve.cash > 0) ? 'you have no cash here'
      : `your cash is ${reserve.cashPercent < 0.05 ? 'under 0.1' : reserve.cashPercent.toFixed(1)}%`;
    // New cash also makes the portfolio larger, so it takes more of it than the gap to close the gap.
    const newCash = short / (1 - reserve.percent / 100);
    steps.push({
      kind: 'reserve', verb: 'HOLD BACK', items: [],
      text: `You set ${set} to keep outside stocks; ${cash}: ${money(short)} short.`,
      why: `You set the share of this portfolio to keep outside stocks in the "${PLAN_BOX}" box, under "${KEEP_OUT_LABEL}": ` +
        `${set}, which is ${money(reserve.dollars)} today. Your cash is ${money(reserve.cash)}, so it is ${money(short)} short. ` +
        'Money outside stocks cannot fall with them. ' +
        `Moving ${money(short)} from stocks into cash would close the gap; so would ${money(newCash)} of new cash, which is more ` +
        'because new cash also makes the portfolio larger. The plan does not say which stock to sell, or that you should. ' +
        `The split in "${COULD_ADD}" leaves that money out. The line shows once the cash is more than a tenth short, because the ` +
        'amount moves with prices every day. No test is behind it: the share is your own number, like your limit.' +
        (reserve.atLeast ? ' One of your stocks has no price, so this portfolio is worth more than could be counted: ' +
          'these amounts are the least they can be.' : ''),
    });
  }

  // A calm market gets no line: there is nothing to act on.
  if (fear?.high) {
    steps.push({
      kind: 'timing', verb: 'GOOD TIME', items: [],
      text: 'The market is fearful now. In the past, that was the better time to buy.',
      why: `${textsFor(f).fearText(true)} Today the VIX is at ${fear.vix.toFixed(1)}.`,
    });
  }

  // The holdings the plan covers and that are not too big: kept, and counted when the plan says how many to hold.
  const covered = rest.filter(it => ['dip-buy-now', 'within-6-months'].includes(coverageOf(it)));

  // What could be bought: the stocks marked DIP BUY that are not owned, and more of the ones that are. Neither is
  // listed on the line: the first are in the "Could add" box of the page, each with its size for this portfolio
  // (recommendations.ts); the second are said in each stock's own row. The line says how many, and where to look.
  // Nothing here depends on the cash: what to buy and how big is said whether the money is there or not.
  const fresh = input.candidates.length, more = roomToAdd(holdings, rest, limit, f);
  if (fresh + more.length > 0) {
    const tried = f.sixth.buyFirst;
    const stocks = (count: number) => `${count} ${count === 1 ? 'stock' : 'stocks'}`;
    const which = fresh === 1 ? 'This is a stock' : fresh > 1 ? 'These are the stocks'
      : more.length === 1 ? 'This is a stock you own that is' : 'These are stocks you own that are';
    // These sentences are read at the bottom of the page, so they name places rather than say "below".
    // What is under THE PLAN in the same box (how such stocks did, the figures of how many) is not said again here.
    const tested = `${which} marked DIP BUY on the Watchlist: the price dropped while the business keeps growing. ` +
      'How such stocks did in the tests is under THE PLAN. ' +
      'The tests found no dependable way to tell which will do best: the one ordering that looked promising, the fastest fallers ' +
      `first, beat the others in the same week ${tried.aheadPercent < 50 ? 'only ' : ''}${tried.aheadPercent}% of the time. ` +
      'So the plan gives them no order, and how many matters more than which. ';
    steps.push({
      kind: 'buy', verb: 'BUY', items: [],
      inRows: more.map(it => ({symbol: it.symbol, label: addLabel(it)})),
      text: fresh > 0
        ? `${stocks(fresh)} could be added: see "${COULD_ADD}"` + (!limit ? '.' : ` for ${fresh === 1 ? 'its size' : 'the size of each'}.`)
        : `You could add to ${stocks(more.length)} you own: see "add" in ${more.length === 1 ? 'its row' : 'their rows'}.`,
      why: tested + (!limit ? 'Enter your cash to see the size of each.'
        : 'The size of each is a share of this portfolio, worked out so that a bad half-year would cost about the same for every ' +
          'stock in it: one whose price swings more gets less. No size is more than fits your limit, and none depends on the cash ' +
          'you have. How to split money between stocks was not tested.'),
    });
    // How many, beside what to buy, while the plan covers fewer stocks of this portfolio than the tested number
    // (one that is too big counts: it is still one the plan covers). With nothing to buy there is nothing to add.
    const count = over.length + covered.length;
    if (count < f.several.count) {
      steps.push({
        kind: 'spread', verb: 'HOW MANY', items: [],
        text: `${several[0].toUpperCase()}${several.slice(1)} or more rather than one. In tests, a bad half-year then hurt less.`,
        why: (count === 0 ? 'You hold no stock the plan covers yet. ' : `The plan covers ${count} of your stocks today. `) +
          `With fewer than ${several}, one stock decides most of the result. What the test found is under THE PLAN, above.`,
      });
    }
  }

  // The price of a sell order at the user's level, for the followed holdings that YOUR LEVEL does not name: only
  // where a sell order placed in advance passed its test. It is there every day, so it asks for nothing today. The
  // verb names what the line gives (a price): "SELL ..." beside SELL SOME would read as an instruction.
  const toOrder = profit?.order ? followed.filter(it => !atLevel.includes(it)) : [];
  if (profit && toOrder.length > 0) {
    steps.push({
      kind: 'order', verb: 'ORDER PRICE',
      items: toOrder.map(it => ({symbol: it.row.symbol, label: `at ${orderPriceText(levelPrice(it))}${reached(it) ? ', under its price now' : ''}`})),
      text: `A sell order at +${profit.level}% on what you paid, as you set. Placing it is your call.`,
      why: `The price given for each stock is ${profit.level}% above the average price you paid for it, rounded up: ${asSet}` +
        'A sell order here is one you leave with your broker to sell at that price or better: it waits until the price is reached ' +
        '(brokers call it a limit order). ' + textsFor(f).takeProfitWhy(profit.level, 'order') +
        ' In that test an order stood for the 6 months and no longer.' + stillKeep,
    });
  }

  // KEEP is as it was: a holding that YOUR LEVEL names is still one the plan keeps.
  const keeping = covered;
  if (keeping.length > 0) {
    const t = f.sixth.takeProfit, s = f.seventh.sellingEarly;
    steps.push({
      kind: 'hold', verb: 'KEEP',
      items: keeping.map(it => it.row.view.week !== undefined && !it.row.view.beyondTested
        ? {symbol: it.row.symbol, label: `week ${it.row.view.week}`} : {symbol: it.row.symbol}),
      text: `Keep ${keeping.length === 1 ? 'this one' : 'these'} for 6 months. In tests, selling early, up or down, paid less.`,
      why: `On two lists of stocks never used before (${f.sixth.stocks} and ${f.seventh.stocks}), selling as soon as a stock was up ` +
        `${t.percent}% gave less on average than keeping it for 6 months: ${pct(t.withTakeProfit)} against ${pct(t.holding)}, and ` +
        `${pct(s.withTakeProfit)} against ${pct(s.holding)}; ${s.soldEarlyPercent}% of the stocks reached it at some point. ` +
        `Selling after a ${f.fresh.stopPercent}% drop lowered the result too (${pct(s.withStop)} against ${pct(s.holding)}). ` +
        'A stock with no week number counts from today.',
    });
  }

  const outside = rest.filter(it => coverageOf(it) === 'outside');
  if (outside.length > 0) {
    const one = outside.length === 1;
    const undated = outside.filter(it => it.row.view.daysHeld === undefined).map(it => it.row.symbol);
    const dates = undated.length === 0 ? ''
      : ` ${undated.join(', ')} ${undated.length === 1 ? 'has' : 'have'} no purchase date: add it and the app can check.`;
    steps.push({
      kind: 'outside', verb: 'NO OPINION', items: plain(outside),
      text: one ? 'The plan does not cover this stock.' : 'The plan does not cover these stocks.',
      why: 'The tests only followed stocks that were marked DIP BUY when bought. ' +
        (one ? 'This one is not marked DIP BUY now, and the app cannot see that it was when you bought it, so the tests say nothing about it.'
          : 'These are not marked DIP BUY now, and the app cannot see that they were when you bought them, so the tests say nothing about them.') +
        dates,
    });
  }
  // HOLD BACK and BUY pull opposite ways. What could be bought is shown whatever the cash (the sizes do not depend
  // on it), but while the cash is under what the user keeps outside stocks, buying is not asked for.
  const buy = steps.find(step => step.kind === 'buy');
  if (buy && steps.some(step => step.kind === 'reserve')) {
    buy.waits = true;
    buy.why += ' Today your cash is under what you keep outside stocks (HOLD BACK), so buying is not among what there is to do.';
  }
  return steps;
}

/** The last bits of a float do not decide whether a price is at a level: 15% above 100 comes out a hair under 115. */
const LAST_BITS = 1e-9;

/**
 * The steps that ask for something. The others (your level, good time, how many, order price, keep, no opinion) only
 * say where things stand. YOUR LEVEL reports that a stock is at the user's own level: it would otherwise stand
 * under "To do today" on every day the stock stays up, with no way to end that but to sell or to take the level away.
 */
const ASKS = new Set<StepKind>(['missing', 'setup', 'trim', 'review', 'reserve', 'buy']);

/** Whether a step asks for something: those wear a filled mark wherever the plan is shown. */
export function asks(step: { kind: StepKind, waits?: boolean }): boolean {
  return ASKS.has(step.kind) && !step.waits;
}

/**
 * What a plan expects of the user today: the verbs of its steps that ask for something, in the plan's order
 * ("SELL SOME", "BUY"). Wherever a plan is summed up, above its lines and on a portfolio's button, they are named,
 * not counted: a number says that something is expected, not what.
 */
export function toDoVerbs(steps: PlanStep[]): string[] {
  return steps.filter(asks).map(step => step.verb);
}

/** The steps that only say where a stock you own stands. Neither asks for anything, and each names holdings alone. */
const IN_ROWS = new Set<StepKind>(['hold', 'outside']);

/**
 * Whether a step is said in the table of holdings alone: once, in the row of each stock it names, with its sentence
 * under the table. Every other step is a line of its own above the table, also when its stocks have rows.
 */
export function saidInRows(step: { kind: StepKind }): boolean {
  return IN_ROWS.has(step.kind);
}

/**
 * What the plan says about one stock that is owned: the step that names it, in the plan card's own words, the
 * amount when that step gives one, and what the plan offers to add when the stock is also one it would buy today.
 */
export type HoldingPlan = {
  kind: StepKind
  verb: string
  /** The step's sentence, as on the plan card. */
  text: string
  /** "keep $2,439": the amount the step gives for this stock. A week is not carried over: "Held" has a column of its own. */
  amount?: string
  /** "add 8.4% ($840)": how much more of it would bring it to its share of the portfolio, and a sentence saying so. */
  add?: { verb: string, label: string, text: string }
  /**
   * "your level: up 18%": the stock is up to the level the user set for taking a profit. Said beside what the plan
   * says about the stock, which stays as it is (KEEP, or SELL SOME for one that is over the limit).
   */
  level?: { verb: string, label: string, text: string }
};

const ABOUT_HOLDINGS = new Set<StepKind>(['missing', 'trim', 'review', 'hold', 'outside']);

/**
 * The plan turned around: for each stock owned, what the plan says about it. The same steps as on the plan card,
 * so the two can never disagree. A stock the plan would buy but that is not owned has no entry.
 */
export function holdingPlans(steps: PlanStep[]): Map<string, HoldingPlan> {
  const plans = new Map<string, HoldingPlan>();
  steps.filter(step => ABOUT_HOLDINGS.has(step.kind)).forEach(step => step.items.forEach(item => {
    const plan: HoldingPlan = {kind: step.kind, verb: step.verb, text: step.text};
    if (step.kind === 'trim' && item.label) {
      plan.amount = item.label;
    }
    plans.set(item.symbol, plan);
  }));
  // A stock at the user's level for taking a profit: said beside what the plan says about it, which stays.
  const level = steps.find(step => step.kind === 'level');
  level?.items.forEach(item => {
    const plan = plans.get(item.symbol);
    if (plan) {
      plan.level = {verb: level.verb, label: `your level: ${item.label}`, text: level.text};
    }
  });
  // What the plan would buy today is also said in the row of each stock of it that is owned: how much can be added.
  const buy = steps.find(step => step.kind === 'buy');
  buy?.inRows?.forEach(item => {
    const plan = plans.get(item.symbol);
    if (plan && item.label) {
      plan.add = {verb: buy.verb, label: item.label, text: ADD_TEXT};
    }
  });
  return plans;
}

/**
 * What can still be added to the holdings that are marked DIP BUY today: what each is short of its share of the
 * portfolio (recommendations.ts), within the limit. Every priced holding counts in the split; one that is too big
 * already is offered nothing. Empty while the portfolio's worth, and so every share of it, is not known.
 */
function roomToAdd(priced: Holding[], notTooBig: Holding[], limit: Limit | undefined, f: Figures): Addition[] {
  if (!limit) {
    return [];
  }
  const offered = new Set(notTooBig.map(it => it.row.symbol));
  return additions({
    portfolioValue: limit.dollars / limit.percent * 100, limitPercent: limit.percent,
    holdings: priced.map(it => ({symbol: it.row.symbol, value: it.row.view.value!, cases: it.row.cases})),
  }, f).filter(it => offered.has(it.symbol));
}

/** The amount of one stock, in dollars, that loses exactly the limit in the tested bad case. */
function fitting(limit: Limit, cases: TestedCases): number {
  return limit.dollars / (cases.lossPercent / 100);
}
