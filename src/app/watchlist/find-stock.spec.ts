import {alsoFits, Findable, findMatches, findSymbol, notFound} from "./find-stock";

// Thirty stocks in seven lists, each list sorted by itself: finding one meant reading down all of them.
describe('findSymbol (the stock a reader means by what they type above the lists)', () => {
  const stocks: Findable[] = [
    {symbol: 'ZED', name: 'Zed Energy Corp'},
    {symbol: 'ACME', name: 'Acme Tools Inc'},
    {symbol: 'AC', name: 'Alder Cement plc'},
    {symbol: 'TOOL', name: 'Toolmakers United'},
  ];

  it('finds a stock by its symbol, however it is typed', () => {
    expect(findSymbol('ZED', stocks)).toBe('ZED');
    expect(findSymbol('  zed ', stocks)).toBe('ZED');
  });

  it('takes the symbol itself before a longer one that begins with it', () => {
    expect(findSymbol('ac', stocks)).toBe('AC');
    expect(findSymbol('acm', stocks)).toBe('ACME');
  });

  it('takes a symbol before a name: "tool" is the stock TOOL, not the company with "Tools" in its name', () => {
    expect(findSymbol('tool', stocks)).toBe('TOOL');
  });

  it('finds a stock by the beginning of its company\'s name, then by a part of it', () => {
    expect(findSymbol('alder', stocks)).toBe('AC');
    expect(findSymbol('energy', stocks)).toBe('ZED');
  });

  it('takes the first from A to Z among several that fit equally', () => {
    expect(findSymbol('a', stocks)).toBe('AC');
  });

  // A word in two companies' names opened the first of them and said nothing of the other.
  it('names every stock that fits equally well, so that the page can say which others there were', () => {
    expect(findMatches('a', stocks)).toEqual(['AC', 'ACME']);
    expect(findMatches('ac', stocks)).withContext('the symbol itself fits best, alone').toEqual(['AC']);
    expect(findMatches('tool', stocks)).toEqual(['TOOL']);
    expect(findMatches('e', stocks)).withContext('no symbol or name begins with it: every name that holds it')
      .toEqual(['AC', 'ACME', 'TOOL', 'ZED']);
    expect(alsoFits(' a ', ['ACME'])).toBe('"a" also fits ACME.');
    expect(alsoFits('e', ['B', 'C', 'D', 'E', 'F', 'G'])).toBe('"e" also fits B, C, D, E and 2 more.');
    expect(alsoFits('ac', [])).toBe('');
  });

  it('finds nothing for nothing typed, or for what no stock in the lists fits, and says so in words', () => {
    expect(findSymbol('   ', stocks)).toBeUndefined();
    expect(findSymbol('nope', stocks)).toBeUndefined();
    expect(notFound(' nope ')).withContext('with the next step').toBe('"nope" is not in your lists. "Edit list" on a list adds a stock.');
  });
});
