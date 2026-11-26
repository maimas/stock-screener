import {Stock} from "../api/microsoft-money.service";
import {biggestDropSinceHigh, isoDay} from "./drop-news";
import {EVIDENCE} from "./evidence";
import {costDistributionFor, trendFor, volatilityFor} from "./market-math";
import {ReadingAbout} from "./reading";
import {
  computeSignal, daysUntilEarnings, debtToEquity, forwardPE, growthOutlook, lastEarnings, peFiveYearRange, percentBelow52wHigh,
  revenueGrowthPercent,
} from "./signal";

/**
 * Claude's view of a stock: one of three words and a short reason, given by the Claude Code on this computer when
 * the reader presses "Ask Claude about these" above a list (the job itself is tools/claude/claude-view.js).
 *
 * The owner of the page asked for it: the details of a stock "summarized by AI and added to a column as an AI
 * suggestion to act on the stock", to save reading the details and to hear something the mark does not say. It is
 * Claude's own opinion and no test stands behind it, so the column says "not tested", it changes neither the mark
 * nor the plan nor any amount, and the stocks of a list are not put in an order by it. What speaks for or against
 * it is its own record: how the stocks did after each view, worked out in claude-view-record.ts.
 *
 * What the page sends about a stock is figures only (numbers and fixed words), and nothing about what is owned.
 */

export type ViewWord = 'BUY SOME' | 'WAIT' | 'AVOID';
export const VIEW_WORDS: readonly ViewWord[] = ['BUY SOME', 'WAIT', 'AVOID'];

export type ViewSource = { title: string, url: string };

export type View = {
  view: ViewWord,
  /** The main reason in a few words, for the row. */
  short: string,
  /** The reason as one sentence, for where the pointer rests. */
  why: string,
  /** Pages the search returned and the view rests on; none when it rests on the figures alone. */
  sources: ViewSource[],
  asked: string,
  /** The day the view was given (YYYY-MM-DD), as the daily log names its days. */
  day: string,
};

/** The list being asked about: its stocks, those answered so far, and those that got no answer (with the reason). */
export type ViewQueue = {
  symbols: string[], done: string[], failed: Record<string, string>,
  /** The groups of stocks still to be compared, by letter, once the stocks are through. */
  comparing?: string[],
};

/**
 * Claude's pick among stocks that move together: the one of a group it would take first, with its sentence, from
 * one question that set the group's stocks side by side (tools/claude/claude-compare.js). Its own opinion, like a
 * view: not tested, and the page's marks still rank nothing.
 */
export type GroupPick = {
  /** The day of the comparison (YYYY-MM-DD). */
  day: string,
  /** The group's letter that day. */
  letter: string,
  /** The stock Claude would take first. */
  first: string,
  why: string,
  /** The stocks that were compared. */
  members: string[],
};

/** A comparison as one of its stocks sees it: whether that stock is the pick, and with which others it was compared. */
export type PickFor = GroupPick & { mine: boolean };

export type ViewsState = {
  /** The newest view of each stock. */
  views: Record<string, View>,
  /** Every view kept, by stock and by day: what the record is worked out from. */
  history: Record<string, Record<string, View>>,
  queue?: ViewQueue,
  /** Stocks that got no answer the last time they were asked about, with the reason. */
  failed: Record<string, string>,
  /** Every comparison kept, the oldest first; not there when there is none. */
  picks?: GroupPick[],
};

/** What the page sends about a stock. Each is left out when the stock does not have it. */
export type ViewFacts = {
  mark?: 'DIP BUY' | 'WATCH' | 'PASS' | 'none',
  growing?: 'yes' | 'no',
  belowHigh?: number,
  swings?: number,
  swingGroup?: 'high' | 'low' | 'middle',
  fellFurther?: number,
  salesGrowth?: number,
  eps?: number,
  debtToEquity?: number,
  pe?: number,
  peLow?: number,
  peHigh?: number,
  targetPercent?: number,
  rating?: number,
  analysts?: number,
  from200?: number,
  rising200?: 'yes' | 'no',
  ownersInProfit?: number,
  resultsInDays?: number,
  beat?: number,
  bigDropDay?: string,
  bigDropPercent?: number,
  dropAbout?: ReadingAbout,
};

export type ViewRequest = { symbol: string, name: string, facts: ViewFacts };

/** A group of stocks that move together, as it is sent to be compared: its letter and its stocks, each as a list's stock is. */
export type GroupRequest = { letter: string, members: ViewRequest[] };

/**
 * The least and the most each number may be, and how many decimals it is sent with. The server refuses a request
 * with a figure outside these (tools/claude/claude-view.js, FACT_FIELDS), so a figure that does not fit is left out
 * here. A test of the tools reads this table and fails when the two disagree.
 */
export const FACT_LIMITS = {
  belowHigh: [0, 100, 1],
  swings: [0, 500, 1],
  fellFurther: [0, 10, 1],
  salesGrowth: [-100, 10000, 1],
  eps: [-1000, 1000, 2],
  debtToEquity: [0, 1000, 2],
  pe: [-1000, 10000, 1],
  peLow: [-1000, 10000, 1],
  peHigh: [-1000, 10000, 1],
  targetPercent: [-100, 1000, 1],
  rating: [1, 5, 2],
  analysts: [0, 200, 1],
  from200: [-100, 1000, 1],
  ownersInProfit: [0, 100, 1],
  resultsInDays: [-400, 400, 1],
  beat: [-1000, 10000, 1],
  bigDropPercent: [-100, 0, 1],
} as const;

type NumberFact = keyof typeof FACT_LIMITS;

/** As few analysts as the details ask for before they quote a target or a rating. */
const MIN_ANALYSTS = 3;
/** Results due within this many days are "due"; otherwise the last ones reported are what there is to say. */
const RESULTS_AHEAD_DAYS = 30;
const STALE_AFTER_DAYS = 7;

export const VIEW_HEADING = 'Claude · not tested';
/** What the star is, in the words the page has for a group ("Group": stocks with the same letter moved closely together). */
export const PICK_HELP = 'A star marks the stock Claude would take first among the stocks with the same letter under "Group" ' +
  '(they moved closely together over the past year) that it compared. That is its own pick, not tested: the page\'s marks rank no stock.';
export const VIEW_HELP = 'Claude\'s own view of each stock, from the figures in its details and the recent news, asked for with the ' +
  'button above the list. It is an opinion, not a tested signal: it changes nothing else on the page. ' + PICK_HELP;
export const COMPARING = (letter: string): string => `Comparing group ${letter}…`;
export const HELD_NOTE = 'Claude was not told what you hold; your plan and its limit still apply.';
export const ASK_BUTTON = (stocks: number): string => stocks === 1 ? 'Ask Claude about this one' : `Ask Claude about these ${stocks}`;
export const ASKING = (done: number, stocks: number): string => `Asking Claude… ${done} of ${stocks}`;
/** Where the pointer rests on the button, or the keyboard reaches it: who is asked what, what it costs in time. */
export const ASK_TIP = 'Claude Code on this computer reads each stock\'s figures and the recent news about it, then says BUY SOME, ' +
  'WAIT or AVOID with a short reason. After the list it compares the stocks that move together (the same letter under "Group") ' +
  'and marks the one it would take first. About half a minute a stock. Nothing about what you hold is sent.';
export const ASK_BUSY = 'Claude is busy with another list. Try again in a minute.';

const FAILURE_TEXT: Record<string, string> = {
  'busy': 'Claude was busy with something else. Ask again.',
  'timeout': 'Claude took too long and was stopped. Ask again.',
  'failed': 'Claude Code did not answer. Ask again.',
  'no-answer': 'Claude did not give a usable answer. Ask again.',
  'not-saved': 'The answer could not be saved. Ask again.',
  'signed-out': 'Claude Code is not signed in. In the project folder, run "docker compose exec reader claude" and type /login.',
  'not-installed': 'Claude Code is not running. Start the app again with "docker compose up -d".',
  'wrong-start': 'This version of Claude Code did not start the way this page expects, so nothing was asked.',
};

/** Why a stock got no answer, in a sentence. A reason the page does not know reads as "did not answer". */
export function viewFailureText(reason: string): string {
  return FAILURE_TEXT[reason] ?? FAILURE_TEXT['failed'];
}

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The figures of a stock, as its details show them. `dropAbout` is what kind of news a kept reading of its biggest
 * fall found (the kind only, never the sentence).
 */
export function factsFor(stock: Stock, now: Date = new Date(), dropAbout?: ReadingAbout): ViewFacts {
  const facts: ViewFacts = {};
  const put = (field: NumberFact, value: unknown): void => {
    const [low, high, decimals] = FACT_LIMITS[field];
    if (!isNum(value)) {
      return;
    }
    const rounded = Number(value.toFixed(decimals)) || 0;
    if (rounded >= low && rounded <= high) {
      facts[field] = rounded;
    }
  };

  const signal = computeSignal(stock, now);
  facts.mark = signal?.verdict ?? 'none';
  if (signal) {
    facts.growing = signal.growing ? 'yes' : 'no';
  }
  put('belowHigh', percentBelow52wHigh(stock));
  const swings = volatilityFor(stock);
  put('swings', swings);
  if (signal?.verdict === 'DIP BUY' && isNum(swings)) {
    facts.swingGroup = signal.volatilityTier ?? 'middle';
    const fell = EVIDENCE.fresh.fellPercent;
    if (signal.volatilityTier) {
      put('fellFurther', Math.round((signal.volatilityTier === 'high' ? fell.volatile : fell.calm) / 10));
    }
  }
  put('salesGrowth', growthOutlook(stock, now)?.revenueGrowth ?? revenueGrowthPercent(stock));
  put('eps', stock.equity?.analysis?.keyMetrics?.eps);
  put('debtToEquity', debtToEquity(stock));
  put('pe', forwardPE(stock));
  const range = peFiveYearRange(stock);
  put('peLow', range?.low);
  put('peHigh', range?.high);

  const estimate = stock.equity?.analysis?.estimate, price = stock.quote?.price;
  if (isNum(estimate?.medianPriceTarget) && estimate!.medianPriceTarget > 0 && isNum(price) && price > 0
    && (estimate?.numberOfPriceTargets ?? 0) >= MIN_ANALYSTS) {
    put('targetPercent', (estimate!.medianPriceTarget / price - 1) * 100);
  }
  if (isNum(estimate?.recommendationRate) && estimate!.recommendationRate > 0 && (estimate?.numberOfAnalysts ?? 0) >= MIN_ANALYSTS) {
    put('rating', estimate!.recommendationRate);
    put('analysts', estimate!.numberOfAnalysts);
  }

  const trend = trendFor(stock);
  if (trend) {
    put('from200', trend.vs200Percent);
    if (isNum(trend.ma200SlopePercent)) {
      facts.rising200 = trend.ma200SlopePercent > 0 ? 'yes' : 'no';
    }
  }
  put('ownersInProfit', costDistributionFor(stock)?.profitRatio);

  const ahead = daysUntilEarnings(stock, now), last = lastEarnings(stock, now);
  if (isNum(ahead) && ahead <= RESULTS_AHEAD_DAYS) {
    put('resultsInDays', ahead);
  } else if (isNum(last?.daysAgo)) {
    put('resultsInDays', -last!.daysAgo!);
  }
  put('beat', last?.surprisePercent);

  const drop = biggestDropSinceHigh(stock);
  if (drop && !Number.isNaN(drop.date.getTime())) {
    facts.bigDropDay = isoDay(drop.date);
    put('bigDropPercent', drop.changePercent);
    if (dropAbout) {
      facts.dropAbout = dropAbout;
    }
  }
  return facts;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseView(value: unknown, day: string): View | undefined {
  const it = value as any;
  if (!it || typeof it !== 'object' || !VIEW_WORDS.includes(it.view) || typeof it.short !== 'string' || !it.short.trim()
    || typeof it.why !== 'string' || !it.why.trim()) {
    return undefined;
  }
  const sources: ViewSource[] = (Array.isArray(it.sources) ? it.sources : [])
    .filter((source: any) => !!source && typeof source.title === 'string' && typeof source.url === 'string' && /^https?:\/\//i.test(source.url))
    .map((source: any) => ({title: source.title, url: source.url}));
  return {view: it.view, short: it.short, why: it.why, sources, asked: typeof it.asked === 'string' ? it.asked : '', day};
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every(it => typeof it === 'string') ? value as string[] : undefined;
const reasons = (value: unknown): Record<string, string> => Object.fromEntries(
  Object.entries(isRecord(value) ? value : {}).filter(([symbol, reason]) => /^[A-Z]/.test(symbol) && typeof reason === 'string')) as Record<string, string>;

/** What the server answered, read with care: nothing unknown is passed on, and anything else reads as "no views". */
export function parseViews(body: unknown): ViewsState {
  const state: ViewsState = {views: {}, history: {}, failed: {}};
  if (!isRecord(body)) {
    return state;
  }
  Object.entries(isRecord(body['views']) ? body['views'] : {}).forEach(([symbol, days]) => {
    const kept: Record<string, View> = {};
    Object.keys(isRecord(days) ? days : {}).filter(day => DAY.test(day)).sort().forEach(day => {
      const view = parseView((days as Record<string, unknown>)[day], day);
      if (view) {
        kept[day] = view;
      }
    });
    const newest = Object.keys(kept).pop();
    if (newest) {
      state.history[symbol] = kept;
      state.views[symbol] = kept[newest];
    }
  });
  const queue = body['queue'];
  if (isRecord(queue)) {
    const symbols = strings(queue['symbols']), done = strings(queue['done']);
    if (symbols && done) {
      const comparing = strings(queue['comparing']);
      state.queue = {symbols, done, failed: reasons(queue['failed']), ...(comparing ? {comparing} : {})};
    }
  }
  state.failed = reasons(body['failed']);
  const picks: GroupPick[] = [];
  Object.keys(isRecord(body['picks']) ? body['picks'] : {}).filter(day => DAY.test(day)).sort().forEach(day => {
    const ofDay = (body['picks'] as Record<string, unknown>)[day];
    Object.entries(isRecord(ofDay) ? ofDay : {}).forEach(([letter, value]) => {
      const it = value as any, members = strings(it?.members);
      if (/^[A-Z]{1,2}$/.test(letter) && members && members.length >= 2 && typeof it.first === 'string' && members.includes(it.first)
        && typeof it.why === 'string' && it.why.trim()) {
        picks.push({day, letter, first: it.first, why: it.why, members});
      }
    });
  });
  if (picks.length) {
    state.picks = picks;
  }
  return state;
}

/** "Nov 14", for a day of the log. */
export function shortDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export type ViewCell = {
  /** One of the three words; "no answer" when the stock was asked about and nothing is kept; nothing when never asked. */
  word: string,
  short: string,
  /** What shows where the pointer rests, or the keyboard stops. */
  tip: string,
  /** The view is more than a week old: shown quieter, with its day. */
  stale: boolean,
  /** "from Nov 14", for a view that old. */
  from: string,
  /** "first of A", on the stock Claude would take first among those of its group that it compared; not there otherwise. */
  first?: string,
};

/**
 * The newest comparison of the past week that the stock was part of, as that stock sees it. Nothing when it was
 * never compared, or longer ago than the page shows a view without calling it old.
 */
export function pickOf(symbol: string, picks: GroupPick[] | undefined, today: string): PickFor | undefined {
  const mine = (picks ?? []).filter(pick => pick.members.includes(symbol) && pick.day <= today && daysBetween(pick.day, today) <= STALE_AFTER_DAYS);
  const newest = mine[mine.length - 1];
  return newest ? {...newest, mine: newest.first === symbol} : undefined;
}

/** "Of the 3 stocks of group A that Claude compared (ABCD, EFGH, IJKL), it would take this one first: … Compared Nov 26." */
function pickSentence(pick: PickFor): string {
  return `Of the ${pick.members.length} stocks of group ${pick.letter} that Claude compared (${pick.members.join(', ')}), it would take ` +
    `${pick.mine ? 'this one' : pick.first} first: ${pick.why} Compared ${shortDay(pick.day)}.`;
}

/**
 * What a row shows of Claude's view. `held`: the stock is in one of the reader's portfolios, which Claude was not
 * told. `failed`: why the stock got no answer the last time it was asked about; an earlier view then stays.
 */
export function cellOf(view: View | undefined, today: string, held: boolean, failed?: string, pick?: PickFor): ViewCell {
  if (!view) {
    return failed
      ? {word: 'no answer', short: '', tip: viewFailureText(failed), stale: false, from: ''}
      : {word: '', short: '', tip: '', stale: false, from: ''};
  }
  const stale = daysBetween(view.day, today) > STALE_AFTER_DAYS;
  const tip = [
    view.why, `Asked ${shortDay(view.day)}.`,
    ...(failed ? [`Asked again since, without an answer: ${viewFailureText(failed)}`] : []),
    ...(pick ? [pickSentence(pick)] : []),
    ...(held ? [HELD_NOTE] : []),
  ].join(' ');
  return {
    word: view.view, short: view.short, tip, stale, from: stale ? `from ${shortDay(view.day)}` : '',
    ...(pick?.mine ? {first: `first of ${pick.letter}`} : {}),
  };
}
