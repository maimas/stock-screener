import {NoVerdict, SignalCellComponent} from "./signal-cell.component";

describe('SignalCellComponent: a stock without a mark', () => {
  const cell = (noVerdict: NoVerdict) => Object.assign(new SignalCellComponent(), {signal: null, noVerdict});

  // The page's legend calls DIP BUY, WATCH and PASS "marks"; the same thing must not be a "verdict" a few lines on.
  it('says why it has none in the page\'s own words: "mark", and "profit" and "results" rather than "earnings"', () => {
    expect(cell('fund').tooltip).toBe("Funds have no profit of their own, so the mark, which rests on a company's growth, does not apply.");
    expect(cell('too-new').tooltip).toBe(
      'Too young for the tested rule, which needs 8 reported quarters and a year of prices. No mark rather than an untested one.');
    expect(cell('no-data').tooltip).toBe("The history of the company's results is missing or incomplete at the data source, so there is no mark.");
  });

  it('names the kind of stock in place of a mark', () => {
    expect(['fund', 'too-new', 'no-data'].map(reason => cell(reason as NoVerdict).noVerdictLabel)).toEqual(['FUND', 'TOO NEW', 'NO DATA']);
  });
});
