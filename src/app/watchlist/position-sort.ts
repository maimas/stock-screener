import {money} from "./format";
import {StepKind} from "./plan";
import {PositionRow} from "./portfolio-view";

/**
 * The order of the rows in "What you own". The table starts with the biggest holding first, since how much of the
 * portfolio sits in one stock is the first thing to see; a click on a column heading orders the rows by that
 * column, and a second click turns it around.
 *
 * It only orders what the table already shows: nothing here ranks stocks against each other as things to buy.
 * And it goes by the numbers as the cells show them: two holdings a few cents apart both read "$640", so they count
 * as level and go A to Z, rather than in an order the reader cannot see a reason for.
 */

/** The columns of the table that the rows can be ordered by, in the order they stand in. */
export type SortColumn = 'symbol' | 'plan' | 'value' | 'weight' | 'result' | 'market' | 'bad' | 'good' | 'held' | 'shares' | 'paid' | 'now' | 'bought';
export type RowSort = { column: SortColumn, direction: 'asc' | 'desc' };

/** Until a column is clicked: the biggest share of the portfolio first. */
export const DEFAULT_SORT: RowSort = {column: 'weight', direction: 'desc'};

/** The plan card's own order for what it says about a holding: what asks for something comes first. */
const PLAN_ORDER: StepKind[] = ['missing', 'trim', 'review', 'hold', 'outside'];

/** The columns read from the top on a first click (A to Z; the plan's order). Every other one starts with its biggest. */
const FROM_THE_TOP = new Set<SortColumn>(['symbol', 'plan']);

/** What the plan says about each stock, by symbol: only the kind of step matters here. */
type Plans = ReadonlyMap<string, { kind: StepKind }>;

/**
 * The rows in the order asked for, as a new list. A stock with a dash in that column stays at the bottom
 * whichever way the column is sorted, and stocks that are level there go A to Z.
 *
 * @param plans what the plan says about each stock; without it the "Plan" column has nothing to go by
 */
export function sortedRows(rows: PositionRow[], sort: RowSort = DEFAULT_SORT, plans?: Plans): PositionRow[] {
  const turn = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map(row => ({row, key: keyOf(row, sort.column, plans)}))
    .sort((a, b) => {
      if (a.key === undefined || b.key === undefined) {
        if (a.key !== b.key) {
          return a.key === undefined ? 1 : -1;
        }
      } else if (a.key !== b.key) {
        return turn * (typeof a.key === 'string' ? a.key.localeCompare(String(b.key)) : a.key - Number(b.key));
      }
      return a.row.symbol.localeCompare(b.row.symbol);
    })
    .map(it => it.row);
}

/**
 * The order after a click on a column heading: the same column turns around; another column starts with its
 * biggest (or latest) at the top, except the symbol and the plan, which read from the top.
 */
export function nextSort(current: RowSort, column: SortColumn): RowSort {
  if (current.column === column) {
    return {column, direction: current.direction === 'asc' ? 'desc' : 'asc'};
  }
  return {column, direction: FROM_THE_TOP.has(column) ? 'asc' : 'desc'};
}

/** What a row is ordered by in a column, as its cell shows it: undefined where the cell is a dash. */
function keyOf(row: PositionRow, column: SortColumn, plans?: Plans): number | string | undefined {
  const view = row.view;
  switch (column) {
    case 'symbol':
      return row.symbol;
    case 'plan': {
      const kind = plans?.get(row.symbol)?.kind;
      const place = kind === undefined ? -1 : PLAN_ORDER.indexOf(kind);
      return place < 0 ? undefined : place;
    }
    case 'value':
      return dollars(view.value);
    case 'weight':
      return rounded(view.weightPercent, 1);
    case 'result':
      return dollars(view.gain);
    case 'market':
      return rounded(view.indexPercent, 1);
    // The size of the loss, so that "biggest first" is the stock that could lose most.
    case 'bad':
      return row.cases ? dollars(row.risk?.loss) : undefined;
    case 'good':
      return row.cases ? dollars(row.risk?.gain) : undefined;
    // The cell counts weeks.
    case 'held':
      return view.daysHeld === undefined ? undefined : Math.floor(view.daysHeld / 7);
    case 'shares':
      return view.position.shares;
    case 'paid':
      return rounded(view.position.price, 2);
    case 'now':
      return rounded(view.price, 2);
    case 'bought':
      return view.position.day;
  }
}

/** An amount as `money` writes it: to the dollar, and to the cent under $100. Read back from its text, so the two cannot drift apart. */
function dollars(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.sign(value) * Number(money(value).replace(/[^0-9.]/g, ''));
}

/** A number to the decimals its cell shows. */
function rounded(value: number | undefined, decimals: number): number | undefined {
  return value === undefined ? undefined : Math.sign(value) * Number(Math.abs(value).toFixed(decimals));
}
