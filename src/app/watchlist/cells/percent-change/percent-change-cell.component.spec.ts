import {PercentChangeCellComponent} from "./percent-change-cell.component";

const cell = (percent: number | null | undefined, o: Partial<PercentChangeCellComponent> = {}) =>
  Object.assign(new PercentChangeCellComponent(), {percent, ...o});

describe('PercentChangeCellComponent', () => {
  it('shows a change with its sign and two decimals', () => {
    expect(cell(4.708).value).toBe('+4.71%');
    expect(cell(-3.484).value).toBe('−3.48%');
  });

  it('can show one decimal, for an average where the second says nothing', () => {
    expect(cell(4.708, {digits: 1}).value).toBe('+4.7%');
    expect(cell(-3.484, {digits: 1}).value).toBe('−3.5%');
  });

  it('colours a value by the sign it is shown with: one that rounds to zero is neither a gain nor a loss', () => {
    expect(cell(0.04, {digits: 1}).priceColor).toBe('var(--ink-3)');
    expect(cell(0.04).priceColor).toBe('var(--gain)');
    expect(cell(-0.3, {digits: 1}).priceColor).toBe('var(--loss)');
  });

  // A price change that nothing on the page was tested on (a list's average, a stock's past year) is context:
  // it keeps its sign, but not the colour the page uses for the reader's own gains and losses.
  it('can show a change plainly: with its sign, without the colour of a gain or a loss', () => {
    expect(cell(89.52, {plain: true, digits: 1}).value).toBe('+89.5%');
    expect(cell(89.52, {plain: true}).priceColor).toBe('var(--ink-2)');
    expect(cell(-24.33, {plain: true, digits: 1}).value).toBe('−24.3%');
    expect(cell(-24.33, {plain: true}).priceColor).toBe('var(--ink-2)');
  });

  it('shows a dash when there is no value', () => {
    expect(cell(null).value).toBe('—');
    expect(cell(undefined).value).toBe('—');
  });
});
