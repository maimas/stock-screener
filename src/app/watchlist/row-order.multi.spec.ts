import {ALSO_ORDER_TIP, ariaSortOf, inOrders, ordersAfterClick, placeIn, RowOrder} from "./row-order";

/**
 * A table's rows in the order of several columns. The owner: "I need tables to support sorting by multiple
 * coluns". A click on a heading orders by that column alone, as before; a click with the Shift key held adds the
 * column as the next key.
 */
describe('row order by several columns', () => {
  type Column = 'name' | 'group' | 'dropped' | 'swings';
  const FROM_THE_TOP = new Set<Column>(['name', 'group']);
  const click = (current: RowOrder<Column>[], column: Column, add = false) => ordersAfterClick(current, column, FROM_THE_TOP.has(column), add);

  describe('ordersAfterClick, a plain click', () => {
    it('orders by that column alone, from its biggest, or from the top for a name', () => {
      expect(click([], 'dropped')).toEqual([{column: 'dropped', direction: 'desc'}]);
      expect(click([], 'name')).toEqual([{column: 'name', direction: 'asc'}]);
    });

    it('turns the column round on a second click', () => {
      expect(click([{column: 'dropped', direction: 'desc'}], 'dropped')).toEqual([{column: 'dropped', direction: 'asc'}]);
    });

    it('drops the further keys: a plain click is always one column', () => {
      const two: RowOrder<Column>[] = [{column: 'group', direction: 'asc'}, {column: 'dropped', direction: 'desc'}];
      expect(click(two, 'group')).withContext('on the first key: turned round, alone').toEqual([{column: 'group', direction: 'desc'}]);
      expect(click(two, 'dropped')).withContext('on the second key: alone, as on a first click').toEqual([{column: 'dropped', direction: 'desc'}]);
      expect(click(two, 'swings')).withContext('on another column').toEqual([{column: 'swings', direction: 'desc'}]);
    });
  });

  describe('ordersAfterClick, a click with the Shift key held', () => {
    it('adds the column as the next key, at the direction a first click gives it', () => {
      const one: RowOrder<Column>[] = [{column: 'group', direction: 'asc'}];
      const two = click(one, 'dropped', true);
      expect(two).toEqual([{column: 'group', direction: 'asc'}, {column: 'dropped', direction: 'desc'}]);
      const three: RowOrder<Column>[] = [...two, {column: 'name', direction: 'asc'}];
      expect(click(two, 'name', true)).toEqual(three);
    });

    it('turns a column that is already a key round, and keeps its place', () => {
      const two: RowOrder<Column>[] = [{column: 'group', direction: 'asc'}, {column: 'dropped', direction: 'desc'}];
      expect(click(two, 'dropped', true)).toEqual([{column: 'group', direction: 'asc'}, {column: 'dropped', direction: 'asc'}]);
      expect(click(two, 'group', true)).toEqual([{column: 'group', direction: 'desc'}, {column: 'dropped', direction: 'desc'}]);
    });

    it('is a first click when the rows follow no column yet', () => {
      expect(click([], 'dropped', true)).toEqual([{column: 'dropped', direction: 'desc'}]);
    });

    it('leaves the order it was given as it was', () => {
      const one: RowOrder<Column>[] = [{column: 'group', direction: 'asc'}];
      click(one, 'dropped', true);
      click(one, 'group', true);
      expect(one).toEqual([{column: 'group', direction: 'asc'}]);
    });
  });

  describe('inOrders', () => {
    type Row = { name: string, group?: string, dropped?: number };
    const rows: Row[] = [
      {name: 'DDD', group: 'B', dropped: 40},
      {name: 'AAA', group: 'A', dropped: 20},
      {name: 'CCC', group: 'A', dropped: 55},
      {name: 'BBB', group: 'B', dropped: 40},
      {name: 'EEE', dropped: 70},
      {name: 'FFF', group: 'A'},
    ];
    const names = (list: Row[]) => list.map(it => it.name).join(' ');
    const nameOf = (row: Row) => row.name;
    const group = (direction: 'asc' | 'desc') => ({keyOf: (row: Row) => row.group, direction});
    const dropped = (direction: 'asc' | 'desc') => ({keyOf: (row: Row) => row.dropped, direction});

    it('orders by the first column, and rows level in it by the second', () => {
      expect(names(inOrders(rows, [group('asc'), dropped('desc')], nameOf))).toBe('CCC AAA FFF BBB DDD EEE');
    });

    it('turns each key its own way', () => {
      expect(names(inOrders(rows, [group('desc'), dropped('asc')], nameOf))).toBe('BBB DDD AAA CCC FFF EEE');
    });

    it('puts a row with nothing in a column last in that key, whichever way the key goes', () => {
      expect(names(inOrders(rows, [group('asc'), dropped('asc')], nameOf))).withContext('FFF has no figure: last of group A').toBe('AAA CCC FFF BBB DDD EEE');
      expect(names(inOrders(rows, [dropped('desc'), group('asc')], nameOf))).withContext('FFF last; EEE (no group) first by its figure').toBe('EEE CCC BBB DDD AAA FFF');
    });

    it('orders rows level in every key A to Z', () => {
      expect(names(inOrders(rows, [dropped('desc')], nameOf))).toBe('EEE CCC BBB DDD AAA FFF');
    });

    it('with one key gives what a single column gives, and with none the rows A to Z', () => {
      expect(names(inOrders(rows, [group('asc')], nameOf))).toBe('AAA CCC FFF BBB DDD EEE');
      expect(names(inOrders(rows, [], nameOf))).toBe('AAA BBB CCC DDD EEE FFF');
    });

    it('leaves the rows it was given as they were', () => {
      const before = names(rows);
      inOrders(rows, [group('asc'), dropped('desc')], nameOf);
      expect(names(rows)).toBe(before);
    });
  });

  describe('what a heading shows', () => {
    const two: RowOrder<Column>[] = [{column: 'group', direction: 'asc'}, {column: 'dropped', direction: 'desc'}];

    it('numbers the keys once there are two or more, and shows no number for a single key', () => {
      expect(placeIn(two, 'group')).toBe(1);
      expect(placeIn(two, 'dropped')).toBe(2);
      expect(placeIn(two, 'swings')).toBeUndefined();
      expect(placeIn([{column: 'group', direction: 'asc'}], 'group')).toBeUndefined();
      expect(placeIn([], 'group')).toBeUndefined();
    });

    it('tells a screen reader the way of the first key only (one heading of a table carries aria-sort)', () => {
      expect(ariaSortOf(two, 'group')).toBe('ascending');
      expect(ariaSortOf(two, 'dropped')).toBeNull();
      expect(ariaSortOf([], 'group')).toBeNull();
    });

    it('has one line for a heading\'s tooltip that says how a column is added', () => {
      expect(ALSO_ORDER_TIP).toContain('Shift');
      expect(ALSO_ORDER_TIP.length).toBeLessThan(90);
    });
  });
});
