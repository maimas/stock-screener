import {Stock} from "../api/microsoft-money.service";
import {LINKED_CORRELATION, pairCorrelation} from "./concentration";

/**
 * Which of a set of stocks have moved together: the stocks marked DIP BUY are said to be "nearer to one big bet",
 * and the owner asked which of them are tied, so that the fact can be used ("I don't know what stocks move
 * together"). A group is a set of stocks whose prices moved closely together over the past year; a stock that
 * moved closely with none of the others stands on its own.
 *
 * A fact about the past year, not a tested signal: no stock is ranked or picked by it, and whether spreading a
 * purchase over groups lowers the risk was not tested.
 */

/** Stocks that moved closely together, under one letter. */
export type TiedGroup = {
  /** "A" for the largest group, "B" for the next. What a row shows, and what the list of groups starts with. */
  letter: string
  /** Its place among the groups, from 0: which of the group colours it wears. */
  index: number
  /** The stocks of the group, A to Z. */
  symbols: string[]
  /** The average of how closely each pair of them moved over the past year (0 = not at all, 1 = exactly together). */
  level: number
  /** "all Technology", "mostly Technology", or nothing when no sector has half of them. */
  sector: string
  /** How many stocks the group has on the whole page, when a table shows only some of them (see `groupsAmong`). */
  size?: number
  /** Every stock of the group on the page, when a table shows only some of them: the others are named by it. */
  all?: string[]
};

export type TiedGroups = {
  /** The groups, largest first; groups of one size by their first stock, A to Z. */
  groups: TiedGroup[]
  /** The stocks that moved closely with none of the others, A to Z. */
  alone: string[]
  /** The stocks with too little price history to compare, A to Z. */
  unknown: string[]
};

export const NO_GROUPS: TiedGroups = {groups: [], alone: [], unknown: []};

/** Over the list of groups. */
export const TIED_TITLE = 'Which of them move together';
/** Under it: what a group is, what it is not, and that nothing was tested. Its first sentence stands alone. */
export const TIED_NOTE = 'Stocks with the same letter moved closely together over the past year. ' +
  'Closely is 0.5 or more on average, where 0 is not at all and 1 is exactly together. ' +
  'In a sell-off, stocks of different groups can still fall together. ' +
  'A fact about the past, not a tested reason to pick: whether spreading a purchase over groups lowers the risk was not tested.';
/** What the heading of the column says where the pointer rests on it. */
export const GROUP_HELP = 'Stocks with the same letter moved closely together over the past year. ' +
  'A dash: it moved closely with none of the others. A fact about the past, not a tested reason to pick.';

/**
 * Puts the stocks into groups that moved closely together. Two groups are joined, the closest two first, while the
 * average of how closely their stocks moved with one another is at the mark the page uses everywhere for "closely"
 * (`LINKED_CORRELATION`). So every stock of a group moved closely with the rest of its group on average: a chain
 * of pairs (A with B, B with C, but A not with C) does not make one group by itself.
 */
export function tiedGroups(stocks: Stock[]): TiedGroups {
  const named = stocks.filter(stock => !!stock.quote?.symbol);
  const symbolOf = (index: number) => named[index].quote!.symbol as string;
  const pairs = named.map((a, i) => named.map((b, j) => i === j ? undefined : pairCorrelation(a, b)));
  const known = named.map((_, i) => pairs[i].some(value => value !== undefined));

  /** The average over the pairs between two sets that can be compared; undefined when none can. */
  const between = (a: number[], b: number[]): number | undefined => {
    let sum = 0, count = 0;
    for (const i of a) {
      for (const j of b) {
        const value = pairs[i][j];
        if (value !== undefined) {
          sum += value;
          count++;
        }
      }
    }
    return count ? sum / count : undefined;
  };

  let sets: number[][] = named.map((_, i) => [i]).filter(([i]) => known[i]);
  for (; ;) {
    let best: { x: number, y: number, level: number } | undefined;
    for (let x = 0; x < sets.length; x++) {
      for (let y = x + 1; y < sets.length; y++) {
        const level = between(sets[x], sets[y]);
        if (level !== undefined && level >= LINKED_CORRELATION && (!best || level > best.level)) {
          best = {x, y, level};
        }
      }
    }
    if (!best) {
      break;
    }
    const {x, y} = best;
    sets = [...sets.filter((_, at) => at !== x && at !== y), [...sets[x], ...sets[y]]];
  }

  const byName = (a: string, b: string) => a.localeCompare(b);
  const groups = sets.filter(set => set.length > 1)
    .map(set => ({set, symbols: set.map(symbolOf).sort(byName)}))
    .sort((a, b) => b.symbols.length - a.symbols.length || byName(a.symbols[0], b.symbols[0]))
    .map(({set, symbols}, index): TiedGroup => ({
      letter: letterOf(index), index, symbols, level: within(set, pairs), sector: sectorOf(set.map(i => named[i])),
    }));
  return {
    groups,
    alone: sets.filter(set => set.length === 1).map(([i]) => symbolOf(i)).sort(byName),
    unknown: named.map((_, i) => i).filter(i => !known[i]).map(symbolOf).sort(byName),
  };
}

/**
 * The groups as one table sees them: its own stocks of each group, under the group's letter and colour (so that a
 * letter means the same in every table of the page), and a group none of whose stocks it shows left out.
 */
export function groupsAmong(tied: TiedGroups, symbols: string[]): TiedGroups {
  const shown = new Set(symbols);
  return {
    groups: tied.groups.map(group => ({
      ...group, size: group.size ?? group.symbols.length, all: group.all ?? group.symbols, symbols: group.symbols.filter(it => shown.has(it)),
    }))
      .filter(group => group.symbols.length > 0),
    alone: tied.alone.filter(it => shown.has(it)),
    unknown: tied.unknown.filter(it => shown.has(it)),
  };
}

/**
 * Rows in the order of their groups: group A's first, then B's, the stocks in no group last (or the other way
 * round), and A to Z inside a group. The owner asked for "Group" to be a column the rows can be ordered by in
 * every table. It puts the stocks that move together side by side; it ranks nothing.
 */
export function byGroup<T>(rows: T[], symbolOf: (row: T) => string, tied: TiedGroups, direction: 'asc' | 'desc' = 'asc'): T[] {
  const groups = groupBySymbol(tied), turn = direction === 'asc' ? 1 : -1;
  const place = (row: T) => groups.get(symbolOf(row))?.index ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => turn * (place(a) - place(b)) || symbolOf(a).localeCompare(symbolOf(b)));
}

/** The group of each stock that is in one, by symbol. */
export function groupBySymbol(tied: TiedGroups): Map<string, TiedGroup> {
  return new Map(tied.groups.flatMap(group => group.symbols.map(symbol => [symbol, group] as const)));
}

/**
 * What a stock's cell says where the pointer rests on it: with which stocks it moved closely and how closely, or
 * that it moved with none, or that it cannot be compared.
 */
export function groupTip(symbol: string, tied: TiedGroups): string {
  const group = groupBySymbol(tied).get(symbol);
  if (group) {
    // With every other stock of its group on the page, also those this table does not show: a letter that stands
    // alone in a table used to be explained as moving "closely with" nothing.
    const others = (group.all ?? group.symbols).filter(it => it !== symbol);
    return `Group ${group.letter}: over the past year it moved closely with ${listed(others)} ` +
      `(${group.level.toFixed(2)} on average in this group, where 0 is not at all and 1 is exactly together).`;
  }
  return tied.unknown.includes(symbol) ? 'Too little price history to compare it with the others.'
    : 'Over the past year it moved closely with none of the others.';
}

/**
 * What the stocks a reader ticked have to do with one another, once two or more are ticked: which of them are in
 * one group ("ARM and TSM are both in group A: over the past year they moved closely together."), or that none of
 * them moved closely with another. Empty for fewer than two, and when no stock on the page is in a group. A fact
 * about the past year: it says nothing of which to pick.
 */
export function tickedTogether(ticked: string[], tied: TiedGroups): string {
  if (ticked.length < 2 || tied.groups.length === 0) {
    return '';
  }
  const shared = tied.groups.map(group => ({group, symbols: group.symbols.filter(symbol => ticked.includes(symbol))}))
    .filter(it => it.symbols.length > 1);
  if (shared.length === 0) {
    return `None of the ${ticked.length} you ticked moved closely with another of them over the past year.`;
  }
  const said = shared.map(({group, symbols}) =>
    `${listed(symbols)} are ${symbols.length === 2 ? 'both' : 'all'} in group ${group.letter}`);
  return `${said.join('; ')}: over the past year they moved closely together.`;
}

/** "3 stocks, all Technology", under a group's stocks in the list of groups. */
export function groupBrief(group: TiedGroup): string {
  const here = group.symbols.length, all = group.size ?? here;
  // In a table that shows only some of the group: how many it has on the whole page, and which the others are
  // (up to three by name), so that a letter never stands for stocks the reader cannot find.
  const others = (group.all ?? []).filter(it => !group.symbols.includes(it));
  const named = others.length === 0 ? '' : others.length <= 3 ? `: with ${listed(others)}` : `: with ${others.slice(0, 3).join(', ')} and ${others.length - 3} more`;
  const count = all > here ? `${here} of the group's ${all} stocks${named}` : `${here} ${here === 1 ? 'stock' : 'stocks'}`;
  return `${count}${group.sector ? `, ${group.sector}` : ''}`;
}

/** "ARM", "ARM and TSM", "ARM, AVGO and TSM". */
function listed(symbols: string[]): string {
  return symbols.length < 2 ? symbols.join('') : `${symbols.slice(0, -1).join(', ')} and ${symbols[symbols.length - 1]}`;
}

/** "A" to "Z", then "AA": more groups than letters do not happen on a page of stocks, and still get a name. */
function letterOf(index: number): string {
  const letter = String.fromCharCode(65 + index % 26);
  return index < 26 ? letter : letter + letter;
}

/** The average of how closely every pair inside a group moved, over the pairs that can be compared. */
function within(set: number[], pairs: (number | undefined)[][]): number {
  let sum = 0, count = 0;
  for (let a = 0; a < set.length; a++) {
    for (let b = a + 1; b < set.length; b++) {
      const value = pairs[set[a]][set[b]];
      if (value !== undefined) {
        sum += value;
        count++;
      }
    }
  }
  return count ? sum / count : 0;
}

/** "all Technology" when every stock of the group is in one sector, "mostly Technology" from half of them. */
function sectorOf(stocks: Stock[]): string {
  const counts = new Map<string, number>();
  for (const stock of stocks) {
    const sector = stock.equity?.company?.sector;
    if (sector) {
      counts.set(sector, (counts.get(sector) ?? 0) + 1);
    }
  }
  const [name, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ['', 0];
  return !name || count * 2 < stocks.length ? '' : count === stocks.length ? `all ${name}` : `mostly ${name}`;
}
