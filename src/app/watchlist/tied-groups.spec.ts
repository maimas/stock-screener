import {makeStock} from "./testing/fixtures";
import {byGroup, groupBrief, groupBySymbol, groupsAmong, groupTip, tickedTogether, tiedGroups} from "./tied-groups";

// The owner, of the sentence "owning all 9 is nearer to one big bet than to 9 separate ones": "this is good info
// but I can't leverage it since I don't know what stocks move together - maybe we can add something to show the
// tied group".
describe('tiedGroups (which of the stocks moved together over the past year)', () => {
  /** 80 daily closes from a repeating cycle of daily returns: two stocks from one cycle move exactly together. */
  function closes(cycle: number[], start = 100): number[] {
    const out = [start];
    for (let i = 0; i < 79; i++) {
      out.push(out[out.length - 1] * (1 + cycle[i % cycle.length]));
    }
    return out;
  }

  // Three patterns of daily returns that have nothing to do with one another (their correlations are near zero).
  const TECH = [0.01, -0.02, 0.03, 0, -0.01, 0.02, -0.03];
  const POWER = [0.02, 0.02, -0.01, -0.03, 0.01, 0, -0.01, 0.03, -0.02, -0.01, 0];
  const LONER = [-0.01, 0.03, 0.01, -0.02, 0, 0.02, -0.03, 0.01, 0.01, -0.02, 0.02, -0.01, 0];
  const stock = (symbol: string, cycle: number[], sector: string, start = 100) => makeStock({symbol, sector, closes: closes(cycle, start)});

  const STOCKS = [
    stock('ZED', POWER, 'Utilities'), stock('ACME', TECH, 'Technology'), stock('BOLT', TECH, 'Technology', 40),
    stock('YARN', POWER, 'Utilities', 12), stock('CHIP', TECH, 'Industrials', 7), stock('SOLO', LONER, 'Energy'),
  ];

  it('puts the stocks that moved closely together into one group, the largest first, and names them A, B', () => {
    const tied = tiedGroups(STOCKS);
    expect(tied.groups.map(group => [group.letter, group.symbols])).toEqual([['A', ['ACME', 'BOLT', 'CHIP']], ['B', ['YARN', 'ZED']]]);
    expect(tied.groups.map(group => group.index)).toEqual([0, 1]);
    expect(tied.groups[0].level).toBeCloseTo(1, 6);
  });

  it('leaves a stock that moved closely with none of the others on its own', () => {
    expect(tiedGroups(STOCKS).alone).toEqual(['SOLO']);
  });

  it('says of a group which sector its stocks share: all of them, most of them, or nothing', () => {
    const [a, b] = tiedGroups(STOCKS).groups;
    expect(a.sector).withContext('two of three').toBe('mostly Technology');
    expect(b.sector).toBe('all Utilities');
    expect(groupBrief(a)).toBe('3 stocks, mostly Technology');
    const mixed = tiedGroups([stock('ACME', TECH, 'Technology'), stock('BOLT', TECH, 'Energy'), stock('CHIP', TECH, 'Utilities')]);
    expect(groupBrief(mixed.groups[0])).toBe('3 stocks');
  });

  it('does not make a group of a chain: every stock of a group moved closely with the rest of it on average', () => {
    // MID moves with both ends (it is their sum); the two ends have nothing to do with each other.
    const both = TECH.map((r, i) => r + POWER[i % POWER.length]);
    const chain = tiedGroups([stock('END1', TECH, 'Technology'), stock('MID', both, 'Technology'), stock('END2', POWER, 'Utilities')]);
    expect(chain.groups.length).toBe(1);
    expect(chain.groups[0].symbols.length).withContext('one end stays out').toBe(2);
    expect(chain.alone.length).toBe(1);
  });

  it('sets aside a stock with too little price history to compare', () => {
    const young = makeStock({symbol: 'NEW', sector: 'Technology', closes: closes(TECH).slice(0, 20)});
    const tied = tiedGroups([...STOCKS, young]);
    expect(tied.unknown).toEqual(['NEW']);
    expect(tied.groups[0].symbols).not.toContain('NEW');
  });

  it('has nothing to say of fewer than two stocks, or of stocks without prices', () => {
    expect(tiedGroups([])).toEqual({groups: [], alone: [], unknown: []});
    expect(tiedGroups([makeStock({symbol: 'ACME'})])).toEqual({groups: [], alone: [], unknown: ['ACME']});
  });

  it('says of the stocks a reader ticked which are in one group, or that none moved with another', () => {
    const tied = tiedGroups(STOCKS);
    expect(tickedTogether(['ACME', 'BOLT'], tied)).toBe('ACME and BOLT are both in group A: over the past year they moved closely together.');
    expect(tickedTogether(['ACME', 'BOLT', 'CHIP', 'SOLO'], tied)).toBe('ACME, BOLT and CHIP are all in group A: over the past year they moved closely together.');
    expect(tickedTogether(['ACME', 'BOLT', 'YARN', 'ZED'], tied)).toBe(
      'ACME and BOLT are both in group A; YARN and ZED are both in group B: over the past year they moved closely together.');
    expect(tickedTogether(['ACME', 'ZED', 'SOLO'], tied)).toBe('None of the 3 you ticked moved closely with another of them over the past year.');
    expect(tickedTogether(['ACME'], tied)).withContext('one stock has no other to move with').toBe('');
    expect(tickedTogether(['ACME', 'BOLT'], {groups: [], alone: ['ACME', 'BOLT'], unknown: []})).withContext('no groups on the page').toBe('');
  });

  // The owner: "add the group everywhere so that I can see". One grouping for the page; each table shows its own
  // stocks of a group under the same letter.
  it('gives a table its own stocks of each group, under the same letter, and says how many the group has in all', () => {
    const page = tiedGroups(STOCKS);
    const table = groupsAmong(page, ['BOLT', 'ZED', 'SOLO']);
    expect(table.groups.map(group => [group.letter, group.index, group.symbols])).toEqual([['A', 0, ['BOLT']], ['B', 1, ['ZED']]]);
    expect(table.alone).toEqual(['SOLO']);
    expect(groupBrief(table.groups[0])).toBe("1 of the group's 3 stocks: with ACME and CHIP, mostly Technology");
    // A letter that stands alone in a table is explained with the stocks it moves with, wherever they are on the page.
    expect(groupTip('BOLT', table)).toContain('it moved closely with ACME and CHIP (');
    expect(groupTip('ZED', table)).toContain('it moved closely with YARN (');
    expect(groupsAmong(page, ['SOLO']).groups).toEqual([]);
  });

  // The owner: "group should be sortable column everywhere".
  it('orders rows by their group: A first, the stocks in no group last, A to Z inside a group; or the other way round', () => {
    const tied = tiedGroups(STOCKS), rows = ['ZED', 'SOLO', 'CHIP', 'ACME', 'YARN', 'BOLT'];
    expect(byGroup(rows, it => it, tied)).toEqual(['ACME', 'BOLT', 'CHIP', 'YARN', 'ZED', 'SOLO']);
    expect(byGroup(rows, it => it, tied, 'desc')).toEqual(['SOLO', 'YARN', 'ZED', 'ACME', 'BOLT', 'CHIP']);
    expect(rows[0]).withContext('the rows given are left as they were').toBe('ZED');
  });

  it('finds the group of a stock, and says in words with which stocks it moved', () => {
    const tied = tiedGroups(STOCKS);
    expect(groupBySymbol(tied).get('BOLT')?.letter).toBe('A');
    expect(groupBySymbol(tied).get('SOLO')).toBeUndefined();
    expect(groupTip('BOLT', tied)).toBe(
      'Group A: over the past year it moved closely with ACME and CHIP (1.00 on average in this group, where 0 is not at all and 1 is exactly together).');
    expect(groupTip('ZED', tied)).toContain('it moved closely with YARN (');
    expect(groupTip('SOLO', tied)).toBe('Over the past year it moved closely with none of the others.');
    expect(groupTip('NEW', tiedGroups([...STOCKS, makeStock({symbol: 'NEW'})]))).toBe('Too little price history to compare it with the others.');
  });
});
