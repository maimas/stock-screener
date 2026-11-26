import {Stock} from "../api/microsoft-money.service";
import {LINKED_CORRELATION, tiedTo} from "./concentration";
import type {CashSplit, SplitPart} from "./cash-split";
import {EVIDENCE, Figures, textsFor} from "./evidence";
import {money, signedPercent, signedWholeMoney} from "./format";
import {PortfolioView} from "./portfolio-view";
import {CASH_LABEL, KEEP_OUT_LABEL, LIMIT_SLACK, PLAN_BOX, TestedCases} from "./sizing";
import {tickedTogether, TiedGroups} from "./tied-groups";

/**
 * A recommendation: one stock marked DIP BUY, sized for one portfolio. The watchlist finds the stock (the mark is
 * the tested part); this file says how much of one portfolio it would take, and what the portfolio already holds
 * that is like it. It never says which stock: every marked stock is listed, from A to Z, because the tests found
 * no dependable way to tell which will do best.
 *
 * The size is a share of the portfolio, worked out so that every stock in it carries the same risk: each is sized
 * so that its tested bad half-year would cost the same (a stock whose price swings more gets less). That is
 * arithmetic on the tested bad cases, the way the user chose to size their pretend portfolio; it is NOT a tested
 * rule, and no test compared it with equal amounts. Two things bound it:
 *  - the tested plan held three or more stocks, so a portfolio with fewer is split as if it held three;
 *  - the user's limit for the loss on one stock: no size is more than fits it.
 * The cash in the portfolio plays no part beyond being counted in what the portfolio is worth.
 *
 * Each size is worked out for that one stock joining what is held now: the rows of "Could add" do not add up to a
 * plan for all of them, and the box says so. Under its table the first row is worked out in words (`readingOf`).
 */

/** The title of the box on the portfolio's view that lists them. Texts elsewhere point to it by name. */
export const COULD_ADD = 'Could add';

/**
 * What stands above the table: which stocks these are, for which portfolio, that the page ranks none of them (the
 * rows start A to Z, and the reader may order them by a column: the owner asked for that), and that each size
 * stands alone. The last is said before the table is read: a long list of rows, each a good part of
 * the portfolio, otherwise reads as "buy all of them", which can be more than the whole portfolio. A size is worked
 * out for that one stock joining what is held now, so adding one changes the sizes of the rest.
 */
export function couldAddLead(count: number, portfolio: string, owned = 0): string {
  const marked = 'marked DIP BUY on the Watchlist (the price dropped while the business keeps growing)';
  if (count === 0) {
    // Every marked stock is held: the table then lists only the ones that could be added to.
    return owned === 0 ? ''
      : `${portfolio} already holds every stock that is marked DIP BUY right now. ${owned === 1 ? 'One' : owned} of them could be added to.`;
  }
  // The stocks that are owned and could be added to are the table's last rows, under a heading of their own
  // (OWNED_ROWS), and each says so itself ("held", "add 4.0%"): the lead does not grow for them.
  return count === 1 ? `1 stock is ${marked} and is not in ${portfolio} yet.`
    : `${count} stocks are ${marked} and are not in ${portfolio} yet. ` +
      'The page ranks none of them: the tests found no way to tell which will do best. ' +
      'Each size is for adding that one stock alone: once a stock is added, the others are sized again.';
}

/**
 * A figure with its name: what a sentence used to carry, set so that the number is found at a glance (the owner, of
 * a page of careful sentences: "too much text and not much signal"). `tip` is the sentence it comes from, for the
 * pointer and the keyboard, so that nothing is said only in short.
 */
export type Fact = { label: string, value: string, tip?: string };

/**
 * Beside the title, in place of the lead's first sentence: how many stocks the table lists, whose they are not
 * yet, and that the page ranks none of them. The lead itself is with the explanations of the box.
 */
export function couldAddHeadline(count: number, portfolio: string, owned = 0): string {
  if (count === 0) {
    return owned === 0 ? '' : `${portfolio} holds every stock marked DIP BUY · ${owned} could be added to`;
  }
  // One stock: no order to speak of.
  return count === 1 ? `1 stock marked DIP BUY, not in ${portfolio} yet` : `${count} stocks marked DIP BUY, not in ${portfolio} yet · not ranked`;
}

/**
 * The names of the columns that hold a row's numbers. The example under the table has a line under each of the
 * first three; the fourth is the split of the cash, shown while something is ticked and explained by its own lines.
 * Once what selling would free is counted in the split the money is no longer the cash alone, and a portfolio may
 * have no cash at all: the fourth column, and the heading over its lines, are then named by `money`.
 */
export const COLUMNS = {
  size: 'Size', bad: 'Bad case', good: 'Good case', cash: 'With your cash', money: 'With the money',
  // A stock's fit, as two short cells that can be read down the table (they were one sentence a row).
  sector: 'Sector (you own)', moves: 'Moves with yours',
} as const;

/**
 * The sentences of the cash split (cash-split.ts): the user ticks stocks, and the box says what the portfolio's
 * cash would buy of each and what the purchase would change. The app never ticks and never orders: which stocks
 * is the user's choice, and these sentences only say how much and what follows.
 */

/** Where a portfolio's cash is entered: named wherever the split has none to work with. */
const CASH_FIELD = `the "${PLAN_BOX}" box, under "${CASH_LABEL}"`;
/** Under half a cent an amount shows as $0, and counts as none. */
export const CENT = 0.005;
/**
 * Said in place of a split while a holding has no price and a share is kept outside stocks: the amount to keep is
 * then the least it can be, and what lies above it may be money the user set aside.
 */
const KEEP_UNKNOWN = 'one of your stocks has no price, so what you keep outside stocks cannot be worked out yet: ' +
  'nothing is split until its price loads.';

/**
 * The other way to have something to split, said where the split has no cash: the box under the sell side. Only
 * while the plan says to sell some of a stock and that money is not counted.
 */
function orCount(offered: boolean | undefined): string {
  return offered ? `, or tick "${COUNT_SOLD}"` : '';
}

/**
 * The money there is to split, named three ways: in the middle of a sentence, at its start, and with the verb that
 * agrees with it. It is the cash, the cash and what selling would free once that is counted, or the latter alone
 * when no cash is entered.
 */
function moneyNamed(own: boolean, counted: boolean): { mid: string, start: string, is: string } {
  return !counted ? {mid: 'your cash', start: 'Your cash', is: 'is'}
    : own ? {mid: 'your cash and what selling would free', start: 'Your cash and what selling would free', is: 'are'}
      : {mid: 'what selling would free', start: 'What selling would free', is: 'is'};
}

/**
 * The one sentence the box keeps in sight: an instruction, that ticking is the way in and how much there is to
 * split, or why there is nothing to split yet and where to enter the cash.
 *
 * @param freed   what selling would free, once the user asked for it to be counted in the split (`toSell`); else 0
 * @param offered the plan says to sell some of a stock and that money is not counted: where there is nothing to
 *                split, the hint then names that way to have something
 * @param keep    the dollars the user keeps outside stocks (their own share of the portfolio); only what is above
 *                it is split. 0 when they set no share
 */
export function tickHint(cash: number | undefined, freed = 0, offered = false, keep = 0, keepUnknown = false): string {
  const tick = 'Tick stocks to split';
  if (keep > 0 && keepUnknown) {
    // No "tick": nothing would come of it yet.
    return `O${KEEP_UNKNOWN.slice(1)}`;
  }
  const own = cash !== undefined && cash > 0 ? cash : 0;
  const there = own + (freed > 0 ? freed : 0);
  if (!(there > 0)) {
    // With a share kept, "enter it" alone would mislead: cash up to that amount still leaves nothing to split.
    return keep > 0
      ? `No cash to split yet, and only cash above the ${money(keep)} you keep outside stocks is split: enter it in ${CASH_FIELD}${orCount(offered)}.`
      : `No cash to split yet: enter it in ${CASH_FIELD}${orCount(offered)}.`;
  }
  const named = moneyNamed(own > 0, freed > 0);
  if (!(keep > 0)) {
    return `${tick} ${named.mid} (${money(there)}) between them.`;
  }
  if (there - keep < CENT) {
    return `Nothing to split yet: ${named.mid} (${money(there)}) ${named.is} within the ${money(keep)} you keep outside stocks.` +
      (offered ? ` Or tick "${COUNT_SOLD}".` : '');
  }
  // With the cash alone the clause reads on; with two kinds of money it is set off, so that it is about both.
  const above = `above the ${money(keep)} you keep outside stocks (${money(there - keep)})`;
  return freed > 0 ? `${tick} ${named.mid}, ${above}, between them.` : `${tick} ${named.mid} ${above} between them.`;
}

/**
 * What the columns of a row's numbers are, said when a heading is pointed at or reached with the Tab key. The
 * worked example under the table says the same with the first row's own amounts.
 */
export const COLUMN_HELP: Record<'size' | 'bad' | 'good' | 'cash' | 'sector' | 'moves', string> = {
  size: 'What the stock would get if it were the only one you add: a share of what this portfolio is worth, and that share in dollars.',
  bad: 'What that size would lose in a bad half-year: in tests, 1 in 10 stocks like it lost that much or more after 6 months.',
  good: 'What that size would gain in a good half-year: in tests, 1 in 10 stocks like it gained that much or more after 6 months.',
  cash: 'What the money to split would buy of each stock you ticked. A stock you did not tick shows nothing here.',
  // The two columns about what the portfolio holds that is like the stock (FIT_NOTE says the same in one paragraph).
  sector: 'The stock\'s sector and, in brackets, how many of your stocks are in it. A fact, not a tested reason to pick one.',
  moves: `Whether its price has moved closely with your stocks over the past year (${LINKED_CORRELATION} or more, where 0 is not at all and 1 is ` +
    'exactly together). The two figures show where the pointer rests on a cell. A fact, not a tested reason to pick one.',
};

/**
 * A ticked row's cell under "With your cash": one amount, what the money would buy of that stock. It is the row's
 * one figure to act on, so no second amount stands beside it (a row used to say "$1,000 of $2,013" after
 * "20.1% $2,013" under "Size": three dollar amounts, and a reader could not tell which was which). What the amount
 * is measured against is said in words: once for all the ticked rows in the lines under the table, and for this
 * row where the pointer rests, with the amount that used to stand beside it.
 *
 * A stock that gets nothing says why in two words beside a dash, so that it does not read as a mistake or as an
 * amount, and in full where the pointer rests: it is at its share already (an owned stock's share gets smaller
 * once new stocks are ticked beside it), or there is no money to split.
 */
export function splitCell(part: SplitPart): { amount: string, note: string, tip: string } {
  if (part.bound === 'none') {
    return {
      amount: '—', note: 'at its share',
      tip: 'With the stocks you ticked in the portfolio its share is smaller, and you hold that much of it already.',
    };
  }
  const amount = money(part.dollars), short = money(part.gap);
  const within = 'of its share with the stocks you ticked in the portfolio';
  // "All" as the two amounts print, like the sentence under the table: a part by cents is all of it on the page.
  const all = part.bound !== 'cash' || amount === short;
  // No money to split: a dash and two words, like a stock at its share. A bold "$0" would read as an amount.
  if (!all && part.dollars < CENT) {
    return {amount: '—', note: 'nothing to split', tip: `It is ${short} short ${within}, and there is no money to split.`};
  }
  const tip = all ? `This is all it is short ${within}.` + (part.bound === 'limit' ? ' Your limit holds that share back.' : '')
    : `It is ${short} short ${within}. This covers a part of that, the same part for every stock you ticked.`;
  return {amount, note: '', tip};
}

/**
 * With the notes of a table whose headings order its rows (the owner asked for every table to be sortable): the
 * page starts from A to Z and ranks nothing, so an order by a column is the reader's own view. It says so, in
 * "Could add" and under "Dip candidates" alike.
 */
export const ORDER_NOTE = 'A click on a heading orders the rows by its column, and a second click turns the order round. ' +
  'That is your own view of them: the page ranks nothing.';

/** What the lines under the table are told beside the split itself. */
export type SplitSaid = {
  /** How much of the split's cash is what selling would free (`toSell`), once the user asked to count it; else 0. */
  freed?: number
  /** The plan says to sell some of a stock and the money that would free is not counted: it could be. */
  offered?: boolean
  /** What each ticked row shows under "Size", in dollars and by symbol: its size alone, or what could be added to it. */
  alone?: Record<string, number>
  /** The dollars the user keeps outside stocks (their own share of the portfolio): the split's cash is what is above it. */
  keep?: number
  /** The cash entered for the portfolio, before anything is kept back or counted in. */
  cash?: number
  /**
   * A holding has no price, so the portfolio is worth more than could be counted and the dollars to keep are the
   * least they can be: nothing is split then, and the lines say why.
   */
  keepUnknown?: boolean
};

/**
 * Under the table, once something is ticked: what the ticked stocks are short of and how far the money goes; how
 * many stocks the portfolio would then hold; what a bad half-year could then cost; where the money is from.
 *
 * Putting cash into stocks raises what a bad half-year can cost in dollars, since cash cannot fall: the lines say
 * so, with the sum before and after, and do not call the purchase "less risk". With what selling would free
 * counted, "after" is after selling and buying, and the line says so: the sum can then go down, and the line says
 * that the sale is why, so that a ticked purchase beside a smaller loss is not read as buying one's way to safety.
 * The test of how many stocks to hold (three or more against one, pre-registered #8) is not quoted here: the plan
 * says it, by its own count of the stocks it covers, and this box counts every holding, a fund without a mark
 * included.
 *
 * The first line counts only the ticked stocks that are short of something: an owned stock ticked beside new ones is
 * often at its share already, and its row says so. With more stocks in the portfolio a share is usually smaller
 * than the size of a stock that is added alone, and a line says so where the money covers everything and a row's
 * amount is still less than its "Size". Only there: when the money covers a part, that is why an amount is less
 * and the first line says so; a size the limit holds back stays the same amount; and beside fewer than two other
 * stocks a share can come out larger.
 *
 * @param split the split as the page shows it. When what selling would free is counted, its cash holds that money
 *              too, and its "today" is the portfolio before anything is sold
 * @param o     what else the lines are told (`SplitSaid`)
 */
export function splitLines(split: CashSplit, o: SplitSaid = {}): string[] {
  const freed = o.freed ?? 0, counted = freed > 0;
  const count = split.parts.length;
  // What the user keeps outside stocks, and the cash they entered: the split's own cash is what is above the first.
  const keep = o.keep !== undefined && o.keep > 0 ? o.keep : 0, kept = money(keep);
  const cashEntered = o.cash ?? split.cash - freed, own = cashEntered >= CENT;
  if (keep > 0 && o.keepUnknown) {
    return [`You ticked ${count}, but ${KEEP_UNKNOWN}`];
  }
  if (!(split.cash > 0)) {
    const there = Math.max(0, cashEntered) + freed;
    if (keep > 0 && there >= CENT) {
      const named = moneyNamed(own, counted);
      return [`You ticked ${count}, but ${named.mid} (${money(there)}) ${named.is} within the ${kept} you keep outside stocks: ` +
        `nothing is left to split.${o.offered ? ` Or tick "${COUNT_SOLD}".` : ''}`];
    }
    return [`You ticked ${count}, but this portfolio has no cash to split` +
      (keep > 0 ? `, and only cash above the ${kept} you keep outside stocks is split` : '') +
      `. Enter it in ${CASH_FIELD}${orCount(o.offered)}.`];
  }
  // The money that is split, as it stands in a sentence: the cash, and with it what selling would free once that
  // is counted (all of it, when no cash is entered); less what the user keeps outside stocks, when they keep a share.
  const sum = money(split.cash);
  const above = keep > 0 ? `above the ${kept} you keep outside stocks` : '';
  const pot = !counted ? `your ${sum}${above && ` (your cash ${above})`}`
    : own ? `your ${sum} (your cash and what selling would free${above && `, ${above}`})`
      : `the ${sum} that selling would free${above && ` ${above}`}`;
  const entered = `The cash is what you entered under "${CASH_LABEL}" in the "${PLAN_BOX}" box`;
  const asSet = `stays outside stocks, as you set under "${KEEP_OUT_LABEL}"`;
  const source = keep > 0
    ? (!counted ? `${entered}; ${kept} of it ${asSet}.`
      : own ? `${entered}, and ${money(freed)} is what SELL SOME would free; ${kept} of the two ${asSet}.`
        : `This portfolio has no cash entered: the money is what SELL SOME would free (${money(freed)}), and ${kept} of it ${asSet}.`)
    : (!counted ? `${entered}.`
      : own ? `${entered}; ${money(freed)} of the ${sum} is what SELL SOME would free.`
        : `This portfolio has no cash entered: the ${sum} is what SELL SOME would free.`);
  const short = split.parts.filter(part => part.gap > 0).length, rest = count - short;
  const all = count === 1 ? 'The one you ticked is' : `The ${count} you ticked are`;
  if (short === 0) {
    const one = count === 1;
    return [`${all} at ${one ? 'its share' : 'their shares'} already, so none of ${pot} goes to ${one ? 'it' : 'them'}.`, source];
  }
  const one = short === 1;
  const who = rest === 0 ? all : `${short} of the ${count} you ticked ${one ? 'is' : 'are'}`;
  const others = rest === 0 ? '' : `; the ${rest === 1 ? 'other is at its share' : `other ${rest} are at their shares`} already`;
  const each = one ? '' : rest === 0 ? ', the same part for each' : `, the same part for each of the ${short}`;
  // "All" exactly when the two amounts of this sentence print the same: "$6,000 short ... Your $6,000 covers a part
  // of that" was true to the cent and contradicted itself. A row beside it can still be a dollar off, when rounding
  // falls differently for the rows than for their sum; no wording fits both then, and the sentence is the one that
  // has to agree with itself. What is over stays cash; with what selling would free counted it is not all cash
  // today, so it "would be left as cash"; and with a share kept outside stocks it is "more" cash, on top of that.
  const over = split.left < CENT ? ''
    : `, and ${money(split.left)}${keep > 0 ? ' more' : ''} ${counted ? 'would be left as cash' : 'stays cash'}`;
  const covers = money(split.placed) === money(split.gap) ? `covers all of it${over}` : `covers a part of that${each}`;
  const lines = [
    `${who} ${money(split.gap)} short of ${one ? 'its share' : 'their shares'}${others}. ${pot[0].toUpperCase()}${pot.slice(1)} ${covers}.`,
  ];
  // Why a row's amount is less than its "Size" although the money covers all that the ticked stocks are short of,
  // said only where a row shows it, as the two print. (When the money covers a part, the sentence above says why.)
  const coversAll = money(split.placed) === money(split.gap);
  const less = !coversAll || count < 2 ? [] : split.parts.filter(part => {
    const alone = o.alone?.[part.symbol];
    return part.gap > 0 && alone !== undefined && part.dollars < alone && money(part.dollars) !== money(alone);
  });
  if (less.length > 0) {
    lines.push(`With the others you ticked in the portfolio a stock's share is smaller than alone: that is why an amount ` +
      `can be less than the stock's "Size".`);
  }

  const {stocksBefore: before, stocksAfter: after} = split;
  if (after > before) {
    const stocks = `${after} ${after === 1 ? 'stock' : 'stocks'}`;
    lines.push(before > 0 ? `You would hold ${stocks} instead of ${before}.` : `You would hold ${stocks}.`);
  }
  const bad = badHalfYearLine(split, o);
  return [...lines, ...(bad ? [bad] : []), source];
}

/**
 * The answer to a tick as figures with their names, for the place beside the lead: what the ticked stocks are short
 * of, the money there is to split, what would stay cash, how many stocks the portfolio would hold, and what a bad
 * half-year could cost today and after. Each carries the sentence of `splitLines` it comes from as its tip.
 *
 * Where those sentences have one line that says why nothing is split (no cash, everything within what is kept, a
 * stock without a price), or that the ticked stocks are at their shares already, that line is the answer
 * (`instead`) and there are no figures.
 */
export function splitFacts(split: CashSplit, o: SplitSaid = {}): { facts: Fact[], instead: string } {
  const lines = splitLines(split, o);
  const short = split.parts.filter(part => part.gap > 0).length;
  // One line, or no ticked stock short of anything: the first sentence is the whole answer.
  if (lines.length < 2 || short === 0) {
    return {facts: [], instead: lines[0] ?? ''};
  }
  const freed = o.freed ?? 0, counted = freed > 0;
  const own = (o.cash ?? split.cash - freed) >= CENT;
  const count = split.parts.length;
  const facts: Fact[] = [
    // How much could go into the ticked stocks. Not "short of their shares": beside a stock, "shares" reads as
    // shares of stock. The sentence, with what the room is measured by, is the tip.
    {label: `Room for ${short < count ? `${short} of the ${count}` : count === 1 ? 'the one' : `the ${count}`} ticked`, value: money(split.gap), tip: lines[0]},
    // Where the money is from is the last of the sentences.
    {label: !counted ? 'Cash to split' : own ? 'Cash and sale money to split' : 'Sale money to split', value: money(split.cash),
      tip: lines[lines.length - 1]},
  ];
  // What is over, said only where the sentence says it: the money covers all, as the two amounts print.
  if (split.left >= CENT && money(split.placed) === money(split.gap)) {
    facts.push({label: counted ? 'Would be left as cash' : 'Stays cash', value: money(split.left), tip: lines[0]});
  }
  const {stocksBefore: before, stocksAfter: after} = split;
  if (after > before) {
    facts.push({
      label: 'Stocks held', value: before > 0 ? `${before} today, ${after} after` : `${after} after`,
      tip: lines.find(line => line.startsWith('You would hold')),
    });
  }
  const bad = badHalfYearLine(split, o);
  if (bad) {
    const today = signedWholeMoney(-split.togetherLossBefore), then = signedWholeMoney(-split.togetherLossAfter);
    facts.push(split.togetherLossBefore > 0
      ? {label: 'Bad half-year, every marked stock at once', value: `${today} today, ${then} after${counted ? ' selling and buying' : ''}`, tip: bad}
      : {label: 'Bad half-year, what you would buy', value: then, tip: bad});
  }
  return {facts, instead: ''};
}

/**
 * Which of the ticked stocks moved together over the past year, as one more figure of the answer to a tick: the
 * stocks with their group, or that none of them did. Its sentence (`tickedTogether`) is the tip. Nothing for fewer
 * than two ticked stocks, or while no stock on the page is in a group. A fact about the past year; it picks nothing.
 */
export function tiedFact(ticked: string[], tied: TiedGroups): Fact | undefined {
  const tip = tickedTogether(ticked, tied);
  if (!tip) {
    return undefined;
  }
  const names = (symbols: string[]) => symbols.length < 2 ? symbols.join('') : `${symbols.slice(0, -1).join(', ')} and ${symbols[symbols.length - 1]}`;
  const shared = tied.groups.map(group => ({letter: group.letter, symbols: group.symbols.filter(symbol => ticked.includes(symbol))}))
    .filter(it => it.symbols.length > 1);
  return {
    label: 'Moved together', tip,
    value: shared.length === 0 ? `none of the ${ticked.length}` : shared.map(it => `${names(it.symbols)} (group ${it.letter})`).join('; '),
  };
}

/**
 * What a bad half-year could cost today and after the ticked purchase, in a sentence: the one line of the split
 * that is about risk. The box shows it under the table among the other lines (`splitLines`) and again beside the
 * answer to a tick, so it is a value of its own. Nothing while nothing would be bought: no money to split, or every
 * ticked stock at its share already.
 *
 * The two sums are in whole dollars, like the cells they add up: worked out from tests, not counted. Then why the
 * sum went the way it did, with the reason that holds and only when the two amounts differ as printed: more of the
 * money in stocks when more is bought than selling frees; stocks that swing more when the sum is up without that
 * (a calm stock sold, a volatile one bought); the sale when the sum is down, which only a sale can do.
 */
export function badHalfYearLine(split: CashSplit, o: SplitSaid = {}): string {
  const freed = o.freed ?? 0, counted = freed > 0;
  const keep = o.keep !== undefined && o.keep > 0 ? o.keep : 0;
  if ((keep > 0 && o.keepUnknown) || !(split.cash > 0) || split.placed < CENT) {
    return '';
  }
  const today = signedWholeMoney(-split.togetherLossBefore), then = signedWholeMoney(-split.togetherLossAfter);
  const higher = today !== then && split.togetherLossAfter > split.togetherLossBefore;
  const lower = today !== then && split.togetherLossAfter < split.togetherLossBefore;
  const why = higher ? (split.placed > freed + CENT ? ' More of your money would be in stocks, and cash cannot fall.'
    : ' What you would buy swings more than what you would sell.')
    : lower && counted ? ' Selling takes more off it than what you would buy adds.' : '';
  return split.togetherLossBefore > 0
    ? `A bad half-year for every marked stock at once: ${today} today, ${then} after${counted ? ' selling and buying' : ''}.${why}`
    : `A bad half-year for what you would buy, all at once: ${then}. Today that money is cash, and cash cannot fall.`;
}

/**
 * A stock's fit as two short cells, for a table whose rows are one line tall and whose columns are read down: its
 * sector with, in brackets, how many of the stocks held are in it ("Technology (4)", "Utilities (none)"), and
 * "closely" when its price moves closely with theirs. The two figures behind "closely" are the tip, shown where
 * the pointer rests; when it does not move closely the cell says nothing and the tip still has the figures.
 * Nothing for an empty portfolio, or for a stock the page knows too little of.
 */
export function fitBrief(fit: Fit | undefined): { sector: string, moves: string, tip: string } {
  if (!fit) {
    return {sector: '', moves: '', tip: ''};
  }
  const sector = fit.sector ? `${fit.sector} (${fit.sameSector === 0 ? 'none' : fit.sameSector})` : '';
  // Blank only where it is not known (no prices to compare): "not closely" is said, so that the two can be told apart.
  const moves = fit.tied === undefined ? '' : fit.close ? 'closely' : 'not closely';
  const tip = fit.tied === undefined ? ''
    : `How closely its price has moved with your stocks: ${fit.tied.toFixed(2)} over the past year` +
      (fit.recent === undefined ? '' : `, ${fit.recent.toFixed(2)} over the last month`) + ' (0 = not at all, 1 = exactly together).';
  return {sector, moves, tip};
}

/**
 * Over the last rows of the table, when new stocks stand above them: the lead counts the new stocks only, and a
 * table with more rows than it counts would read as a miscount.
 */
export const OWNED_ROWS = 'Stocks you own that could be added to';

/**
 * The sell side of a rebalance: a holding the plan says to sell some of. `keep` is the most of it that fits the
 * limit, `free` what selling down to that would free.
 */
export type ToSell = { symbol: string, keep: number, free: number };

/**
 * The holdings the plan says to sell some of. The plan has one reason to sell and this is it again, worked out
 * from what the sizes are worked out from: a stock whose tested bad half-year would cost more than the limit, by
 * more than the tenth the plan lets pass (SELL SOME on the plan card, plan.ts; a test holds the two together).
 * Only a stock marked DIP BUY has a tested bad case, so no other holding is ever named, however big it is.
 * Nothing while the portfolio is worth nothing.
 */
export function toSell(input: SizingInput | undefined): ToSell[] {
  const limit = input ? input.portfolioValue * input.limitPercent / 100 : 0;
  if (!input || !(limit > 0)) {
    return [];
  }
  return input.holdings.flatMap((held): ToSell[] => {
    if (!held.cases || !(held.value * held.cases.lossPercent / 100 > limit * (1 + LIMIT_SLACK))) {
      return [];
    }
    const keep = limit / (held.cases.lossPercent / 100);
    return [{symbol: held.symbol, keep, free: held.value - keep}];
  });
}

/**
 * The portfolio as it would be once those are sold down: each at what is kept. What is freed is cash then, so the
 * portfolio is worth the same. The input handed in is left as it is.
 */
export function afterSelling(input: SizingInput, sold: ToSell[]): SizingInput {
  const kept = new Map(sold.map(it => [it.symbol, it.keep] as const));
  return {...input, holdings: input.holdings.map(it => kept.has(it.symbol) ? {...it, value: kept.get(it.symbol)!} : it)};
}

/**
 * The sell side in "Could add": that the plan asks to sell nothing, or which stocks SELL SOME names and what
 * selling them down to the limit would free. It reports the plan's step; the reason for it, and what the tests
 * say about selling, are on the plan card.
 *
 * The sentence for nothing to sell says what the plan asks, not that no stock held could lose more than the
 * limit: a stock without a mark has no tested bad case, and one may be over the limit by a tenth unnamed. That
 * tenth is in the sentence, so that it does not read as "none of yours could lose more than your limit".
 */
export function sellNote(sell: ToSell[]): string {
  if (sell.length === 0) {
    return 'The plan asks you to sell nothing today. Its one reason to sell is a stock marked DIP BUY that could lose over a tenth ' +
      'more than your limit in a bad half-year, and it names none of yours.';
  }
  const each = sell.map(it => `${it.symbol} down to ${money(it.keep)}`);
  const stocks = each.length === 1 ? each[0] : `${each.slice(0, -1).join(', ')} and ${each[each.length - 1]}`;
  return `The plan says SELL SOME: selling ${stocks} would free ${money(sell.reduce((sum, it) => sum + it.free, 0))}` +
    `${sell.length === 1 ? '' : ' in all'}.`;
}

/** Beside the box under that sentence: the money those sales would free is then split with the cash. */
export const COUNT_SOLD = 'Count that money in the split';

/**
 * Above the table, what those sales would free as a figure with its name, beside the box that counts it. The
 * sentence that names the stocks (`sellNote`) is its tip. Nothing while the plan asks to sell nothing.
 */
export function sellFact(sell: ToSell[]): Fact | undefined {
  return sell.length === 0 ? undefined
    : {label: 'SELL SOME would free', value: money(sell.reduce((sum, it) => sum + it.free, 0)), tip: sellNote(sell)};
}

/** In the row of a stock that is owned, where the others say what the portfolio holds that is like them. */
export function ownedFit(value: number): string {
  return `You own ${money(value)} of it today.`;
}

/** How the first row of "Could add" is worked out: a title, and a line under each of the row's three numbers. */
export type RowReading = { title: string, lines: { label: string, text: string }[], symbol?: string };

/** The example's title once the reader's own order has put another stock first: it is "the first row" no more. */
export const readingTitleOf = (symbol: string) => `For example, the row of ${symbol}`;

/**
 * The first row worked out in words, with that row's own amounts: what its size is a share of and why it is that
 * share, then what the two cases are and what they come to at that size, with the typical result beside the good
 * one. The page's owner could not tell what the three columns were from a paragraph of definitions, and the cases
 * were explained only where the pointer rested.
 *
 * The size is said as "dollars is share of worth", the order in which it can be checked: the share is shown to one
 * decimal, so worth × share would be a few dollars off. It is headed as an example, and the rows are from A to Z,
 * so that it is not taken for a pick. Undefined while there is no size to work out.
 */
export function readingOf(first: Recommendation | undefined, input: SizingInput | undefined, f: Figures = EVIDENCE): RowReading | undefined {
  const size = first?.size;
  if (!first || !size || !input) {
    return undefined;
  }
  const {symbol, cases} = first;
  const dollars = money(size.dollars);
  const stocks = input.holdings.length + 1, atLeast = f.several.count;
  const equally = 'if a bad half-year were to cost the same on each';
  // The limit is the most to lose on one stock, not the most to hold of it. The plan box prints it in dollars
  // beside "No size in the plan goes above what fits it", and most sizes here are more dollars than that: the line
  // under "Bad case" ends on the comparison that makes the two agree.
  const limit = money(input.portfolioValue * input.limitPercent / 100);
  const againstLimit = size.capped ? 'the most you accept to lose on one stock' : `within the ${limit} you accept to lose on one stock`;
  const why = size.capped
    ? `It is the most that fits your limit: at this size a bad half-year costs ${money(size.loss)}, the most you accept to lose on ` +
      'one stock. An equal share of the risk would be more.'
    : stocks >= atLeast ? `With ${symbol} it would hold ${stocks} stocks; this is ${symbol}'s share ${equally} of them.`
      : `${stocks === 1 ? `${symbol} would be its only stock` : `With ${symbol} it would hold ${stocks} stocks`}, ` +
        `but the tests held ${atLeast} or more: this is ${symbol}'s share as one of ${atLeast}, ${equally}.`;
  return {
    title: `For example, the first row: ${symbol}`,
    symbol,
    lines: [
      {
        label: COLUMNS.size,
        text: `${dollars} is ${shareText(size.sharePercent)} of what this portfolio is worth today (${money(input.portfolioValue)}). ${why}`,
      },
      {
        label: COLUMNS.bad,
        // "marked DIP BUY": that is what was measured, not every stock that swings as much.
        text: `In tests, 1 in 10 stocks marked DIP BUY that swing as much as ${symbol} lost ${cases.lossPercent}% or more after 6 months. ` +
          `On ${dollars} that is ${signedWholeMoney(-size.loss)}, ${againstLimit}.`,
      },
      {
        label: COLUMNS.good,
        // Whole dollars, as in the row these lines explain: the amounts are worked out from tests, not counted.
        text: `In the same tests, 1 in 10 gained ${cases.gainPercent}% or more: ${signedWholeMoney(size.gain)}. ` +
          `The typical one ended at ${signedPercent(cases.typicalPercent)}: ${signedWholeMoney(size.dollars * cases.typicalPercent / 100)}.`,
      },
    ],
  };
}

/**
 * Under the example: what holds for every row, that the split itself was not tested, and when the cases were
 * tested. The last is said here too, and not only under "What you own": a portfolio that holds nothing shows the
 * cases in this box alone.
 */
export function sizeRules(f: Figures = EVIDENCE): string {
  return 'A stock whose price swings more gets a smaller size. No size is more than fits your limit, and none depends on your cash. ' +
    `How to split money between stocks was not tested. Bad case and good case were tested in ${textsFor(f).years}, when the market ` +
    'was rising; in a falling market it can be worse.';
}

export const SIZE_RULES = sizeRules();

/** In its place while the portfolio is worth nothing. */
export const NO_SIZE_NOTE = 'This portfolio is worth nothing yet, so there is nothing to take a share of. ' +
  `Enter its cash in the "${PLAN_BOX}" box to see a size for each.`;

/** Under the table, when it has a "Fit" column: what that column is, and that it is not a reason to pick. */
export const FIT_NOTE = `"${COLUMNS.sector}" and "${COLUMNS.moves}" say what you already own that is like the stock: ` +
  'its sector with, in brackets, how many of your stocks are in it, ' +
  `and whether its price has moved closely with theirs (${LINKED_CORRELATION} or more, where 0 is not at all and 1 is exactly ` +
  'together). The figures for the past year and the last month show where the pointer rests on that cell. ' +
  'These are facts, not a tested reason to pick one.';

/** In place of the table when it would be empty: no stock is marked at all, or the portfolio holds every one that is. */
export function nothingToAdd(marked: number): string {
  return marked === 0 ? 'No stock on the Watchlist is marked DIP BUY right now, so there is nothing to add.'
    : 'This portfolio already holds every stock that is marked DIP BUY right now.';
}

/** Where a row's numbers come from, said when the pointer rests on them. */
export function sizeTip(size: Sized): string {
  return size.capped ? 'Made smaller so that it fits your limit: an equal share of the risk would be more.'
    : 'An equal share of the risk in this portfolio.';
}

export function badCaseTip(cases: TestedCases): string {
  return `In tests, 1 in 10 stocks like this lost ${cases.lossPercent}% or more after 6 months. At this size that would be the amount shown.`;
}

export function goodCaseTip(cases: TestedCases): string {
  return `In tests, 1 in 10 stocks like this gained ${cases.gainPercent}% or more after 6 months. ` +
    `The typical one ended at ${signedPercent(cases.typicalPercent)}.`;
}

/** In a stock's details on the Watchlist: the heading over its size in each portfolio, and the sentences under it. */
export const FITS_TITLE = 'Where it fits';
export const FITS_NOTE = `Its size in each of your portfolios, as a share of what that portfolio is worth. The Portfolio view lists it under "${COULD_ADD}".`;
export const FITS_NOT_MARKED = 'Only a stock marked DIP BUY gets a size: the tests measured no others, so the app works out no amount for this one.';
export const FITS_NO_PORTFOLIO = 'None of your portfolios is worth anything yet. Enter the cash of one on the Portfolio view to see a size.';

/** A stock marked DIP BUY, with what the tests found for stocks of its kind. */
export type Marked = { symbol: string, cases: TestedCases };

/** A stock the portfolio holds that has a price: what is held of it, and its tested cases when it is marked DIP BUY now. */
export type Held = { symbol: string, value: number, cases?: TestedCases };

/** What a size is worked out from. */
export type SizingInput = {
  /** What the portfolio is worth: its stocks at today's prices plus its cash. */
  portfolioValue: number
  /** The most to lose on one stock, as % of the portfolio. */
  limitPercent: number
  holdings: Held[]
};

export type Sized = {
  /** The share of the portfolio, in %. */
  sharePercent: number
  dollars: number
  /** What the tested bad case and the tested good case would mean at that size, in dollars. */
  loss: number
  gain: number
  /** The limit made it smaller than an equal share of the risk. */
  capped: boolean
};

/** What the portfolio already holds that is like a stock. Facts, not a tested reason to pick it. */
export type Fit = {
  /** How many stocks the portfolio holds. */
  holdings: number
  sector?: string
  /** How many of them are in that sector. */
  sameSector: number
  /** How closely its price has moved with theirs over the past year (0 = not at all, 1 = exactly together). */
  tied?: number
  /** The same over the last month: stocks that drift apart over a year often fall together in a sell-off. */
  recent?: number
  /** Whether either is close. */
  close: boolean
};

/** `size` is unknown while the portfolio is worth nothing; `fit` while it holds nothing. */
export type Recommendation = Marked & { size?: Sized, fit?: Fit };

/** What can still be added to a stock the portfolio holds. */
export type Addition = Sized & { symbol: string };

/**
 * The share of a portfolio (0 to 1) that one stock takes when every stock in it carries the same risk: shares in
 * proportion to 1 / the tested bad case, so that the bad case costs the same for each.
 *
 * @param lossPercent the stock's own tested bad case
 * @param others      the bad cases of the other stocks of the portfolio
 * @param o.atLeast   the portfolio is split as if it held at least this many stocks
 * @param o.standIn   the bad case counted for those missing ones
 */
export function equalRiskShare(lossPercent: number, others: number[], o: { atLeast: number, standIn: number }): number {
  const missing = Math.max(0, o.atLeast - 1 - others.length);
  const all = others.reduce((sum, loss) => sum + 1 / loss, 1 / lossPercent) + missing / o.standIn;
  return 1 / lossPercent / all;
}

/**
 * What the sizes of one portfolio are worked out from: what it is worth, its limit, and the stocks it holds that
 * have a price. Undefined while it is worth nothing (no cash and no priced stock): there is nothing to take a share of.
 */
export function sizingFor(view: PortfolioView): SizingInput | undefined {
  if (view.portfolioValue === undefined) {
    return undefined;
  }
  return {
    portfolioValue: view.portfolioValue, limitPercent: view.limitPercent,
    holdings: view.rows.filter(row => row.view.value !== undefined)
      .map(row => ({symbol: row.symbol, value: row.view.value!, cases: row.cases})),
  };
}

/** The size the plan gives a stock the portfolio does not hold. */
export function sizeOfNew(cases: TestedCases, input: SizingInput, f: Figures = EVIDENCE): Sized {
  return sized(cases, input.holdings.map(it => lossOf(it, f)), input, f).size;
}

/**
 * What can still be added to the stocks held: for each one that is marked DIP BUY now, what it is short of its
 * equal share of the risk. One that is at or near its share is left out ("add $12" is noise), and so is a stock
 * with no mark: the tests say nothing about its bad case.
 */
export function additions(input: SizingInput, f: Figures = EVIDENCE): Addition[] {
  const result: Addition[] = [];
  input.holdings.forEach((held, i) => {
    if (!held.cases) {
      return;
    }
    const others = input.holdings.filter((_, j) => j !== i).map(it => lossOf(it, f));
    const {size: whole} = sized(held.cases, others, input, f);
    const room = whole.dollars - held.value;
    if (room >= whole.dollars * LIMIT_SLACK) {
      result.push({symbol: held.symbol, ...amount(room, held.cases, input.portfolioValue, whole.capped)});
    }
  });
  return result.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Every stock marked DIP BUY that the portfolio does not hold, from A to Z (which is no order of merit), each
 * with its size. Without a size while the portfolio is worth nothing: there is nothing to take a share of.
 */
export function recommend(marked: Marked[], input: SizingInput | undefined, f: Figures = EVIDENCE): Recommendation[] {
  return [...marked].sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map(it => input ? {symbol: it.symbol, cases: it.cases, size: sizeOfNew(it.cases, input, f)} : {symbol: it.symbol, cases: it.cases});
}

/**
 * What the stocks held have in common with a stock: how many are in its sector, and how closely its price has
 * moved with theirs. Undefined for an empty portfolio.
 */
export function fitOf(stock: Stock | undefined, held: Stock[]): Fit | undefined {
  if (!stock || held.length === 0) {
    return undefined;
  }
  const sector = stock.equity?.company?.sector || undefined;
  const tied = tiedTo(stock, held);
  return {
    holdings: held.length, sector,
    sameSector: sector ? held.filter(it => it.equity?.company?.sector === sector).length : 0,
    tied: tied.year, recent: tied.month, close: tied.close,
  };
}

/**
 * "20.1%": to one decimal, as in the "% of total" column of what you own. A whole percent did not seem to agree
 * with the dollars beside it: "9% $3,400" in a portfolio worth $40,000, where the share is 8.5%.
 * A share too small to show (a small "add") says so instead of "0.0%".
 */
export function shareText(percent: number): string {
  return percent < 0.05 ? 'under 0.1%' : `${percent.toFixed(1)}%`;
}

/** "20.1% ($2,013)": the share of the portfolio first, the dollars second. */
export function sizeLabel(size: Sized): string {
  return `${shareText(size.sharePercent)} (${money(size.dollars)})`;
}

/** "add 8.4% ($840)": what can be added to a stock already held. */
export function addLabel(size: Sized): string {
  return `add ${sizeLabel(size)}`;
}

/** What one portfolio has to say about the stocks marked DIP BUY. */
export type Fitting = { name: string, held: string[], recommendations: Recommendation[], additions: Addition[] };

/**
 * Where one stock marked DIP BUY fits, a line for each portfolio: its size where it is not held, what can be
 * added where it is. A portfolio that is worth nothing yet has no line; a stock that is not marked has none.
 */
export function whereItFits(symbol: string, portfolios: Fitting[]): string[] {
  const lines: string[] = [];
  portfolios.forEach(it => {
    const size = it.recommendations.find(r => r.symbol === symbol)?.size;
    const more = it.additions.find(a => a.symbol === symbol);
    if (size) {
      lines.push(`${it.name}: ${sizeLabel(size)}`);
    } else if (it.held.includes(symbol)) {
      lines.push(more ? `${it.name}: you own it; ${addLabel(more)}` : `${it.name}: you own it, and it is at its share`);
    }
  });
  return lines;
}

/** The bad case counted for a stock held: its own when it is marked DIP BUY, the one of a stock in between when not. */
function lossOf(held: Held, f: Figures): number {
  return held.cases?.lossPercent ?? f.cases.middle.bad;
}

/** A stock's whole size in a portfolio whose other stocks have these bad cases: an equal share of the risk, within the limit. */
function sized(cases: TestedCases, others: number[], input: SizingInput, f: Figures): { size: Sized } {
  const equal = equalRiskShare(cases.lossPercent, others, {atLeast: f.several.count, standIn: f.cases.middle.bad});
  const fits = Math.min(1, input.limitPercent / cases.lossPercent);
  const capped = equal > fits;
  return {size: amount((capped ? fits : equal) * input.portfolioValue, cases, input.portfolioValue, capped)};
}

function amount(dollars: number, cases: TestedCases, portfolioValue: number, capped: boolean): Sized {
  return {
    sharePercent: dollars / portfolioValue * 100, dollars,
    loss: dollars * cases.lossPercent / 100, gain: dollars * cases.gainPercent / 100, capped,
  };
}
