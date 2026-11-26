import {Stock} from "../api/microsoft-money.service";
import {costDistributionFor} from "./market-math";
import {DIP_PERCENT, growthChipText, growthOutlook, OWNERS_CONTEXT, Signal, signalFor, TARGET_CONTEXT} from "./signal";

/**
 * What a row of "Could add" says about the stock itself, beside the size the plan gives it: the two things its
 * mark rests on (how far it dropped, the growth figure), and two pieces of context the owner of the page asked to
 * see there (analysts' price target, how many of its owners are in profit).
 *
 * Each is a cell of a few characters, so the rows stay one line tall and a column can be read down; the sentence
 * behind a cell shows where the pointer rests, in the words a stock's details use for the same fact.
 *
 * None of it orders the rows. The first two are the tested rule, and every stock in the box passed it; the last
 * two were not usable in any test, and the page says so wherever it shows them.
 */
export type StockFacts = {
  /** How far the price is below its highest of the past year: "−42%". */
  dropped: string
  droppedTip: string
  /** The growth figure the mark rests on: "profit +21%" or "sales +27%". */
  growing: string
  growingTip: string
  /** How far analysts' middle price target is from today's price: "+56%". Nothing with too few analysts. */
  target: string
  targetTip: string
  /** How many of the stock's owners paid less than today's price: "38%". Nothing with too little price history. */
  holders: string
  holdersTip: string
};

/** The headings of those four columns. The lists on the Watchlist name the same facts the same way. */
export const FACT_COLUMNS = {dropped: 'Dropped', growing: 'Growing', target: 'Analyst target', holders: 'Holders in profit'} as const;

/** What each of the four columns is, said when its heading is pointed at or reached with the keyboard. */
export const FACT_HELP = {
  dropped: `How far the price is below its highest of the past year. A stock is marked DIP BUY from ${DIP_PERCENT}% down.`,
  growing: 'The growth figure the mark rests on: profit per share (the next quarter as analysts expect it plus the last 3 ' +
    'reported, against the last 4 reported), or the latest quarter\'s sales against the same quarter a year earlier.',
  target: 'How far the middle one of analysts\' price targets for 12 months from now is above (+) or below (−) today\'s price. ' +
    'Context only: targets lag a fast fall, and there is no history of them to test against.',
  holders: 'An estimate, from the past year\'s prices and trading, of how many of the stock\'s owners paid less than today\'s ' +
    'price. Context only: it made no difference in tests.',
} as const;

/** Under the table: which of the four the mark rests on, and that the other two are no reason to pick. */
export const FACTS_NOTE = `"${FACT_COLUMNS.dropped}" and "${FACT_COLUMNS.growing}" are what the DIP BUY mark rests on. ` +
  `"${FACT_COLUMNS.target}" cannot be tested yet and "${FACT_COLUMNS.holders}" made no difference in tests: ` +
  'they are context, not a tested reason to pick one.';

/**
 * The four facts of a stock, or nothing for a stock the page cannot judge (a fund, a company with too little
 * history): such a stock has no mark and is never in the box.
 *
 * @param signal the stock's mark and what was worked out with it; given by a test that fixes the day
 */
export function factsOf(stock: Stock | undefined, signal: Signal = stock ? signalFor(stock) : null): StockFacts | undefined {
  if (!stock || !signal) {
    return undefined;
  }
  const price = stock.quote?.price;
  // The same two lines a stock's details show under "Context": found there, so the sentence is said one way.
  const targetLine = signal.factors.find(it => it.reason.startsWith(TARGET_CONTEXT))?.reason;
  const median = stock.equity?.analysis?.estimate?.medianPriceTarget;
  const upside = targetLine && price && median ? (median - price) / price * 100 : undefined;
  const ownersLine = signal.notes.find(it => it.includes(OWNERS_CONTEXT));
  const cost = ownersLine ? costDistributionFor(stock) : null;
  return {
    dropped: signal.belowHigh === undefined ? '' : `−${signal.belowHigh.toFixed(0)}%`,
    droppedTip: signal.belowHigh === undefined ? '' : `${signal.belowHigh.toFixed(1)}% below its highest price of the past year.`,
    growing: growthChipText(growthOutlook(stock)),
    growingTip: signal.growthText ? `${signal.growthText.charAt(0).toUpperCase()}${signal.growthText.slice(1)}.` : '',
    target: upside === undefined ? '' : wholeSigned(upside),
    targetTip: targetLine ? `${targetLine}.` : '',
    holders: cost ? `${cost.profitRatio.toFixed(0)}%` : '',
    holdersTip: ownersLine ? `${ownersLine.charAt(0).toUpperCase()}${ownersLine.slice(1)}.` : '',
  };
}

/** A whole percent with its sign: "+56%", "−4%", "0%". */
function wholeSigned(value: number): string {
  const whole = Math.round(value);
  return `${whole > 0 ? '+' : whole < 0 ? '−' : ''}${Math.abs(whole)}%`;
}
