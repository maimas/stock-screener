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

// --- Several columns ---------------------------------------------------------------------------------------
// The owner: "I need tables to support sorting by multiple coluns". A plain click on a heading orders by that
// column alone, as before. A click with the Shift key held adds the column as the next key: rows that are level in
// the first column follow the second, and so on. The keyboard does the same (Shift with Enter on the heading).

/** One line for a sortable heading's tooltip: how a column is added to the order. Said the same in every table. */
export const ALSO_ORDER_TIP = 'Shift+click adds this column to the order.';

/**
 * The order after a click on a heading, as a list of keys, the first deciding first.
 *
 * @param add the Shift key was held: the column is added as the next key, or turned round in its place when it
 *            is one already. Without it the column orders the rows alone (a second click turns it round).
 */
export function ordersAfterClick<C extends string>(current: readonly RowOrder<C>[], column: C, fromTheTop: boolean, add: boolean): RowOrder<C>[] {
  if (!add) {
    return [orderAfterClick(current[0]?.column === column ? current[0] : undefined, column, fromTheTop)];
  }
  if (!current.some(it => it.column === column)) {
    return [...current, orderAfterClick(undefined, column, fromTheTop)];
  }
  return current.map(it => it.column === column ? orderAfterClick(it, column, fromTheTop) : it);
}

/** One key of an order by several columns: what a row shows in that column, and which way the column goes. */
export type OrderKey<T> = { keyOf: (row: T) => number | string | undefined, direction: 'asc' | 'desc' };

/**
 * The rows in the order of several columns: the first key decides, rows level in it follow the next, and rows
 * level in every key come A to Z by their name. In each key a row with nothing in that column comes last,
 * whichever way the key goes (as in `inOrder`). The rows given are left as they were.
 */
export function inOrders<T>(rows: readonly T[], keys: readonly OrderKey<T>[], nameOf: (row: T) => string): T[] {
  return rows.map(row => ({row, shown: keys.map(key => key.keyOf(row))})).sort((a, b) => {
    for (let at = 0; at < keys.length; at++) {
      const x = a.shown[at], y = b.shown[at];
      if (x === undefined || y === undefined) {
        if (x !== y) {
          return x === undefined ? 1 : -1;
        }
      } else if (x !== y) {
        const turn = keys[at].direction === 'asc' ? 1 : -1;
        return turn * (typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y));
      }
    }
    return nameOf(a.row).localeCompare(nameOf(b.row));
  }).map(it => it.row);
}

/**
 * The small number a heading shows beside its arrow: 1 for the first key, 2 for the next. Nothing for a column the
 * rows do not follow, and nothing while they follow one column only (the arrow says it all then).
 */
export function placeIn<C extends string>(orders: readonly RowOrder<C>[], column: C): number | undefined {
  const at = orders.findIndex(it => it.column === column);
  return at < 0 || orders.length < 2 ? undefined : at + 1;
}

/** Which way a column goes in the order, or nothing when the rows do not follow it. */
export function directionIn<C extends string>(orders: readonly RowOrder<C>[], column: C): 'asc' | 'desc' | undefined {
  return orders.find(it => it.column === column)?.direction;
}

/**
 * What a heading tells a screen reader: the way of the first key. A table says of one heading that its rows are
 * ordered by it; the further keys say their place in words (`orderWords`).
 */
export function ariaSortOf<C extends string>(orders: readonly RowOrder<C>[], column: C): 'ascending' | 'descending' | null {
  return ariaSort(orders[0], column);
}

/** For a screen reader, on the heading of a key after the first: its place and its way. Empty for any other heading. */
export function orderWords<C extends string>(orders: readonly RowOrder<C>[], column: C): string {
  const at = orders.findIndex(it => it.column === column);
  return at < 1 ? '' : `, order key ${at + 1}, ${orders[at].direction === 'asc' ? 'ascending' : 'descending'}`;
}
