import {emptyPortfolio, parsePortfolio, Portfolio} from "./positions";

/**
 * The book: every portfolio you keep (one per account, say), each with a name, and which one is shown.
 * The book is what gets saved, to the database when the store is answering (on the development server the store
 * keeps nothing) and always to this browser as a fallback.
 */
export type NamedPortfolio = Portfolio & { id: string, name: string };

export type PortfolioBook = {
  v: 2
  /** When this copy was last saved (ISO time): decides between the browser copy and the one in the database. */
  savedAt?: string
  /** Id of the portfolio being shown. */
  active: string
  portfolios: NamedPortfolio[]
};

export type BookStorage = { getItem(key: string): string | null, setItem(key: string, value: string): void };

const STORAGE_KEY = 'watchlist.portfolios.v2';
/** Where the single, unnamed portfolio of the first version was kept. */
const OLD_STORAGE_KEY = 'watchlist.portfolio.v1';
const DEFAULT_NAME = 'Portfolio';

export function emptyBook(): PortfolioBook {
  return {v: 2, active: 'p1', portfolios: [{...emptyPortfolio(), id: 'p1', name: DEFAULT_NAME}]};
}

/** The portfolio being shown (the first one if the saved choice no longer exists). */
export function activeOf(book: PortfolioBook): NamedPortfolio {
  return book.portfolios.find(it => it.id === book.active) ?? book.portfolios[0];
}

/** Replaces the content of the shown portfolio (positions and settings), keeping its name and id. */
export function withActive(book: PortfolioBook, portfolio: Portfolio): PortfolioBook {
  const current = activeOf(book);
  const updated: NamedPortfolio = {v: 1, id: current.id, name: current.name, positions: portfolio.positions};
  if (portfolio.cash !== undefined) {
    updated.cash = portfolio.cash;
  }
  if (portfolio.lossBudgetPercent !== undefined) {
    updated.lossBudgetPercent = portfolio.lossBudgetPercent;
  }
  if (portfolio.takeProfitPercent !== undefined) {
    updated.takeProfitPercent = portfolio.takeProfitPercent;
  }
  if (portfolio.reservePercent !== undefined) {
    updated.reservePercent = portfolio.reservePercent;
  }
  return {...book, portfolios: book.portfolios.map(it => it.id === current.id ? updated : it)};
}

export function selectPortfolio(book: PortfolioBook, id: string): PortfolioBook {
  return book.portfolios.some(it => it.id === id) ? {...book, active: id} : book;
}

/** Adds an empty portfolio under that name and shows it. A blank name adds nothing. */
export function addPortfolio(book: PortfolioBook, name: string): PortfolioBook {
  const trimmed = name.trim();
  if (!trimmed) {
    return book;
  }
  const highest = Math.max(0, ...book.portfolios.map(it => Number(/^p(\d+)$/.exec(it.id)?.[1] ?? 0)));
  const id = `p${highest + 1}`;
  return {...book, active: id, portfolios: [...book.portfolios, {...emptyPortfolio(), id, name: trimmed}]};
}

export function renamePortfolio(book: PortfolioBook, id: string, name: string): PortfolioBook {
  const trimmed = name.trim();
  if (!trimmed) {
    return book;
  }
  return {...book, portfolios: book.portfolios.map(it => it.id === id ? {...it, name: trimmed} : it)};
}

/** Removes a portfolio. The book never ends up without one: removing the last leaves a fresh empty portfolio. */
export function removePortfolio(book: PortfolioBook, id: string): PortfolioBook {
  const portfolios = book.portfolios.filter(it => it.id !== id);
  if (portfolios.length === 0) {
    return {...emptyBook(), savedAt: book.savedAt};
  }
  return {...book, portfolios, active: portfolios.some(it => it.id === book.active) ? book.active : portfolios[0].id};
}

/** Every symbol held in any portfolio, once, A to Z. */
export function symbolsHeld(book: PortfolioBook): string[] {
  return [...new Set(book.portfolios.flatMap(it => Object.keys(it.positions)))].sort();
}

/** The book marked with the moment it is saved. */
export function stamped(book: PortfolioBook, now: Date): PortfolioBook {
  return {...book, savedAt: now.toISOString()};
}

/**
 * Reads a book from text: the stored file, or one being imported. Also accepts the single portfolio written
 * before portfolios had names. Returns undefined unless every part is sound, because a half-read book would
 * silently lose positions.
 */
export function parseBook(text: string): PortfolioBook | undefined {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  if (raw.v === 1) {
    const single = parsePortfolio(text);
    if (!single) {
      return undefined;
    }
    const {savedAt, ...content} = single;
    const book = withActive(emptyBook(), content);
    return savedAt ? {...book, savedAt} : book;
  }
  if (raw.v !== 2 || !Array.isArray(raw.portfolios) || raw.portfolios.length === 0) {
    return undefined;
  }
  const portfolios: NamedPortfolio[] = [];
  for (const entry of raw.portfolios) {
    const content = entry && typeof entry === 'object' ? parsePortfolio(JSON.stringify({...entry, v: 1})) : undefined;
    const idTaken = portfolios.some(it => it.id === entry?.id);
    if (!content || typeof entry.id !== 'string' || !entry.id.trim() || idTaken || typeof entry.name !== 'string' || !entry.name.trim()) {
      return undefined;
    }
    const {savedAt, ...rest} = content;
    portfolios.push({...rest, id: entry.id, name: entry.name.trim()});
  }
  const book: PortfolioBook = {
    v: 2,
    active: portfolios.some(it => it.id === raw.active) ? raw.active : portfolios[0].id,
    portfolios,
  };
  if (typeof raw.savedAt === 'string' && !isNaN(Date.parse(raw.savedAt))) {
    book.savedAt = raw.savedAt;
  }
  return book;
}

/**
 * Decides which copy to use when the page starts: the one in this browser or the one in the database.
 * The later save wins, except that an empty copy never replaces one with content, so clearing the browser or
 * starting with a new database cannot wipe recorded positions.
 *
 * @param damaged a file is there but could not be read as a book. It is left alone: it may have been written by
 *                a newer version of this page, and only a change the user makes should replace it.
 */
export function reconcile(local: PortfolioBook, file: PortfolioBook | undefined, damaged = false): { book: PortfolioBook, writeFile: boolean, writeBrowser: boolean } {
  const keepLocal = (writeFile: boolean) => ({book: local, writeFile, writeBrowser: false});
  if (damaged) {
    return keepLocal(false);
  }
  if (!file || isEmpty(file)) {
    return keepLocal(!isEmpty(local));
  }
  if (isEmpty(local)) {
    return {book: file, writeFile: false, writeBrowser: true};
  }
  const localTime = savedTime(local), fileTime = savedTime(file);
  if (localTime === fileTime) {
    return keepLocal(false);
  }
  return localTime > fileTime ? keepLocal(true) : {book: file, writeFile: false, writeBrowser: true};
}

/** The copy kept in this browser; an empty book when there is none or it cannot be read. */
export function loadBook(storage: BookStorage = localStorage): PortfolioBook {
  try {
    return parseBook(storage.getItem(STORAGE_KEY) ?? '') ?? parseBook(storage.getItem(OLD_STORAGE_KEY) ?? '') ?? emptyBook();
  } catch {
    return emptyBook();   // storage unavailable (private mode): start empty rather than break the page
  }
}

export function saveBook(book: PortfolioBook, storage: BookStorage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(book));
  } catch {
    // Storage full or unavailable: the page still works; the copy in the database, if the store answers, is the durable one.
  }
}

/** Nothing recorded in any portfolio: no positions and no settings. */
function isEmpty(book: PortfolioBook): boolean {
  return book.portfolios.every(it =>
    Object.keys(it.positions).length === 0 && it.cash === undefined && it.lossBudgetPercent === undefined
    && it.reservePercent === undefined && it.takeProfitPercent === undefined);
}

/** When the copy was saved, as a number; 0 for a copy without a save time. */
function savedTime(book: PortfolioBook): number {
  const time = book.savedAt ? Date.parse(book.savedAt) : NaN;
  return isNaN(time) ? 0 : time;
}
