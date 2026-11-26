import {ariaSort, inOrder, numberIn, orderAfterClick} from "./row-order";

// The owner: "all tables must have sortable columns".
describe('row-order (the rows of a table in the order of one of its columns)', () => {
  type Row = { name: string, drop?: string };
  const ROWS: Row[] = [{name: 'ZED', drop: '−17%'}, {name: 'ACME', drop: '−42%'}, {name: 'NONE'}, {name: 'BOLT', drop: '−17%'}];
  const drop = (row: Row) => numberIn(row.drop);
  const names = (rows: Row[]) => rows.map(row => row.name);

  it('starts another column with its biggest at the top, a name with A at the top, and turns the same column round', () => {
    expect(orderAfterClick(undefined, 'dropped', false)).toEqual({column: 'dropped', direction: 'desc'});
    expect(orderAfterClick(undefined, 'stock', true)).toEqual({column: 'stock', direction: 'asc'});
    expect(orderAfterClick({column: 'dropped', direction: 'desc'}, 'dropped', false)).toEqual({column: 'dropped', direction: 'asc'});
    expect(orderAfterClick({column: 'dropped', direction: 'asc'}, 'stock', true)).toEqual({column: 'stock', direction: 'asc'});
  });

  it('orders the rows by what the column shows, rows that show the same A to Z, and a row with nothing last both ways', () => {
    expect(names(inOrder(ROWS, drop, 'asc', row => row.name))).toEqual(['ACME', 'BOLT', 'ZED', 'NONE']);
    expect(names(inOrder(ROWS, drop, 'desc', row => row.name))).toEqual(['BOLT', 'ZED', 'ACME', 'NONE']);
    expect(names(inOrder(ROWS, row => row.name, 'desc', row => row.name))).toEqual(['ZED', 'NONE', 'BOLT', 'ACME']);
    expect(ROWS[0].name).withContext('the rows given are left as they were').toBe('ZED');
  });

  it('reads the number a cell shows, with the true minus sign, a dollar sign and thousands', () => {
    expect(numberIn('−42%')).toBe(-42);
    expect(numberIn('+$1,711')).toBe(1711);
    expect(numberIn('−$825')).toBe(-825);
    expect(numberIn('profit +21%')).toBe(21);
    expect(numberIn('20.1% $2,013')).toBe(20.1);
    expect(numberIn('add 4.0%')).toBe(4);
    expect(numberIn('—')).toBeUndefined();
    expect(numberIn('')).toBeUndefined();
    expect(numberIn(undefined)).toBeUndefined();
  });

  it('tells a screen reader which way a heading orders the rows', () => {
    expect(ariaSort({column: 'dropped', direction: 'desc'}, 'dropped')).toBe('descending');
    expect(ariaSort({column: 'dropped', direction: 'asc'}, 'dropped')).toBe('ascending');
    expect(ariaSort({column: 'dropped', direction: 'asc'}, 'stock')).toBeNull();
    expect(ariaSort(undefined, 'stock')).toBeNull();
  });
});
