import {Stock} from "../api/microsoft-money.service";

/**
 * "Why did it drop?" context for a dipped stock: its biggest one-day fall since the 52-week high, plus a few
 * headlines from that week (Google News search). Display only, never part of the verdict: news tone showed no
 * reliable 6-month edge in research and has no clean free history to test. It helps you judge whether the fall
 * was a one-off scare or a real change in the business.
 */

/** A one-day fall smaller than this is treated as part of a gradual slide rather than a news event. */
export const BIG_DROP_PERCENT = 4;

/** Added to the search so articles explaining the fall rank first. */
export const DROP_WORDS = '(falls OR drops OR plunges OR sinks OR slides OR tumbles OR slumps OR down)';

export type Headline = { title: string, source?: string, date?: Date, link?: string };

/** Phrases of "should you buy it?" pieces, which crowd a search about a falling stock but explain nothing. */
const PROMOTIONAL = [
  /\bis (it|this|now) (a|the) buy\b/i, /\bbuy (right )?now\b/i, /\bshould you (buy|sell)\b/i, /\btime to buy\b/i,
  /\bstocks? to (buy|own|watch)\b/i, /\bbuy the dip\b/i, /\bbetter buy\b/i, /\b(no-brainer|screaming) buy\b/i,
  /\bhistory (suggests|says)\b/i, /\bworth (this|that) much\b/i, /\$[\d,]+ investment\b/i, /\bmillionaire\b/i,
  /^prediction\b/i, /\bcould (soar|skyrocket|double|triple)\b/i, /\bwhere will .* be in \d+ years?\b/i,
];

/** True for stock-tip articles rather than news about why the price moved. */
export function isPromotional(title: string): boolean {
  return PROMOTIONAL.some(pattern => pattern.test(title));
}

export type BiggestDrop = { date: Date, changePercent: number };

export type DropNews = {
  /** Undefined when the decline had no single big day (a gradual slide). */
  drop?: BiggestDrop,
  headlines: Headline[],
};

/** The largest close-to-close one-day fall since the 52-week high (within the loaded 1-year daily chart). */
export function biggestDropSinceHigh(stock: Stock): BiggestDrop | undefined {
  const s = stock.chart;
  if (!s?.prices?.length || !s.timeStamps?.length) {
    return undefined;
  }
  const n = Math.min(s.prices.length, s.timeStamps.length);
  let highIdx = 0;
  for (let i = 0; i < n; i++) {
    const h = s.pricesHigh?.[i] ?? s.prices[i];
    if (isNum(h) && h > ((s.pricesHigh?.[highIdx] ?? s.prices[highIdx]) || 0)) {
      highIdx = i;
    }
  }
  let best: BiggestDrop | undefined;
  for (let i = Math.max(1, highIdx + 1); i < n; i++) {
    const prev = s.prices[i - 1], cur = s.prices[i];
    if (!isNum(prev) || !isNum(cur) || prev <= 0) {
      continue;
    }
    const change = (cur / prev - 1) * 100;
    if (!best || change < best.changePercent) {
      best = {date: new Date(s.timeStamps[i]), changePercent: change};
    }
  }
  return best && best.changePercent <= -BIG_DROP_PERCENT ? best : undefined;
}

/** Search text for a company: its name without legal suffixes, e.g. "Microsoft Corp" -> "Microsoft". */
export function newsQuery(stock: Stock): string | undefined {
  const raw = stock.quote?.displayName || stock.quote?.shortName;   // shortName is abbreviated ("CrowdStrike Hldg")
  const symbol = stock.quote?.symbol;
  if (!raw && !symbol) {
    return undefined;
  }
  const name = (raw ?? '')
    .replace(/\b(inc|corp|corporation|co|company|ltd|plc|holdings?|group|n\.?v|s\.?a|lp|class [a-c]|ordinary shares?|adr)\b\.?/gi, '')
    .replace(/[,.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? `"${name}" stock` : `${symbol} stock`;
}

/**
 * Parses a Google News RSS document into headlines ("Title - Source" titles are split), leaving out stock-tip
 * pieces so the few shown are the ones that explain the fall.
 */
export function parseHeadlines(xml: string, limit = 3): Headline[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(doc.querySelectorAll('item')).map(item => {
    const full = item.querySelector('title')?.textContent?.trim() ?? '';
    const source = item.querySelector('source')?.textContent?.trim() || undefined;
    const title = source && full.endsWith(` - ${source}`) ? full.slice(0, -(source.length + 3)) : full;
    const pub = item.querySelector('pubDate')?.textContent;
    const date = pub ? new Date(pub) : undefined;
    const link = item.querySelector('link')?.textContent?.trim() || undefined;
    return {title, source, date: date && !isNaN(date.getTime()) ? date : undefined, link};
  }).filter(it => !!it.title && !isPromotional(it.title)).slice(0, limit);
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
