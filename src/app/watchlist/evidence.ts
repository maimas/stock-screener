import {FIGURES} from "./evidence.generated";

/**
 * Everything the app says about how well its own verdict has worked, in one place.
 *
 * The numbers are not written here. The backtests in tools/signal-backtest record what they measure, and
 * `npm run evidence` turns that into evidence.generated.ts; this file only turns those numbers into sentences.
 *
 * Three rules for anyone editing it. Never add a claim that has not passed a pre-registered test on stocks the idea
 * was not found on. When a sentence states something the numbers could one day contradict ("did no better",
 * "a rising market", "a few big winners"), add that statement to the checks in tools/evidence/figures.js, so that
 * an update stops instead of printing something false. And write for someone new to investing: "the market" rather
 * than an index's name, "dropped" rather than "dip", "1 in 10" rather than "the worst tenth". The app's own marks
 * (DIP BUY, WATCH, PASS) are the only terms of art, and "volatile" and "calm" come with what they mean.
 */
export type VolatilityGroupName = 'volatile' | 'middle' | 'calm';

/** The 26-week results of one kind of DIP BUY: the worst tenth lost `bad`% or more, the best tenth gained `good`%. */
export type TestedCase = { bad: number, typical: number, good: number };

export type Figures = {
  /** How far below the 52-week high counted as a dip in the tests, in %. */
  dipPercent: number
  /** backtest_summary.py: the six out-of-sample lists pooled. */
  stocks: number
  /** First and last purchase day of a tested DIP BUY. */
  firstBuy: string
  lastBuy: string
  dipBuy: { mean: number, median: number, upPercent: number, fellPercent: number }
  everyDip: { mean: number, median: number }
  notGrowing: { mean: number, median: number }
  sp500: { mean: number, beatPercent: number }
  /** Median lowest point in the 13 weeks after a DIP BUY, as % below the purchase price. */
  typicalLowPercent: number
  /** 95th percentiles among the tested DIP BUYs: how deep below the high and how volatile they got. */
  reach: { depthP95: number, volatilityP95: number }
  /** backtest_regime.py, pre-registered #4 (FAIL): an annual-revenue version of "growing" over a long history. */
  regime: { stocks: number, fromYear: number, toYear: number, growing: number, others: number, worseIn2020to2022: number }
  /** backtest_validation3.py, pre-registered #5, on the fifth ("fresh") list of faster-growing stocks. */
  fresh: {
    stocks: number, growing: number, everyDip: number, holding: number, withStop: number, stopPercent: number,
    stoppedPercent: number, fellPercent: { volatile: number, calm: number }
  }
  /** The volatility groups fixed in pre-registered #5, in % a year. */
  groups: { volatileFrom: number, calmBelow: number }
  /** Same list, by volatility group. Descriptive: not a hypothesis and not a prediction. */
  cases: Record<VolatilityGroupName, TestedCase>
  /** backtest_sentiment.py, pre-registered #3: dips bought in months when the VIX closed high. */
  fear: {
    stocks: number, fromYear: number, toYear: number, vixHigh: number, episodes: number,
    high: { mean: number, upPercent: number, fellPercent: number }, low: { mean: number }
  }
  /**
   * backtest_validation4.py, pre-registered #6, on the sixth list: the three rules the plan added.
   *  - buyFirst (P1): DIP BUYs that fell `fallPercent`% or more in the `weeks` weeks before did better than the rest
   *    on average, but inside one week they were ahead in only `aheadPercent`% of `weeksCompared` weeks. NOT used as
   *    a rule: the plan orders one day's candidates, and for that it is not dependable. Quoted as the reason why.
   *  - takeProfit (P2 PASS): selling at +`percent`% lowered the average result;
   *  - afterHolding (P3 KEEP on this list): the same positions over weeks 26 to 52 beat the S&P 500 on average.
   *    It did not hold up on the seventh list (G4), so the plan does not use it: quoted as one of two results.
   */
  sixth: {
    stocks: number
    buyFirst: { fallPercent: number, weeks: number, weeksCompared: number, aheadPercent: number }
    takeProfit: { percent: number, holding: number, holdingTypical: number, withTakeProfit: number, soldEarlyPercent: number }
    afterHolding: { stay: number, sp500: number, beatPercent: number, typicalExcess: number }
  }
  /**
   * backtest_validation5.py, pre-registered #7, on the seventh list: does following the plan make a profit?
   *  - profit (G1 PASS): DIP BUYs made money over 26 weeks;
   *  - market (G2): `beats` is whether they made more than the S&P 500 by that test's criterion (they did not);
   *  - secondHalf (G4 FAIL): weeks 26 to 52 against the S&P 500, the result that sent the plan back to 6 months;
   *  - sellingEarly (G5 PASS): the take-profit and the stop both lowered the average here too.
   * G3 (several positions against one) could not be decided on this list, so the plan no longer claims it.
   */
  seventh: {
    stocks: number
    profit: { mean: number, typical: number, upPercent: number, worstTenth: number }
    market: { sp500: number, beatPercent: number, beats: boolean }
    secondHalf: { stay: number, sp500: number }
    sellingEarly: { holding: number, withTakeProfit: number, soldEarlyPercent: number, withStop: number }
  }
  /**
   * backtest_plan.py: the plan replayed step by step on the six lists (one position at a time per stock, sized by
   * loss budget, held 26 weeks), in monthly batches. Descriptive: it adds no rule.
   */
  plan: {
    holdWeeks: number, positions: number, months: number, monthsUp: number, monthsBeat: number,
    worst: number, median: number, best: number, together: number,
    sp500: { monthsUp: number, worst: number, best: number, together: number }
  }
  /**
   * backtest_several.py, pre-registered #8 (S1 and S2 PASS), on 30 years of monthly prices: `count` stocks that
   * dropped, bought in the same month and held together for 6 months, against one alone. Random picks, equal
   * amounts; no "growing" check that far back. `badLoss` is what 1 pick in 10 lost or more, in %.
   * It is why the plan says how many, and never which.
   */
  several: {
    stocks: number, fromYear: number, toYear: number, count: number
    alone: { mean: number, typical: number, badLoss: number }
    together: { mean: number, typical: number, badLoss: number }
    /** The months after which the market fell over the 6 months: the typical result of one alone and of `count` together. */
    falling: { months: number, alone: number, together: number }
    market: { typical: number }
  }
  /**
   * backtest_validation6.py, pre-registered #9, on the eighth list (the last one never used): taking a profit at
   * +15% and at +25%, by a sell order placed in advance (`order`) and by selling after a week closed that high
   * (`seen`), each beside keeping for the 6 months (`keeping`). A level is a key of `seen` and of `order`.
   * `passed` decides what the plan offers as a level of the user's own (`takeProfitOffer`). Not there until that
   * test has been recorded; `decided: false` when the list was too thin to judge, and then nothing is quoted.
   */
  eighth?: { stocks: number, decided: false } | {
    stocks: number, decided: true, firstBuy: string, lastBuy: string
    /** For how many of the positions the market rose over the same 26 weeks, in %; null when the run could not tell. */
    marketRosePercent: number | null
    keeping: { mean: number, typical: number, lossPercent: number, badLoss: number }
    /** Sold once seen, but looking every second or every fourth week only: positions that ended below what was paid, in %. */
    lessOften: Record<number, { every2: number, every4: number }>
    seen: Record<number, TakeProfitTested>
    order: Record<number, TakeProfitTested>
  }
};

/** The two ways of taking a profit that were tested: a sell order placed in advance, and selling once the level is seen at a week's close. */
export type TakeProfitWay = 'seen' | 'order';

/**
 * One way of taking a profit at one level, on the eighth list. `lossPercent`: positions that ended below what was
 * paid; `badLoss`: what 1 position in 10 lost or more; `soldPercent`: positions the rule sold before the 6 months
 * were over; `milder`: the bad case counts as milder by the mark written down before the test (2 points), by
 * `milderPoints`; `reached`: of the positions sold, how many still ended with a loss when kept, and what they made
 * on average kept and sold.
 */
export type TakeProfitTested = {
  passed: boolean, lossPercent: number, badLoss: number, mean: number, typical: number, soldPercent: number
  milder: boolean, milderPoints: number
  reached: { lossPercentKept: number, meanKept: number, meanSold: number }
};

/** A level the plan may offer for taking a profit, and the ways it passed its test by. */
export type TakeProfitOffer = { level: number, seen: boolean, order: boolean };

/**
 * A small table of like figures in "How the plan was tested": what each row is, then a figure under each column.
 * The paragraphs beside it say what was found; the table holds the numbers, each once.
 */
export type EvidenceTable = {
  /** What the table shows, in a few words: it stands over it. */
  caption: string
  /** The name of the first column (what the rows are), then of each column of figures. */
  columns: readonly string[]
  rows: readonly EvidenceRow[]
  /** Rows set apart under a line of their own, which says why: the ways of selling the plan does not offer. */
  apart?: { title: string, rows: readonly EvidenceRow[] }
};

/** A row of such a table: what it is, and its figures in the order of the columns ('' where there is none). */
export type EvidenceRow = { label: string, cells: readonly string[] };

/** A piece of the account of the plan: a paragraph, or a small table of figures. Exactly one of the two. */
export type EvidenceBlock = { text: string, table?: undefined } | { table: EvidenceTable, text?: undefined };

/**
 * The levels the user may pick for taking a profit, lowest first: those that passed pre-registered #9 one way or
 * the other. None while that test has not been recorded, could not be decided, or passed nothing.
 */
export function takeProfitOffer(f: Figures = EVIDENCE): TakeProfitOffer[] {
  const e = f.eighth;
  if (!e || !e.decided) {
    return [];
  }
  return testedLevels(e)
    .map(level => ({level, seen: e.seen[level]?.passed === true, order: e.order[level]?.passed === true}))
    .filter(it => it.seen || it.order);
}

/** The levels a decided take-profit test has figures for, lowest first. */
function testedLevels(e: { seen: Record<number, TakeProfitTested>, order: Record<number, TakeProfitTested> }): number[] {
  return [...new Set([...Object.keys(e.order), ...Object.keys(e.seen)].map(Number))].sort((a, b) => a - b);
}

/** "a", "a and b", "a, b and c". */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Everything the app says about the take-profit test (pre-registered #9), for one set of figures.
 *
 * The account under THE PLAN is words and two small tables: what each way of selling did beside keeping, and what
 * became of the stocks a sale took out early. Each figure of the test stands once, in a table. The words say both
 * sides (a loss was rarer, the average was lower): those two statements, and "kept, they made more", are kept true
 * by the checks in tools/evidence/figures.js. The reason of a plan line (`why`) says both sides in the test's
 * numbers and what became of the stocks that got that far, as was written down before the test, and leaves the
 * rest to the tables. The bad case is said as the test's own reading has it: "milder by N points" from the mark
 * written down beforehand, "about as bad" under it.
 */
function takeProfitTexts(f: Figures): {
  blocks: readonly EvidenceBlock[], marketRosePercent: number | null,
  why: (level: number, way: TakeProfitWay) => string, brief: (level: number) => string,
  figures: (level: number) => { loss: string, mean: string } | undefined
} {
  const e = f.eighth;
  const nothing = {blocks: [] as readonly EvidenceBlock[], marketRosePercent: null, why: () => '', brief: () => '', figures: () => undefined};
  if (!e) {
    return nothing;
  }
  if (!e.decided) {
    return {
      ...nothing,
      blocks: [{
        text: `Selling early for a gain was to be tested on ${e.stocks} more stocks never used before, but too few of them were marked ` +
          'DIP BUY to say anything. The plan offers no level for taking a profit.',
      }],
    };
  }
  const k = e.keeping, offer = takeProfitOffer(f);
  const atLeast = (t: { badLoss: number }) => `${t.badLoss.toFixed(1)}%`;
  type Rule = { way: TakeProfitWay, level: number, t: TakeProfitTested };
  const ways: TakeProfitWay[] = ['order', 'seen'];
  const rules: Rule[] = testedLevels(e).flatMap(level => ways.filter(way => e[way][level]).map(way => ({way, level, t: e[way][level]})));
  if (rules.length === 0) {
    return nothing;
  }
  const offered = rules.filter(r => r.t.passed), refused = rules.filter(r => !r.t.passed);
  /**
   * Over the ways of selling the plan does not offer, in both tables: their verdict is quoted, so their figures are.
   * "The first time it was run": that run decides what is offered (TAKE_PROFIT_REGISTERED in tools/evidence/figures.js),
   * while the figures are those of the last run. A way can be under its marks then and at them now (the sell order
   * at +25%, since one faulty weekly price was put right on 2026-11-26) and is still not offered.
   */
  const NOT_OFFERED = 'Not offered: under the marks written down before the test, the first time it was run';
  const named = (r: Rule) => r.way === 'order' ? `Sell order at +${r.level}%` : `Sold once a week closed ${r.level}% up`;

  // What was found, in a sentence, then the figures: a row for keeping and one for each way of selling. A way the
  // plan does not offer stands apart, under a line that says why.
  const found =
    `Selling early: on ${e.stocks} more stocks never used before (bought from ${roughStart(e.firstBuy)} to ${monthYear(e.lastBuy)}), ` +
    'taking a profit made a loss rarer and gave less on average than keeping for 6 months: a sale gives up what the winners go on to make.';
  const did = (r: Rule): EvidenceRow => ({label: named(r), cells: [`${r.t.lossPercent}%`, atLeast(r.t), pct(r.t.mean), `${r.t.soldPercent}%`]});
  const whatEachDid: EvidenceTable = {
    caption: 'Stocks marked DIP BUY: kept for 6 months, or sold early',
    columns: ['What was done', 'Ended below what was paid', '1 in 10 lost at least', 'On average', 'Sold early'],
    rows: [{label: 'Kept for 6 months', cells: [`${k.lossPercent}%`, atLeast(k), pct(k.mean), '']}, ...offered.map(did)],
    ...(refused.length === 0 ? {} : {apart: {title: NOT_OFFERED, rows: refused.map(did)}}),
  };

  // What the plan does with it; then what became of the stocks a sale took out early, for every way (the written
  // rule wants that quoted wherever a verdict is, and the first table quotes them all).
  const by = (o: TakeProfitOffer) => o.seen && o.order ? 'by a sell order, or by selling once you see it'
    : o.order ? 'by a sell order' : 'by selling once you see it';
  const does =
    'The plan still says to keep for 6 months, because on average keeping paid more. ' +
    (offer.length > 0
      ? 'What made enough of a difference in this test is offered as a level you can set for yourself, beside your cash and your limit: ' +
        `${listOf(offer.map(o => `+${o.level}% (${by(o)})`))}.`
      : 'By the marks written down before this test, none of it made enough of a difference, so the plan offers no level for taking a profit.');
  const became = (r: Rule): EvidenceRow =>
    ({label: named(r), cells: [`${r.t.reached.lossPercentKept}%`, pct(r.t.reached.meanKept), pct(r.t.reached.meanSold)]});
  const whatBecame: EvidenceTable = {
    caption: 'The stocks that were sold early, had they been kept instead',
    columns: ['What was done', 'Kept: ended below what was paid', 'Kept: on average', 'Sold: on average'],
    rows: offered.map(became),
    ...(refused.length === 0 ? {} : {apart: {title: NOT_OFFERED, rows: refused.map(became)}}),
  };

  // What the test leaves out, and what looking less often than once a week gave for the lowest level tested: the
  // figures as they came out. (That the market rose over the same months is said once, at the end of the account.)
  const lowest = testedLevels(e)[0], seldom = e.lessOften[lowest], weekly = e.seen[lowest];
  const leavesOut =
    'What the test leaves out: it used weekly prices, filled a sell order at exactly its price and any other sale at the closing ' +
    'price of that week, and left the money idle afterwards, so "a loss is rarer" is about that one stock and not about what the ' +
    'money does next.' +
    (!seldom || !weekly ? '' :
      ` Selling at ${lowest}% up but looking only every second week, ${seldom.every2}% ended below what was paid; ` +
      `every fourth week, ${seldom.every4}% (every week: ${weekly.lossPercent}%).`);

  return {
    blocks: [{text: found}, {table: whatEachDid}, {text: does}, {table: whatBecame}, {text: leavesOut}],
    marketRosePercent: e.marketRosePercent,

    why: (level: number, way: TakeProfitWay): string => {
      const t = e[way][level];
      if (!t || !t.passed) {
        return '';
      }
      const selling = way === 'order' ? `a sell order placed in advance at ${level}% above the purchase price`
        : `selling after a week closed ${level}% or more above the purchase price`;
      return `In the test of selling early, ${selling} made a loss rarer: ` +
        `${t.lossPercent}% ended below what was paid, against ${k.lossPercent}% when kept, and the bad case was ` +
        `${t.milder ? `milder by ${t.milderPoints.toFixed(1)} points` : 'about as bad'}. ` +
        `It also gave less on average: ${pct(t.mean)} against ${pct(k.mean)}. ` +
        // What a reader faces when the rule applies: written down before the test as something to quote wherever a
        // verdict is, and a line of the plan is one. The tables stand behind "more", so they cannot stand in for it.
        `${t.soldPercent}% of the stocks ${way === 'order' ? 'reached that price' : 'got that far'}: kept, ` +
        `${t.reached.lossPercentKept}% of those still ended below what was paid, and they made ${pct(t.reached.meanKept)} on ` +
        `average against ${pct(t.reached.meanSold)} sold. ` +
        'The tables under THE PLAN, behind its "more", have the whole test.';
    },

    brief: (level: number): string => {
      const o = offer.find(it => it.level === level);
      if (!o) {
        return '';
      }
      const used = [
        ...(o.order ? [{t: e.order[level], how: 'with a sell order placed in advance'}] : []),
        ...(o.seen ? [{t: e.seen[level], how: 'when sold after a week closed that high'}] : []),
      ];
      const [one, other] = used;
      return `At +${level}%, in a test on ${e.stocks} stocks: ${one.t.lossPercent}% ended below what was paid ${one.how}` +
        (other ? ` and ${other.t.lossPercent}% ${other.how}` : '') + `, against ${k.lossPercent}% when kept. ` +
        `The average was ${used.map(it => pct(it.t.mean)).join(' and ')}, against ${pct(k.mean)}.`;
    },

    // The same two sides as two figures: how often a stock ended with a loss, and what it made on average, each
    // beside what keeping gave. A level offered both ways gives the two as a range, lowest first.
    figures: (level: number): { loss: string, mean: string } | undefined => {
      const o = offer.find(it => it.level === level);
      if (!o) {
        return undefined;
      }
      const used = [...(o.order ? [e.order[level]] : []), ...(o.seen ? [e.seen[level]] : [])];
      const range = (values: number[], said: (value: number) => string) => {
        const low = Math.min(...values), high = Math.max(...values);
        return said(low) === said(high) ? said(low) : `${said(low)} to ${said(high)}`;
      };
      return {
        loss: `${range(used.map(it => it.lossPercent), value => `${value}%`)}, kept ${k.lossPercent}%`,
        mean: `${range(used.map(it => it.mean), pct)}, kept ${pct(k.mean)}`,
      };
    },
  };
}

/** The app's own figures. (Typed, so a generated file with a different shape does not compile.) */
export const EVIDENCE: Figures = FIGURES;

const MINUS = '−';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GROUP_WORDS: Record<VolatilityGroupName, string> = {volatile: 'volatile stocks', middle: 'stocks with middling swings', calm: 'calm stocks'};

/** "1 in 3" when that is within two points of the share; the percentage otherwise. */
export function oneIn(percent: number): string {
  if (!(percent > 0)) {
    return '0%';
  }
  const n = Math.round(100 / percent);
  return n >= 2 && Math.abs(100 / n - percent) <= 2 ? `1 in ${n}` : `${percent}%`;
}

/** "4 in 10": for two shares compared side by side. */
export function inTen(percent: number): string {
  const n = Math.round(percent / 10);
  return n < 1 ? 'fewer than 1 in 10' : n > 9 ? 'nearly all' : `${n} in 10`;
}

/** "about half" from 45% to 55%; the percentage otherwise. */
export function roughShare(percent: number): string {
  return percent >= 45 && percent <= 55 ? 'about half' : `${percent}%`;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "three" for 3: a small number of stocks reads better as a word. Digits from eleven up. */
export function numberWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/** "mid-2023" for a day (YYYY-MM-DD) from May to August, "early" before, "late" after. */
export function roughStart(day: string): string {
  const month = Number(day.slice(5, 7)), year = day.slice(0, 4);
  return month <= 4 ? `early ${year}` : month <= 8 ? `mid-${year}` : `late ${year}`;
}

/** "May 2026" for a day (YYYY-MM-DD). */
export function monthYear(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

/** Every sentence the app builds from tested numbers, for one set of figures. */
export function textsFor(f: Figures) {
  const window = `${roughStart(f.firstBuy)} to ${monthYear(f.lastBuy)}`;
  const years = `${f.firstBuy.slice(0, 4)}–${f.lastBuy.slice(0, 4)}`;
  const fellFirst = `${oneIn(f.dipBuy.fellPercent)} fell a further 20% first`;
  const {volatileFrom, calmBelow} = f.groups;
  const fellVolatile = inTen(f.fresh.fellPercent.volatile), fellCalm = inTen(f.fresh.fellPercent.calm);
  const vix = f.fear.vixHigh;
  const {takeProfit, afterHolding} = f.sixth;
  const newest = f.seventh;

  // How many to hold (pre-registered #8). The clause is used wherever the plan only mentions it; the paragraph
  // below says what was tested, and what was not.
  const how = f.several, several = numberWord(how.count);
  const severalBrief = `${several} stocks held together had a milder bad half-year than one alone ` +
    `(1 in 10 lost ${how.together.badLoss}% or more, against ${how.alone.badLoss}%)`;
  const Several = `${several[0].toUpperCase()}${several.slice(1)}`;
  const severalBlocks: readonly EvidenceBlock[] = [
    {
      text: `How many: in a separate test on ${how.stocks} stocks that dropped, from ${how.fromYear} to ${how.toYear}, ${several} bought in the ` +
        'same month and held together for 6 months had a milder bad half-year and a higher typical result than one alone, and about the ' +
        'same average.',
    },
    {
      table: {
        caption: `${Several} stocks together against one alone`,
        columns: ['Held for 6 months', 'Typical result', '1 in 10 lost at least', 'On average'],
        rows: [
          {label: 'One alone', cells: [pct(how.alone.typical), `${how.alone.badLoss}%`, pct(how.alone.mean)]},
          {label: `${Several} together`, cells: [pct(how.together.typical), `${how.together.badLoss}%`, pct(how.together.mean)]},
          {label: 'The market', cells: [pct(how.market.typical), '', '']},
        ],
      },
    },
    {
      text: 'Holding several does not earn more on average, it makes the result steadier. When the market fell over those 6 months, ' +
        `${several} together still typically lost (${pct(how.falling.together)}). That far back the test cannot check that a business was ` +
        `growing, so it covers any stock that dropped, among companies that still exist. The ${several} were picked at random and held in ` +
        'equal amounts: which ones did not matter.',
    },
  ];

  // Taking a profit (pre-registered #9): paragraphs and two tables once that test has been recorded.
  const profitTexts = takeProfitTexts(f);
  // That the market was rising is said once in the account, at its end, with the share of that test beside it: a
  // share of purchases (a stock marked in several weeks counts each time), kept in step with "rising" by a check
  // in tools/evidence/figures.js.
  const rose = profitTexts.marketRosePercent === null ? ''
    : ` (for ${profitTexts.marketRosePercent}% of the purchases in the test of selling early it rose over the same 6 months)`;

  /**
   * What the plan is and whether it made money ("How the plan was tested"): short paragraphs, and a small table
   * wherever a test has like figures to set side by side, so that each figure stands once and none in a run of
   * prose. With the take-profit test recorded, what selling early did stands before the last paragraph.
   */
  const planBlocks: readonly EvidenceBlock[] = [
    {
      text: `The plan: buy stocks that dropped ${f.dipPercent}% or more while the business keeps growing (the app marks them DIP BUY), ` +
        `${several} or more rather than one; put no more into each than fits your limit; keep each for 6 months and do not sell early.`,
    },
    {
      text: `Does that make money? On ${newest.stocks} stocks never used before, such stocks gained ${pct(newest.profit.mean)} on average over ` +
        `6 months and ${newest.profit.upPercent}% of them were up; the typical one ended at ${pct(newest.profit.typical)}, and 1 in 10 lost ` +
        `${newest.profit.worstTenth}% or more. The market gained ${pct(newest.market.sp500)} over the same weeks, so on that list the plan ` +
        `made money, ${newest.market.beats ? 'and more than the market did' : 'but no more than the market did'}.`,
    },
    {
      text: `Over all ${f.stocks} test stocks (bought from ${window}) the average was ${pct(f.dipBuy.mean)} against ${pct(f.sp500.mean)} for the ` +
        `market, thanks to a few huge winners; the typical one ended at ${pct(f.dipBuy.median)}. ` +
        `Replayed month by month, the stocks bought in ${f.plan.monthsUp} of ${f.plan.months} months were up 6 months later ` +
        `(the market: ${f.plan.sp500.monthsUp} of ${f.plan.months}).`,
    },
    ...severalBlocks,
    ...profitTexts.blocks,
    {
      text: `"The market" is the S&P 500, an index of 500 large US companies. Apart from the test of how many, all of this is from ` +
        `${years}, when the market was rising${rose}. Not advice, and nothing is guaranteed.`,
    },
  ];
  /** The paragraphs of that account, without its tables. */
  const planParts: readonly string[] = planBlocks.flatMap(block => block.text === undefined ? [] : [block.text]);

  return {
    /** "mid-2023 to May 2026": when the tested DIP BUYs were bought. */
    window,
    /** "2023–2026" */
    years,

    dipBuyHeadline: (dipText: string): string =>
      `A growing company, ${dipText}. In tests, stocks like this gained ${pct(f.dipBuy.mean)} on average over 6 months ` +
      `(any stock that dropped: ${pct(f.everyDip.mean)}; the market: ${pct(f.sp500.mean)}). ` +
      `The typical one gained only ${pct(f.dipBuy.median)}, and ${fellFirst}.`,

    passHeadline: (epsPercent: number, revenuePercent: number): string =>
      `The business is not growing enough: the app looks for profit per share on course to grow ${epsPercent}%, or sales up ` +
      `${revenuePercent}% on a year ago. In tests, stocks like this that dropped gained ${pct(f.notGrowing.mean)} on average over 6 months, ` +
      `against ${pct(f.dipBuy.mean)} for growing ones; the typical result was about the same ` +
      `(${pct(f.notGrowing.median)} and ${pct(f.dipBuy.median)}).`,

    /** What the tests found for DIP BUYs, strongest caveats included. Shown in the row details. */
    dipBuyTestNotes: [
      `On ${f.stocks} stocks never used to build the rule (bought from ${window}), stocks that dropped while the business kept growing ` +
      `gained ${pct(f.dipBuy.mean)} on average over 6 months. Any stock that dropped gained ${pct(f.everyDip.mean)}, and the market ` +
      `(the S&P 500) ${pct(f.sp500.mean)} over the same weeks.`,
      `The gain comes from a few big winners. The typical one gained ${pct(f.dipBuy.median)} (any stock that dropped: ` +
      `${pct(f.everyDip.median)}), ${f.dipBuy.upPercent}% were up, ${f.sp500.beatPercent}% beat the market, and ${fellFirst}.`,
      `Not proven outside ${years}. A simpler version of "growing" (yearly sales only), tested on ${f.regime.stocks} stocks over ` +
      `${f.regime.fromYear}–${f.regime.toYear}, showed no advantage: ${pct(f.regime.growing)} against ` +
      `${pct(f.regime.others)} for the other stocks that dropped, and about ${f.regime.worseIn2020to2022} points worse in 2020–22.`,
      `On one of the test lists (${f.fresh.stocks} faster-growing stocks) growing made no difference: ` +
      `${pct(f.fresh.growing)} against ${pct(f.fresh.everyDip)} for any stock that dropped.`,
      `On the newest list (${newest.stocks} stocks never used before) such stocks gained ${pct(newest.profit.mean)} on average over 6 months, ` +
      `${newest.market.beats ? 'more than' : 'no more than'} the market (${pct(newest.market.sp500)}); the typical one ended at ` +
      `${pct(newest.profit.typical)}.`,
    ] as readonly string[],

    /** What the tests found about keeping a DIP BUY. */
    afterBuyingNotes: [
      `The typical one traded ${f.typicalLowPercent}% below the purchase price at some point in the next 13 weeks.`,
      `Selling after a ${f.fresh.stopPercent}% drop (a "stop-loss") lowered the average 6-month result on one test list ` +
      `(${pct(f.fresh.withStop)} against ${pct(f.fresh.holding)} for keeping), and ${roughShare(f.fresh.stoppedPercent)} of the stocks hit it.`,
      `Selling as soon as a stock was up ${takeProfit.percent}% lowered it too, on two other lists (${pct(takeProfit.withTakeProfit)} against ` +
      `${pct(takeProfit.holding)} for keeping, and ${pct(newest.sellingEarly.withTakeProfit)} against ${pct(newest.sellingEarly.holding)}).`,
      `After 6 months the tests disagree: kept for 6 months more, the stocks beat the market on one list ` +
      `(${pct(afterHolding.stay)} against ${pct(afterHolding.sp500)}) and not clearly on the next ` +
      `(${pct(newest.secondHalf.stay)} against ${pct(newest.secondHalf.sp500)}).`,
    ] as readonly string[],

    /** The validated risk groups: how often volatile and calm DIP BUYs fell another 20%+ within 13 weeks. */
    volatilityNote: (tier: 'high' | 'low', volatility: number): string => tier === 'high'
      ? `Volatile: its price swings a lot (${volatility.toFixed(0)}% a year). On one test list ${fellVolatile} such stocks fell a further 20% ` +
        `within 13 weeks of being marked DIP BUY, against ${fellCalm} of the calm ones (under ${calmBelow}%).`
      : `Calm: its price is steady (${volatility.toFixed(0)}% a year). On one test list ${fellCalm} such stocks fell a further 20% ` +
        `within 13 weeks of being marked DIP BUY, against ${fellVolatile} of the volatile ones (${volatileFrom}% or more).`,

    /** The same finding for a stock in neither group. */
    volatilityGroupsNote:
      `On one test list, ${fellVolatile} of the stocks marked DIP BUY whose price swings ${volatileFrom}% or more a year fell a further 20% ` +
      `within 13 weeks, against ${fellCalm} of those under ${calmBelow}%.`,

    /** The same finding for the Volatility column's header. */
    volatilityColumnNote:
      `How much the price swings in a year. The one risk measure that passed a test: on ${f.fresh.stocks} stocks, ${fellVolatile} of the ` +
      `"volatile" ones (${volatileFrom}% or more) fell a further 20% within 13 weeks of being marked DIP BUY, against ${fellCalm} of the ` +
      `"calm" ones (under ${calmBelow}%).`,

    /**
     * The whole tested range of one kind of DIP BUY, and how far that evidence reaches. Shown next to every
     * amount the calculator works out, so the bad case is never shown alone.
     */
    casesNote: (group: VolatilityGroupName): string => {
      const c = f.cases[group];
      return `In tests, 1 in 10 ${GROUP_WORDS[group]} like this lost ${c.bad}% or more 6 months after being marked DIP BUY, ` +
        `the typical one ended at ${pct(c.typical)}, and 1 in 10 gained ${c.good}% or more (one test list, ${f.fresh.stocks} stocks). ` +
        `Those tests cover ${window}, when the market was rising; in a falling market it can be worse.`;
    },

    /** Under the positions table: what "bad case" and "good case" are. */
    casesCardNote:
      `"Bad case" and "good case": in tests, 1 in 10 stocks like these did that badly or worse after 6 months, and 1 in 10 that well or better. ` +
      `The typical one ended at ${pct(f.cases.volatile.typical)} (volatile), ${pct(f.cases.middle.typical)} (in between) or ` +
      `${pct(f.cases.calm.typical)} (calm). Tested in ${years}, when the market was rising; in a falling market it can be worse. ` +
      `Arithmetic on your numbers, not advice.`,

    /** One line for the Dip candidates card, under what the three marks mean; also in the Signal column's explanation. */
    cardNote:
      `In tests on ${f.stocks} stocks (bought from ${window}) stocks marked DIP BUY gained ${pct(f.dipBuy.mean)} on average over 6 months; ` +
      `any stock that dropped gained ${pct(f.everyDip.mean)} and the market ${pct(f.sp500.mean)}. The typical one gained only ` +
      `${pct(f.dipBuy.median)}, and ${fellFirst}. Not proven outside ${years}.`,

    /** What market fear (the VIX) has meant for stocks that dropped, when it is high now and when it is not. */
    fearText: (high: boolean): string => high
      ? `The VIX measures how nervous investors are; ${vix} or more counts as fearful. In tests, stocks bought after a drop in fearful months ` +
        `gained ${pct(f.fear.high.mean)} on average over the next 6 months, against ${pct(f.fear.low.mean)} in calm months, ` +
        `and about ${inTen(f.fear.high.upPercent)} were up. Fear can still get worse first: about ${f.fear.high.fellPercent}% fell a further 20%. ` +
        `This rests on only about ${f.fear.episodes} fearful periods between ${f.fear.fromYear} and ${f.fear.toYear}, ` +
        `and a one-day spike may fade before the month ends.`
      : `The VIX measures how nervous investors are; under ${vix} counts as calm. In tests, stocks bought after a drop in calm months ` +
        `gained ${pct(f.fear.low.mean)} on average over the next 6 months, against ${pct(f.fear.high.mean)} in fearful months. ` +
        `Nothing wrong with buying in a calm market; fearful months were just better. ` +
        `Tested on ${f.fear.stocks} stocks, ${f.fear.fromYear} to ${f.fear.toYear}.`,

    /**
     * Under the steps of "Your plan today", always in view: whether the plan made money, in one short line. The
     * numbers are those of the pre-registered profit test on the newest list (#7, G1), with the market beside them.
     */
    planShort:
      `In tests on new stocks: ${pct(newest.profit.mean)} in 6 months on average (the market: ${pct(newest.market.sp500)}). ` +
      `Not advice; no guarantee.`,

    /** The words of that account in one run, without its tables: what the plan is and how it did when replayed. */
    planNote: planParts.join(' '),
    /** Its paragraphs: the plan, the profit test, the whole record, how many, selling early, what to keep in mind. */
    planParts,
    /** The account as the page shows it in "How the plan was tested": those paragraphs and the tables among them. */
    planBlocks,

    /**
     * How many to hold, as a clause ("three stocks held together had a milder bad half-year than one alone (...)"):
     * for the sentences that only mention it. The full account is in `planBlocks`, from "How many:" on.
     */
    severalBrief,
    /** In "What you own", while the plan covers one or two of the portfolio's stocks. */
    severalCardNote: (covered: number): string => `The plan covers ${covered} of your stocks. In tests, ${severalBrief}.`,

    /**
     * Taking a profit (pre-registered #9), for "How the plan was tested": what the test found, both sides, in a
     * sentence and a table; what the plan offers from it, with what became of the stocks that were sold; what the
     * test leaves out. Empty until that test has been recorded.
     */
    takeProfitBlocks: profitTexts.blocks,
    /** What a line of the plan about one way of taking a profit rests on: both sides, in the test's numbers. */
    takeProfitWhy: profitTexts.why,
    /** Under the field, while a level is picked: what that level did in the test, by the ways it is offered. */
    takeProfitBrief: profitTexts.brief,
    /** The same as two figures, for the line of figures under the fields. */
    takeProfitFigures: profitTexts.figures,

    /** After "Market fear high (VIX 31.2): " in the Dip candidates card. */
    fearHighShort:
      `in the past a better time to buy stocks that dropped (${wholePct(f.fear.high.mean)} against ${wholePct(f.fear.low.mean)} ` +
      `on average over 6 months), but fear can get worse first`,
  };
}

const TEXTS = textsFor(EVIDENCE);

export const dipBuyHeadline = TEXTS.dipBuyHeadline;
export const passHeadline = TEXTS.passHeadline;
export const DIP_BUY_TEST_NOTES = TEXTS.dipBuyTestNotes;
export const AFTER_BUYING_NOTES = TEXTS.afterBuyingNotes;
export const volatilityNote = TEXTS.volatilityNote;
export const VOLATILITY_GROUPS_NOTE = TEXTS.volatilityGroupsNote;
export const VOLATILITY_COLUMN_NOTE = TEXTS.volatilityColumnNote;
export const casesNote = TEXTS.casesNote;
export const CASES_CARD_NOTE = TEXTS.casesCardNote;
export const CARD_NOTE = TEXTS.cardNote;
export const fearText = TEXTS.fearText;
export const FEAR_HIGH_SHORT = TEXTS.fearHighShort;
/** The account of the plan as the page shows it: paragraphs and small tables, in order. */
export const PLAN_BLOCKS = TEXTS.planBlocks;
export const severalCardNote = TEXTS.severalCardNote;
export const PLAN_SHORT = TEXTS.planShort;
/** Under the field "Take a profit at", for the level picked: built once, like the texts above. */
export const takeProfitBrief = TEXTS.takeProfitBrief;
export const takeProfitFigures = TEXTS.takeProfitFigures;

/** Quotes no tested number: a WATCH is outside what the tests measured. */
export function watchHeadline(dipText: string, dipPercent: number): string {
  return dipText
    ? `A growing company, ${dipText}. That is not a drop of ${dipPercent}% or more, so the tests do not apply yet.`
    : 'A growing company, but its highest price of the past year is not known, so there is no drop to measure and the tests do not apply yet.';
}

function pct(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? MINUS : ''}${Math.abs(value).toFixed(1)}%`;
}

function wholePct(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : rounded < 0 ? MINUS : ''}${Math.abs(rounded)}%`;
}
