/**
 * A reading: what the Claude Code on this computer found when it searched the news for why a stock fell on one day
 * ("Read it for me" under "Why it dropped"; the job itself is tools/claude/why-it-dropped.js).
 *
 * It is context only. No test shows that it helps to choose stocks, so it changes neither the mark nor the plan,
 * and the page says "not tested" beside it. Wording rules as everywhere on the page (the top of evidence.ts):
 * the sentence about what happened is Claude's, in plain words; the sentence about what kind of news it was is
 * written here, from one of four fixed kinds, so it reads the same every time.
 */

export type ReadingAbout = 'company' | 'industry' | 'market' | 'unclear';

export type ReadingSource = { title: string, url: string };

export type Reading = {
  /** The day of the fall that was read about (YYYY-MM-DD). */
  day: string,
  /** One sentence on what happened; empty when the news gave no clear reason. */
  what: string,
  about: ReadingAbout,
  /** Pages the search returned and the answer rests on. */
  sources: ReadingSource[],
  readAt: string,
};

/** What the page sends: a stock, and the day and size (in percent) of its fall. Nothing else. */
export type ReadingRequest = { symbol: string, name: string, day: string, percent: number };

export type ReadingFailure =
  'not-installed' | 'signed-out' | 'wrong-start' | 'timeout' | 'failed' | 'no-answer' | 'no-source' | 'not-saved' | 'busy' | 'no-server';

export type ReadingState =
  | { state: 'none' }
  | { state: 'reading' }
  | { state: 'done', reading: Reading }
  | { state: 'failed', reason: ReadingFailure, reading?: Reading };

export const READ_BUTTON = 'Read it for me';
export const READ_AGAIN = 'Read again';
/** Where the pointer rests on "Read it for me", or the keyboard reaches it: who reads what, and how long it takes. */
export const READ_TIP = 'Claude Code on this computer searches the news about this fall and says in a few sentences what it found, ' +
  'with its sources. It takes up to a minute.';
export const READING_NOW = 'Claude is searching the news about this fall. This takes up to a minute.';
export const NOT_TESTED_NOTE = 'Claude Code on this computer searched the news and wrote this. No test shows that it helps to choose ' +
  'stocks, so it is context only: it changes neither the mark nor the plan.';

const ABOUT: readonly ReadingAbout[] = ['company', 'industry', 'market', 'unclear'];

const ABOUT_TEXT: Record<ReadingAbout, string> = {
  company: 'This is about the company itself, not the whole market.',
  industry: 'This is about its whole industry, not only this company.',
  market: 'This is about the whole market, not only this company.',
  unclear: 'Claude found no clear reason for this fall in the news.',
};

const FAILURE_TEXT: Record<ReadingFailure, string> = {
  'busy': 'Claude is reading another stock. Try again in a minute.',
  'timeout': 'Claude took too long and was stopped. Try again.',
  'failed': 'Claude Code did not answer. Try again.',
  'no-answer': 'Claude did not give a usable answer. Try again.',
  'no-source': 'Claude named no page for its answer, so it is not shown. Try again.',
  'signed-out': 'Claude Code is not signed in. In the project folder, run "docker compose exec reader claude" and type /login.',
  'not-installed': 'Claude Code is not running. Start the app again with "docker compose up -d".',
  'wrong-start': 'This version of Claude Code did not start the way this page expects, so nothing was read.',
  'not-saved': 'The reading could not be saved, so it is not shown. Try again.',
  'no-server': 'The page could not reach Claude Code. Start the app again with "docker compose up -d" and try once more.',
};

/** Every answer of the local server carries this name (see store.service.ts). */
const STORE = 'watchlist';

/** "What happened. What kind of news it was." or, without a clear reason, one sentence saying so. */
export function readingSentences(reading: Reading): string {
  return reading.about === 'unclear' ? ABOUT_TEXT.unclear : `${reading.what} ${ABOUT_TEXT[reading.about]}`;
}

/** "Read by Claude on Nov 22 · not tested · 3 sources" */
export function readByLine(reading: Reading): string {
  const when = new Date(reading.readAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  const count = reading.sources.length;
  return `Read by Claude on ${when} · not tested` + (count ? ` · ${count} source${count === 1 ? '' : 's'}` : '');
}

export function failureText(reason: ReadingFailure): string {
  return FAILURE_TEXT[reason];
}

/** The site a page is on, as said beside its title: "example.org". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A search often gives a title in small letters ("why the shares fell today"): it gets its capital back. */
export function sourceTitle(title: string): string {
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function parseReading(value: unknown): Reading | undefined {
  const it = value as any;
  if (!it || typeof it !== 'object' || typeof it.day !== 'string' || typeof it.what !== 'string' || !ABOUT.includes(it.about)
    || typeof it.readAt !== 'string' || Number.isNaN(Date.parse(it.readAt))) {
    return undefined;
  }
  const sources: ReadingSource[] = (Array.isArray(it.sources) ? it.sources : [])
    .filter((source: any) => !!source && typeof source.title === 'string' && typeof source.url === 'string' && /^https?:\/\//i.test(source.url))
    .map((source: any) => ({title: source.title, url: source.url}));
  return {day: it.day, what: it.what, about: it.about, sources, readAt: it.readAt};
}

/**
 * What the local server answered, read with care: an answer that is not its own means there is no Claude Code to
 * ask (the app was started before this existed, or something else answered), and nothing unknown is passed on.
 */
export function parseState(body: unknown): ReadingState {
  const it = body as any;
  if (!it || typeof it !== 'object' || it.store !== STORE) {
    return {state: 'failed', reason: 'no-server'};
  }
  const reading = parseReading(it.reading);
  switch (it.state) {
    case 'none':
      return {state: 'none'};
    case 'reading':
      return {state: 'reading'};
    case 'busy':
      return {state: 'failed', reason: 'busy'};
    case 'done':
      return reading ? {state: 'done', reading} : {state: 'none'};
    case 'failed':
      return {state: 'failed', reason: it.reason in FAILURE_TEXT ? it.reason : 'failed', ...(reading ? {reading} : {})};
    default:
      return {state: 'failed', reason: 'failed'};
  }
}

/** The reading that belongs to the fall on the page: the one read for that day, if there is one. */
export function shownFor(state: ReadingState | undefined, day: string): Reading | undefined {
  const reading = state && (state.state === 'done' || state.state === 'failed') ? state.reading : undefined;
  return reading?.day === day ? reading : undefined;
}
