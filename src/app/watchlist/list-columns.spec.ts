import {listColumns} from "./list-columns";

// The owner, looking at two lists to a row: "I would love to see proportions kept - e.g. the gaps filled with the
// table". A short list beside a long one left a hole under it.
describe('listColumns: which of two columns each list stands in', () => {
  it('starts the two columns with the first two lists, then puts each list under the shorter column', () => {
    // 5 | 8, then 4 under the 5 (9 against 8 rows, with what stands around a list: 15 against 11), and so on.
    expect(listColumns([5, 8, 4, 7, 5, 3, 1])).toEqual([1, 2, 1, 2, 1, 2, 1]);
  });

  it('keeps on filling the shorter column when one list is much longer than the rest', () => {
    expect(listColumns([20, 3, 3, 3, 3])).toEqual([1, 2, 2, 2, 2]);
  });

  it('ends with two columns of about the same length', () => {
    const stocks = [5, 8, 4, 7, 5, 3, 1], columns = listColumns(stocks);
    const length = (column: number) => stocks.filter((_, i) => columns[i] === column).reduce((sum, count) => sum + count + 3, 0);
    expect(Math.abs(length(1) - length(2))).toBeLessThanOrEqual(3);
  });

  it('has nothing to say without lists, and one column for one list', () => {
    expect(listColumns([])).toEqual([]);
    expect(listColumns([4])).toEqual([1]);
  });
});
