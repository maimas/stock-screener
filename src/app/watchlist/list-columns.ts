/**
 * Where the lists stand when two of them fit side by side: which of the two columns each list is in.
 *
 * The lists differ a lot in length (three funds, eight chip makers). Set two to a row, the shorter one of each
 * pair left a hole under it. So each list goes, in its turn, under the last one of the column that is shorter so
 * far: the first two start the two columns, and the rest fill them up evenly. A list keeps its column whatever is
 * opened inside the lists later, because the choice rests on how many stocks each list has and not on its height
 * on the screen.
 */

/** What a list takes besides its rows (its heading, the table's headings, the gap under it), counted in rows. */
const AROUND_A_LIST = 3;

/** For each list, given how many stocks it has: 1 for the first column, 2 for the second. */
export function listColumns(stocks: number[]): number[] {
  const filled = [0, 0];
  return stocks.map(count => {
    const column = filled[1] < filled[0] ? 1 : 0;
    filled[column] += count + AROUND_A_LIST;
    return column + 1;
  });
}
