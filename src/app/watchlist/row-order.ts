/**
 * The order of a table's rows by one of its columns. The owner asked that every table of the page has columns its
 * rows can be ordered by ("all tables must have sortable columns"), the tables of the stocks marked DIP BUY among
 * them. Those tables still start A to Z and the page still ranks nothing by itself: an order is something the
 * reader asks for, by a click on a heading.
 */

/** Which column the rows follow, and which way. */
export type RowOrder<C extends string> = { column: C, direction: 'asc' | 'desc' };

/**
 * The order after a click on a heading: the same column turns round; another column starts with its biggest at
 * the top, or with A (the smallest) at the top when it is one that reads from the top, like a name.
 */
export function orderAfterClick<C extends string>(current: RowOrder<C> | undefined, column: C, fromTheTop: boolean): RowOrder<C> {
  if (current?.column === column) {
    return {column, direction: current.direction === 'asc' ? 'desc' : 'asc'};
  }
  return {column, direction: fromTheTop ? 'asc' : 'desc'};
}

/**
 * The rows in the order of what one column shows. A row with nothing in that column (a dash, an empty cell)
 * comes last whichever way the order goes, and rows that show the same come A to Z by their name. The rows given
 * are left as they were.
 */
export function inOrder<T>(rows: T[], keyOf: (row: T) => number | string | undefined, direction: 'asc' | 'desc',
                           nameOf: (row: T) => string): T[] {
  const turn = direction === 'asc' ? 1 : -1;
  return rows.map(row => ({row, key: keyOf(row)})).sort((a, b) => {
    if (a.key === undefined || b.key === undefined) {
      if (a.key !== b.key) {
        return a.key === undefined ? 1 : -1;
      }
    } else if (a.key !== b.key) {
      return turn * (typeof a.key === 'string' ? a.key.localeCompare(String(b.key)) : a.key - Number(b.key));
    }
    return nameOf(a.row).localeCompare(nameOf(b.row));
  }).map(it => it.row);
}

/**
 * The number a cell shows, to order rows by it: "−42%" is -42, "+$1,711" is 1711, "profit +21%" is 21,
 * "20.1% $2,013" is 20.1 (the first number in it). Undefined for a dash, an empty cell or a cell of words.
 */
export function numberIn(text: string | undefined): number | undefined {
  const found = /[-+−]?\s*\$?\s*\d[\d,]*(?:\.\d+)?/.exec(text ?? '');
  if (!found) {
    return undefined;
  }
  const value = Number(found[0].replace('−', '-').replace(/[\s$,+]/g, ''));
  return Number.isFinite(value) ? value : undefined;
}

/** What a heading tells a screen reader: which way its column orders the rows, or nothing while they follow another. */
export function ariaSort<C extends string>(order: RowOrder<C> | undefined, column: C): 'ascending' | 'descending' | null {
  return order?.column !== column ? null : order.direction === 'asc' ? 'ascending' : 'descending';
}
