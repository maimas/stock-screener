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

  it('says so when there is nothing to work the growth out from', () => {
    expect(cell().tooltip).toBe('No history of results to work the growth out from.');
  });
});
