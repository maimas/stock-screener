import {GRID_ROW_PX, rowsFor} from "./fills-column.directive";

describe('rowsFor: how many rows of the grid a box takes, so that the next one stands right under it', () => {
  it('covers the height of the box and the gap under it, rounded up to whole rows', () => {
    expect(GRID_ROW_PX).toBe(4);
    expect(rowsFor(400, 24)).toBe(106);
    expect(rowsFor(401, 24)).withContext('never less than the box needs: nothing may overlap').toBe(107);
  });

  it('takes one row at least, also before the box has been measured', () => {
    expect(rowsFor(0, 0)).toBe(1);
  });
});
