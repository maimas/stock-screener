import {GrowthCellComponent} from "./growth-cell.component";
import {GrowthOutlook} from "../../signal";

const cell = (growth?: GrowthOutlook) => Object.assign(new GrowthCellComponent(), {growth});
const growth = (epsOutlook: number, revenueGrowth: number, o: Partial<GrowthOutlook> = {}): GrowthOutlook =>
  ({epsOutlook, revenueGrowth, growing: epsOutlook >= 10 || revenueGrowth >= 15, shrinking: false, tested: true, ...o});

describe('GrowthCellComponent (the two numbers a mark rests on)', () => {
  it('ticks the number that passes its test', () => {
    const both = cell(growth(21, 44.7)), sales = cell(growth(6.7, 27.1)), neither = cell(growth(0.8, 1.6));
    expect([both.epsPass, both.revPass]).toEqual([true, true]);
    expect([sales.epsPass, sales.revPass]).toEqual([false, true]);
    expect([neither.epsPass, neither.revPass]).toEqual([false, false]);
  });

  it('explains both numbers in everyday words, with the trade\'s terms beside them once', () => {
    expect(cell(growth(21, 44.7)).tooltip).toBe(
      'Profit: profit per share (EPS), the next quarter as analysts expect it plus the last 3 reported, against the last 4 reported. ' +
      'Passes at 10% or more.\n' +
      'Sales: the latest reported quarter\'s sales (revenue) against the same quarter a year earlier. Passes at 15% or more.\n' +
      '\n' +
      'Growing: at least one passes, which is what DIP BUY and WATCH need.');
    expect(cell(growth(0.8, 1.6)).tooltip).toContain('Not growing: neither passes, so the mark is PASS.');
  });

  it('gives no tick to a company too young for the tested rule, and says its numbers are context only', () => {
    const young = cell(growth(43, 377.9, {tested: false}));
    expect([young.epsPass, young.revPass]).toEqual([false, false]);
    expect(young.tooltip).toMatch(/^Context only\./);
  });

  // The owner asked for less in the tables' cells. "Could add" writes the same figures in whole percent.
  it('writes the figures in whole percent, and with a tenth where a whole number would reach a bar the figure is under', () => {
    const c = cell(growth(21, 44.7));
    expect([c.show(21.1, 10), c.show(44.7, 15), c.show(379.3, 15), c.show(-27.6, 10)]).toEqual(['+21%', '+45%', '+379%', '−28%']);
    expect([c.show(0.4, 10), c.show(-0.4, 10), c.show(undefined, 10)]).toEqual(['0%', '0%', '—']);
    expect([c.show(9.6, 10), c.show(14.6, 15), c.show(10, 10), c.show(15.2, 15)]).withContext('just under a bar: not "+10%" without its tick')
      .toEqual(['+9.6%', '+14.6%', '+10%', '+15%']);
  });

  it('says so when there is nothing to work the growth out from', () => {
    expect(cell().tooltip).toBe('No history of results to work the growth out from.');
  });
});
