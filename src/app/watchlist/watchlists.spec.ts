import {
  addList, allSymbols, defaultBook, listsWith, loadWatchlists, moveList, parseWatchlists, reconcileLists, removeList,
  renameList, saveWatchlists, stampedLists, symbolProblem, WatchlistBook, withoutSymbol, withSymbol
} from "./watchlists";

/** Two lists: CHIPS (NVDA, AMD) and FUNDS (SMH). */
function book(): WatchlistBook {
  return {v: 1, lists: [{id: 'l1', title: 'CHIPS', symbols: ['NVDA', 'AMD']}, {id: 'l2', title: 'FUNDS', symbols: ['SMH']}]};
}

const titles = (it: WatchlistBook) => it.lists.map(list => list.title);
const symbolsOf = (it: WatchlistBook, id: string) => it.lists.find(list => list.id === id)!.symbols;

describe('defaultBook (the lists the page starts with)', () => {
  it('has lists with names, stocks and ids of their own', () => {
    const lists = defaultBook().lists;
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every(list => !!list.title && list.symbols.length > 0)).toBe(true);
    expect(new Set(lists.map(list => list.id)).size).toBe(lists.length);
  });

  it('gives a fresh copy each time, so editing one does not change the starting lists', () => {
    defaultBook().lists[0].symbols.push('ZZZZ');
    expect(defaultBook().lists[0].symbols).not.toContain('ZZZZ');
  });
});

describe('symbolProblem', () => {
  it('accepts a ticker symbol, whatever its case and with spaces around it', () => {
    ['NVDA', 'cohr', ' amd ', 'BRK.B', 'BF-B', 'A'].forEach(text => expect(symbolProblem(text)).withContext(text).toBeUndefined());
  });

  it('asks for a symbol when nothing was typed', () => {
    expect(symbolProblem('  ')).toMatch(/symbol/i);
  });

  it('rejects text that cannot be a symbol', () => {
    ['NV DA', 'NV$', 'ALONGSYMBOL1', '.A'].forEach(text => expect(symbolProblem(text)).withContext(text).toMatch(/symbol/i));
  });
});

describe('withSymbol', () => {
  it('adds the symbol to the end of that list only, in capitals', () => {
    const after = withSymbol(book(), 'l1', ' cohr ');
    expect(symbolsOf(after, 'l1')).toEqual(['NVDA', 'AMD', 'COHR']);
    expect(symbolsOf(after, 'l2')).toEqual(['SMH']);
  });

  it('does not change the book it was given', () => {
    const before = book();
    withSymbol(before, 'l1', 'COHR');
    expect(symbolsOf(before, 'l1')).toEqual(['NVDA', 'AMD']);
  });

  it('adds nothing when the symbol is already in that list', () => {
    expect(symbolsOf(withSymbol(book(), 'l1', 'nvda'), 'l1')).toEqual(['NVDA', 'AMD']);
  });

  it('lets the same stock be in two lists', () => {
    expect(symbolsOf(withSymbol(book(), 'l2', 'NVDA'), 'l2')).toEqual(['SMH', 'NVDA']);
  });

  it('adds nothing for text that is not a symbol, or a list that does not exist', () => {
    expect(withSymbol(book(), 'l1', 'NV DA')).toEqual(book());
    expect(withSymbol(book(), 'nope', 'COHR')).toEqual(book());
  });
});

describe('withoutSymbol', () => {
  it('removes the symbol from that list only', () => {
    const both = withSymbol(book(), 'l2', 'NVDA');
    const after = withoutSymbol(both, 'l1', 'NVDA');
    expect(symbolsOf(after, 'l1')).toEqual(['AMD']);
    expect(symbolsOf(after, 'l2')).toEqual(['SMH', 'NVDA']);
  });

  it('may leave a list empty', () => {
    expect(symbolsOf(withoutSymbol(book(), 'l2', 'SMH'), 'l2')).toEqual([]);
  });
});

describe('addList', () => {
  // First, so that it stands right under the button that made it, at the top of the lists.
  it('adds an empty list first under the given name', () => {
    const after = addList(book(), '  POWER ');
    expect(titles(after)).toEqual(['POWER', 'CHIPS', 'FUNDS']);
    expect(after.lists[0].symbols).toEqual([]);
  });

  it('gives every list its own id, also after one was removed', () => {
    let lists = addList(addList(book(), 'A'), 'B');
    lists = addList(removeList(lists, lists.lists[2].id), 'C');
    const ids = lists.lists.map(list => list.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adds nothing for a blank name', () => {
    expect(titles(addList(book(), '   '))).toEqual(['CHIPS', 'FUNDS']);
  });
});

describe('renameList', () => {
  it('changes the name and nothing else', () => {
    const after = renameList(book(), 'l1', ' AI CHIPS ');
    expect(titles(after)).toEqual(['AI CHIPS', 'FUNDS']);
    expect(symbolsOf(after, 'l1')).toEqual(['NVDA', 'AMD']);
  });

  it('keeps the old name when the new one is blank', () => {
    expect(titles(renameList(book(), 'l1', ' '))).toEqual(['CHIPS', 'FUNDS']);
  });
});

describe('removeList', () => {
  it('removes that list', () => {
    expect(titles(removeList(book(), 'l1'))).toEqual(['FUNDS']);
  });

  it('may leave no list at all', () => {
    expect(removeList(removeList(book(), 'l1'), 'l2').lists).toEqual([]);
  });
});

describe('moveList', () => {
  const three = addList(book(), 'POWER');

  it('moves a list one place up or down', () => {
    expect(titles(moveList(three, 'l1', -1))).toEqual(['CHIPS', 'POWER', 'FUNDS']);
    expect(titles(moveList(three, 'l1', 1))).toEqual(['POWER', 'FUNDS', 'CHIPS']);
  });

  it('leaves the first list first and the last list last', () => {
    expect(titles(moveList(three, three.lists[0].id, -1))).toEqual(['POWER', 'CHIPS', 'FUNDS']);
    expect(titles(moveList(three, 'l2', 1))).toEqual(['POWER', 'CHIPS', 'FUNDS']);
  });
});

describe('allSymbols and listsWith', () => {
  const both = withSymbol(book(), 'l2', 'NVDA');

  it('lists every symbol once, in the order of the lists', () => {
    expect(allSymbols(both)).toEqual(['NVDA', 'AMD', 'SMH']);
  });

  it('says which lists a stock is in', () => {
    expect(listsWith(both, 'NVDA').map(list => list.title)).toEqual(['CHIPS', 'FUNDS']);
    expect(listsWith(both, 'COHR')).toEqual([]);
  });
});

describe('parseWatchlists (reading the saved file)', () => {
  const saved = stampedLists(book(), new Date('2026-11-21T10:00:00Z'));

  it('reads back lists written by this app', () => {
    expect(saved.savedAt).toBe('2026-11-21T10:00:00.000Z');
    expect(parseWatchlists(JSON.stringify(saved))).toEqual(saved);
  });

  it('accepts a book with no lists: every list was deleted', () => {
    expect(parseWatchlists('{"v":1,"lists":[]}')).toEqual({v: 1, lists: []});
  });

  it('tidies a file edited by hand: capitals, no repeats within a list, unknown fields dropped', () => {
    const text = JSON.stringify({v: 1, note: 'mine', lists: [{id: 'l1', title: ' CHIPS ', color: 'red', symbols: ['nvda', 'AMD', 'NVDA']}]});
    expect(parseWatchlists(text)).toEqual({v: 1, lists: [{id: 'l1', title: 'CHIPS', symbols: ['NVDA', 'AMD']}]});
  });

  it('rejects text that is not JSON, or not a book of lists', () => {
    ['', 'not json', '[]', '{"v":2,"lists":[]}', '{"v":1}', '{"v":1,"lists":{}}'].forEach(text =>
      expect(parseWatchlists(text)).withContext(text).toBeUndefined());
  });

  it('rejects a book with a broken list rather than reading part of it', () => {
    const withList = (list: unknown) => JSON.stringify({v: 1, lists: [list]});
    const sound = {id: 'l1', title: 'CHIPS', symbols: ['NVDA']};
    expect(parseWatchlists(withList(sound))).withContext('sound').toBeDefined();
    expect(parseWatchlists(withList({...sound, id: ''}))).withContext('no id').toBeUndefined();
    expect(parseWatchlists(withList({...sound, title: ' '}))).withContext('blank name').toBeUndefined();
    expect(parseWatchlists(withList({...sound, symbols: 'NVDA'}))).withContext('symbols not a list').toBeUndefined();
    expect(parseWatchlists(withList({...sound, symbols: ['NV DA']}))).withContext('not a symbol').toBeUndefined();
  });

  it('rejects two lists with the same id', () => {
    expect(parseWatchlists(JSON.stringify({v: 1, lists: [{id: 'l1', title: 'A', symbols: []}, {id: 'l1', title: 'B', symbols: []}]}))).toBeUndefined();
  });
});

describe('reconcileLists (the lists in this browser against the lists in the database)', () => {
  const at = (iso: string, lists: WatchlistBook): WatchlistBook => ({...lists, savedAt: iso});
  const mine = at('2026-11-21T10:00:00.000Z', book());
  const other = at('2026-11-21T10:00:00.000Z', addList(book(), 'POWER'));

  it('has nothing to use, and writes nothing, when no lists were ever saved: the page shows the starting lists', () => {
    expect(reconcileLists(undefined, undefined)).toEqual({book: undefined, writeFile: false, writeBrowser: false});
  });

  it('moves the lists kept in the browser into the file when there is no file yet', () => {
    expect(reconcileLists(mine, undefined)).toEqual({book: mine, writeFile: true, writeBrowser: false});
  });

  it('takes the file when this browser has no lists of its own (a new browser, or cleared site data)', () => {
    expect(reconcileLists(undefined, other)).toEqual({book: other, writeFile: false, writeBrowser: true});
  });

  it('takes the file when it was saved later', () => {
    const file = at('2026-11-22T10:00:00.000Z', other);
    expect(reconcileLists(mine, file)).toEqual({book: file, writeFile: false, writeBrowser: true});
  });

  it('keeps the lists in the browser and updates the file when they are the later ones', () => {
    const file = at('2026-11-20T10:00:00.000Z', other);
    expect(reconcileLists(mine, file)).toEqual({book: mine, writeFile: true, writeBrowser: false});
  });

  it('writes nothing when both carry the same save time', () => {
    expect(reconcileLists(mine, {...mine})).toEqual({book: mine, writeFile: false, writeBrowser: false});
  });

  it('writes nothing over a file that could not be read', () => {
    expect(reconcileLists(mine, undefined, true)).toEqual({book: mine, writeFile: false, writeBrowser: false});
  });
});

describe('saving and loading the lists in the browser', () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const data: Record<string, string> = {...initial};
    return {getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; }};
  }

  it('reads back what was saved', () => {
    const storage = memoryStorage();
    saveWatchlists(book(), storage);
    expect(loadWatchlists(storage)).toEqual(book());
  });

  it('has nothing when nothing was saved, or what is stored cannot be read: the page then shows the starting lists', () => {
    expect(loadWatchlists(memoryStorage())).toBeUndefined();
    expect(loadWatchlists(memoryStorage({'watchlist.lists.v1': '{"v":1,"lists":'}))).toBeUndefined();
  });
});
