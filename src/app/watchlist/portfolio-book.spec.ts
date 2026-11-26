import {
  activeOf, addPortfolio, emptyBook, loadBook, parseBook, PortfolioBook, reconcile, removePortfolio, renamePortfolio,
  saveBook, selectPortfolio, stamped, symbolsHeld, withActive
} from "./portfolio-book";
import {Position, withPosition} from "./positions";

const TODAY = '2026-11-21';
const NVDA = {symbol: 'NVDA', shares: 10, price: 100, day: '2026-11-01'};
const AMD = {symbol: 'AMD', shares: 3, price: 400, day: TODAY};

/** A book with one portfolio of the given name holding the given positions. */
function bookOf(name: string, ...positions: Position[]): PortfolioBook {
  let book = renamePortfolio(emptyBook(), emptyBook().active, name);
  positions.forEach(position => book = withActive(book, withPosition(activeOf(book), position)));
  return book;
}

const names = (book: PortfolioBook) => book.portfolios.map(it => it.name);

describe('emptyBook', () => {
  it('starts with one empty portfolio, which is the one shown', () => {
    const book = emptyBook();
    expect(names(book)).toEqual(['Portfolio']);
    expect(activeOf(book).positions).toEqual({});
  });
});

describe('addPortfolio', () => {
  it('adds an empty portfolio under the given name and shows it', () => {
    const book = addPortfolio(bookOf('Brokerage', NVDA), 'Fidelity');
    expect(names(book)).toEqual(['Brokerage', 'Fidelity']);
    expect(activeOf(book).name).toBe('Fidelity');
    expect(activeOf(book).positions).toEqual({});
  });

  it('gives every portfolio its own id, also after one in the middle was removed', () => {
    let book = addPortfolio(addPortfolio(emptyBook(), 'A'), 'B');
    book = addPortfolio(removePortfolio(book, book.portfolios[1].id), 'C');
    const ids = book.portfolios.map(it => it.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('trims the name and refuses a blank one', () => {
    expect(names(addPortfolio(emptyBook(), '  Fidelity  '))).toEqual(['Portfolio', 'Fidelity']);
    expect(names(addPortfolio(emptyBook(), '   '))).toEqual(['Portfolio']);
  });
});

describe('withActive', () => {
  it('replaces the content of the portfolio being shown and leaves the others alone', () => {
    let book = addPortfolio(bookOf('Brokerage', NVDA), 'Fidelity');
    book = withActive(book, withPosition(activeOf(book), AMD));
    expect(Object.keys(activeOf(book).positions)).toEqual(['AMD']);
    expect(Object.keys(book.portfolios[0].positions)).toEqual(['NVDA']);
  });

  it("keeps the shown portfolio's name and id whatever content it is given", () => {
    const before = bookOf('Brokerage');
    const after = withActive(before, {v: 1, cash: 120.4, lossBudgetPercent: 2, positions: {NVDA}});
    expect(activeOf(after).name).toBe('Brokerage');
    expect(activeOf(after).id).toBe(activeOf(before).id);
    expect(activeOf(after).cash).toBe(120.4);
    expect(activeOf(after).lossBudgetPercent).toBe(2);
  });

  // Every change of the shown portfolio goes through here: a setting that is not carried over is lost at the next
  // click anywhere on the page.
  it('keeps the share to keep outside stocks, and takes it away when the content has none', () => {
    const before = bookOf('Brokerage');
    const kept = withActive(before, {v: 1, reservePercent: 20, positions: {NVDA}});
    expect(activeOf(kept).reservePercent).toBe(20);
    expect(activeOf(withActive(kept, {v: 1, positions: {NVDA}})).reservePercent).toBeUndefined();
    // And the level for taking a profit, the same way.
    const level = withActive(before, {v: 1, takeProfitPercent: 15, positions: {NVDA}});
    expect(activeOf(level).takeProfitPercent).toBe(15);
    expect(activeOf(withActive(level, {v: 1, positions: {NVDA}})).takeProfitPercent).toBeUndefined();
  });
});

describe('selectPortfolio', () => {
  const book = addPortfolio(bookOf('Brokerage', NVDA), 'Fidelity');

  it('shows the chosen portfolio', () => {
    expect(activeOf(selectPortfolio(book, book.portfolios[0].id)).name).toBe('Brokerage');
  });

  it('keeps showing the current one when asked for a portfolio that does not exist', () => {
    expect(activeOf(selectPortfolio(book, 'nope')).name).toBe('Fidelity');
  });
});

describe('renamePortfolio', () => {
  it('changes the name and nothing else', () => {
    const before = bookOf('Brokerage', NVDA);
    const after = renamePortfolio(before, before.active, ' Savings ');
    expect(names(after)).toEqual(['Savings']);
    expect(activeOf(after).positions).toEqual(activeOf(before).positions);
  });

  it('keeps the old name when the new one is blank', () => {
    const before = bookOf('Brokerage');
    expect(names(renamePortfolio(before, before.active, '  '))).toEqual(['Brokerage']);
  });
});

describe('removePortfolio', () => {
  const two = addPortfolio(bookOf('Brokerage', NVDA), 'Fidelity');   // Fidelity is shown

  it('removes the shown portfolio and shows the first one left', () => {
    const after = removePortfolio(two, two.active);
    expect(names(after)).toEqual(['Brokerage']);
    expect(activeOf(after).name).toBe('Brokerage');
  });

  it('keeps showing the same portfolio when another one is removed', () => {
    const after = removePortfolio(two, two.portfolios[0].id);
    expect(names(after)).toEqual(['Fidelity']);
    expect(activeOf(after).name).toBe('Fidelity');
  });

  it('leaves one empty portfolio when the last one is removed', () => {
    const one = bookOf('Brokerage', NVDA);
    const after = removePortfolio(one, one.active);
    expect(names(after)).toEqual(['Portfolio']);
    expect(activeOf(after).positions).toEqual({});
  });
});

describe('symbolsHeld', () => {
  it('lists every symbol held in any portfolio once, A to Z', () => {
    let book = addPortfolio(bookOf('Brokerage', NVDA, AMD), 'Retirement');
    book = withActive(book, withPosition(activeOf(book), {symbol: 'NVDA', shares: 40, price: 150.5}));
    book = withActive(book, withPosition(activeOf(book), {symbol: 'COHR', shares: 2.5, price: 180.25}));
    expect(symbolsHeld(book)).toEqual(['AMD', 'COHR', 'NVDA']);
  });

  it('is empty when nothing is held', () => {
    expect(symbolsHeld(emptyBook())).toEqual([]);
  });
});

describe('stamped', () => {
  it('records when the book was saved, so two copies can be told apart', () => {
    const book = stamped(bookOf('Brokerage', NVDA), new Date('2026-11-21T10:00:00Z'));
    expect(book.savedAt).toBe('2026-11-21T10:00:00.000Z');
    expect(names(book)).toEqual(['Brokerage']);
  });
});

describe('parseBook (reading the stored file, or one being imported)', () => {
  const good = stamped(addPortfolio(bookOf('Brokerage', NVDA), 'Fidelity'), new Date('2026-11-21T10:00:00Z'));

  it('reads back a book written by this app', () => {
    expect(parseBook(JSON.stringify(good))).toEqual(good);
  });

  it('wraps a single portfolio written before portfolios had names', () => {
    const old = {v: 1, lossBudgetPercent: 2, savedAt: '2026-11-21T10:00:00.000Z', positions: {NVDA}};
    const book = parseBook(JSON.stringify(old))!;
    expect(names(book)).toEqual(['Portfolio']);
    expect(activeOf(book).lossBudgetPercent).toBe(2);
    expect(activeOf(book).positions).toEqual({NVDA});
    expect(book.savedAt).toBe('2026-11-21T10:00:00.000Z');
  });

  it('shows the first portfolio when the saved choice is not among them', () => {
    expect(activeOf(parseBook(JSON.stringify({...good, active: 'gone'}))!).name).toBe('Brokerage');
  });

  it('rejects text that is not JSON, or not a book', () => {
    ['', 'not json', '[]', '{"v":3,"portfolios":[]}', '{"v":2}', '{"v":2,"active":"p1","portfolios":[]}'].forEach(text =>
      expect(parseBook(text)).withContext(text).toBeUndefined());
  });

  it('rejects a book with a broken portfolio rather than importing part of it', () => {
    const withPortfolio = (portfolio: unknown) => JSON.stringify({v: 2, active: 'p1', portfolios: [portfolio]});
    const sound = {id: 'p1', name: 'Brokerage', positions: {NVDA}};
    expect(parseBook(withPortfolio(sound))).withContext('sound').toBeDefined();
    expect(parseBook(withPortfolio({...sound, name: ' '}))).withContext('blank name').toBeUndefined();
    expect(parseBook(withPortfolio({...sound, id: ''}))).withContext('no id').toBeUndefined();
    expect(parseBook(withPortfolio({...sound, positions: {NVDA: {...NVDA, shares: 0}}}))).withContext('bad position').toBeUndefined();
  });

  it('rejects two portfolios with the same id', () => {
    const twice = {v: 2, active: 'p1', portfolios: [{id: 'p1', name: 'A', positions: {}}, {id: 'p1', name: 'B', positions: {}}]};
    expect(parseBook(JSON.stringify(twice))).toBeUndefined();
  });
});

describe('reconcile (the copy in this browser against the copy in the database)', () => {
  const at = (iso: string, book: PortfolioBook): PortfolioBook => ({...book, savedAt: iso});
  const held = bookOf('Brokerage', NVDA);
  const other = bookOf('Brokerage', AMD);

  it('keeps an empty browser copy and writes nothing when there is no file yet', () => {
    const local = emptyBook();
    expect(reconcile(local, undefined)).toEqual({book: local, writeFile: false, writeBrowser: false});
  });

  it('moves what is in the browser into the file when there is no file yet', () => {
    expect(reconcile(held, undefined)).toEqual({book: held, writeFile: true, writeBrowser: false});
  });

  // A share to keep outside stocks is a setting like the cash and the limit: a book that holds one is not empty.
  it('does not take a book that holds only a share to keep outside stocks for an empty one', () => {
    const onlyShare: PortfolioBook = {...emptyBook(), portfolios: emptyBook().portfolios.map(it => ({...it, reservePercent: 20}))};
    expect(reconcile(onlyShare, undefined)).withContext('no file yet: it is written').toEqual({book: onlyShare, writeFile: true, writeBrowser: false});
    const onlyLevel: PortfolioBook = {...emptyBook(), portfolios: emptyBook().portfolios.map(it => ({...it, takeProfitPercent: 15}))};
    expect(reconcile(onlyLevel, undefined)).withContext('nor one that holds only a level for taking a profit').toEqual({book: onlyLevel, writeFile: true, writeBrowser: false});
    const older = at('2026-11-20T10:00:00.000Z', held);
    expect(reconcile(at('2026-11-21T10:00:00.000Z', onlyShare), older).book).withContext('newer than the file: it stands').toEqual(at('2026-11-21T10:00:00.000Z', onlyShare));
  });

  it('takes the file when this browser has nothing (a new browser, or cleared site data)', () => {
    const file = at('2026-11-20T10:00:00.000Z', held);
    expect(reconcile(emptyBook(), file)).toEqual({book: file, writeFile: false, writeBrowser: true});
  });

  it('takes the file when it was saved later than the browser copy', () => {
    const local = at('2026-11-20T10:00:00.000Z', held), file = at('2026-11-21T10:00:00.000Z', other);
    expect(reconcile(local, file)).toEqual({book: file, writeFile: false, writeBrowser: true});
  });

  it('keeps the browser copy and updates the file when the browser copy is the later one', () => {
    const local = at('2026-11-21T10:00:00.000Z', held), file = at('2026-11-20T10:00:00.000Z', other);
    expect(reconcile(local, file)).toEqual({book: local, writeFile: true, writeBrowser: false});
  });

  it('never lets an empty file wipe positions held in the browser, whatever the dates say', () => {
    const local = at('2026-11-20T10:00:00.000Z', held), file = at('2026-11-21T10:00:00.000Z', emptyBook());
    expect(reconcile(local, file)).toEqual({book: local, writeFile: true, writeBrowser: false});
  });

  it('treats a browser copy without a save time as the older one', () => {
    const file = at('2026-11-21T10:00:00.000Z', other);
    expect(reconcile(held, file).book).toEqual(file);
  });

  it('writes nothing over a file that could not be read: only a change made by the user replaces it', () => {
    expect(reconcile(held, undefined, true)).toEqual({book: held, writeFile: false, writeBrowser: false});
  });

  it('writes nothing when both copies carry the same save time', () => {
    const copy = at('2026-11-21T10:00:00.000Z', held);
    expect(reconcile(copy, {...copy})).toEqual({book: copy, writeFile: false, writeBrowser: false});
  });
});

describe('saving and loading the book in the browser', () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const data: Record<string, string> = {...initial};
    return {getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; }};
  }

  it('reads back what was saved', () => {
    const storage = memoryStorage();
    const book = addPortfolio(bookOf('Brokerage', NVDA), 'Fidelity');
    saveBook(book, storage);
    expect(loadBook(storage)).toEqual(book);
  });

  it('starts with an empty book when nothing or something damaged is stored', () => {
    expect(loadBook(memoryStorage())).toEqual(emptyBook());
    expect(loadBook(memoryStorage({'watchlist.portfolios.v2': '{"v":2,"portfolios":'}))).toEqual(emptyBook());
  });

  it('carries over the single portfolio saved before portfolios had names', () => {
    const storage = memoryStorage({'watchlist.portfolio.v1': JSON.stringify({v: 1, lossBudgetPercent: 1, positions: {NVDA}})});
    const book = loadBook(storage);
    expect(names(book)).toEqual(['Portfolio']);
    expect(activeOf(book).lossBudgetPercent).toBe(1);
    expect(activeOf(book).positions).toEqual({NVDA});
  });
});
