/**
 * Your lists: which stocks the page watches and how they are grouped. They are edited on the page ("Edit list")
 * and saved like the portfolios: in the database when the store is answering, and always in this browser.
 */
export type WatchlistDef = { id: string, title: string, symbols: string[] };

export type WatchlistBook = {
  v: 1
  /** When these lists were last saved (ISO time): decides between the copy in the browser and the one in the database. */
  savedAt?: string
  lists: WatchlistDef[]
};

export type ListStorage = { getItem(key: string): string | null, setItem(key: string, value: string): void };

const STORAGE_KEY = 'watchlist.lists.v1';
/** A ticker symbol: starts with a letter or digit, then letters, digits, dots or dashes (BRK.B, BF-B). */
const SYMBOL = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;

/**
 * The lists the page starts with, grouped by role in the AI build-out so it shows when a whole layer dips
 * together. They are only a starting point: once a list is edited on the page, the saved lists are used and this
 * is no longer read.
 */
const STARTING_LISTS: readonly WatchlistDef[] = [
  {id: 'l1', title: 'BIG TECH', symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META']},
  {id: 'l2', title: 'AI CHIPS', symbols: ['NVDA', 'AVGO', 'AMD', 'MU', 'SNDK', 'MRVL', 'ARM']},
  {id: 'l3', title: 'AI CLOUD & SOFTWARE', symbols: ['ANT', 'ORCL', 'NBIS', 'CRWD']},
  {id: 'l4', title: 'DATA CENTER GEAR & POWER', symbols: ['VRT', 'CSCO', 'GEV', 'BE', 'CEG', 'VST']},
  // Names that are not part of the AI trade.
  {id: 'l5', title: 'OTHER', symbols: ['TSLA', 'SPCX', 'RIVN', 'NEE', 'BLK']},
  {id: 'l6', title: 'FUNDS', symbols: ['SMH', 'SCHD']},
];

export function defaultBook(): WatchlistBook {
  return {v: 1, lists: STARTING_LISTS.map(list => ({...list, symbols: [...list.symbols]}))};
}

/** What is wrong with a symbol being typed, in words for the form, or undefined when it can be added. */
export function symbolProblem(text: string): string | undefined {
  const symbol = normal(text);
  if (!symbol) {
    return 'Enter a symbol.';
  }
  return SYMBOL.test(symbol) ? undefined : 'That is not a symbol: use up to 10 letters, digits, dots or dashes.';
}

/** Adds the symbol to the end of that list. Nothing changes if it is already there or is not a symbol. */
export function withSymbol(book: WatchlistBook, listId: string, text: string): WatchlistBook {
  const symbol = normal(text);
  if (symbolProblem(symbol)) {
    return book;
  }
  return changed(book, listId, list => list.symbols.includes(symbol) ? list : {...list, symbols: [...list.symbols, symbol]});
}

export function withoutSymbol(book: WatchlistBook, listId: string, symbol: string): WatchlistBook {
  return changed(book, listId, list => ({...list, symbols: list.symbols.filter(it => it !== symbol)}));
}

/** Adds an empty list at the end. A blank name adds nothing. */
export function addList(book: WatchlistBook, title: string): WatchlistBook {
  const trimmed = title.trim();
  if (!trimmed) {
    return book;
  }
  const highest = Math.max(0, ...book.lists.map(list => Number(/^l(\d+)$/.exec(list.id)?.[1] ?? 0)));
  // First: it is made at the top of the lists, so it stands right under the button that made it.
  return {...book, lists: [{id: `l${highest + 1}`, title: trimmed, symbols: []}, ...book.lists]};
}

export function renameList(book: WatchlistBook, id: string, title: string): WatchlistBook {
  const trimmed = title.trim();
  return trimmed ? changed(book, id, list => ({...list, title: trimmed})) : book;
}

export function removeList(book: WatchlistBook, id: string): WatchlistBook {
  return {...book, lists: book.lists.filter(list => list.id !== id)};
}

/** Moves a list one place up (-1) or down (1); the first stays first and the last stays last. */
export function moveList(book: WatchlistBook, id: string, by: -1 | 1): WatchlistBook {
  const from = book.lists.findIndex(list => list.id === id), to = from + by;
  if (from < 0 || to < 0 || to >= book.lists.length) {
    return book;
  }
  const lists = [...book.lists];
  [lists[from], lists[to]] = [lists[to], lists[from]];
  return {...book, lists};
}

/** Every symbol on the page, once, in the order of the lists. */
export function allSymbols(book: WatchlistBook): string[] {
  return [...new Set(book.lists.flatMap(list => list.symbols))];
}

export function listsWith(book: WatchlistBook, symbol: string): WatchlistDef[] {
  return book.lists.filter(list => list.symbols.includes(symbol));
}

/** The lists marked with the moment they are saved. */
export function stampedLists(book: WatchlistBook, now: Date): WatchlistBook {
  return {...book, savedAt: now.toISOString()};
}

/**
 * Reads lists from text (the saved file). Returns undefined unless every list is sound: lists read in part would
 * silently drop stocks from the page. A file edited by hand is tidied: capitals, no repeats, unknown fields dropped.
 */
export function parseWatchlists(text: string): WatchlistBook | undefined {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.lists)) {
    return undefined;
  }
  const lists: WatchlistDef[] = [];
  for (const entry of raw.lists) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || lists.some(list => list.id === entry.id)
      || typeof entry.title !== 'string' || !entry.title.trim() || !Array.isArray(entry.symbols)) {
      return undefined;
    }
    const symbols: string[] = [];
    for (const item of entry.symbols) {
      if (typeof item !== 'string' || symbolProblem(item)) {
        return undefined;
      }
      if (!symbols.includes(normal(item))) {
        symbols.push(normal(item));
      }
    }
    lists.push({id: entry.id, title: entry.title.trim(), symbols});
  }
  const book: WatchlistBook = {v: 1, lists};
  if (typeof raw.savedAt === 'string' && !isNaN(Date.parse(raw.savedAt))) {
    book.savedAt = raw.savedAt;
  }
  return book;
}

/**
 * Decides which lists to use when the page starts: the ones saved in this browser or the ones in the database.
 * The later save wins. `book` is undefined when lists were never saved anywhere: the page shows the starting lists.
 *
 * @param local   the lists saved in this browser, if any were
 * @param damaged a file is there but could not be read: it is left alone, only a change by the user replaces it
 */
export function reconcileLists(local: WatchlistBook | undefined, file: WatchlistBook | undefined, damaged = false): { book: WatchlistBook | undefined, writeFile: boolean, writeBrowser: boolean } {
  if (damaged || (!local && !file)) {
    return {book: local, writeFile: false, writeBrowser: false};
  }
  if (!file) {
    return {book: local, writeFile: true, writeBrowser: false};
  }
  if (!local) {
    return {book: file, writeFile: false, writeBrowser: true};
  }
  const localTime = savedTime(local), fileTime = savedTime(file);
  if (localTime === fileTime) {
    return {book: local, writeFile: false, writeBrowser: false};
  }
  return localTime > fileTime ? {book: local, writeFile: true, writeBrowser: false} : {book: file, writeFile: false, writeBrowser: true};
}

/** The lists saved in this browser; undefined when there are none or they cannot be read. */
export function loadWatchlists(storage: ListStorage = localStorage): WatchlistBook | undefined {
  try {
    return parseWatchlists(storage.getItem(STORAGE_KEY) ?? '');
  } catch {
    return undefined;   // storage unavailable (private mode): the page shows the starting lists
  }
}

export function saveWatchlists(book: WatchlistBook, storage: ListStorage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(book));
  } catch {
    // Storage full or unavailable: the page still works; the copy in the database, if the store answers, is the durable one.
  }
}

function normal(text: string): string {
  return text.trim().toUpperCase();
}

function changed(book: WatchlistBook, listId: string, change: (list: WatchlistDef) => WatchlistDef): WatchlistBook {
  return {...book, lists: book.lists.map(list => list.id === listId ? change(list) : list)};
}

function savedTime(book: WatchlistBook): number {
  const time = book.savedAt ? Date.parse(book.savedAt) : NaN;
  return isNaN(time) ? 0 : time;
}
