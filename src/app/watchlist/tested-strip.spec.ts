import {FIGURES_2026_11_21} from "./testing/figures";
import {testedStrip} from "./tested-strip";

describe('testedStrip (what the mark was worth in the tests, as figures)', () => {
  const strip = testedStrip(FIGURES_2026_11_21);

  it('says of what the figures are, in one quiet line', () => {
    expect(strip.title).toBe('In tests on 636 stocks, over 6 months');
  });

  // The typical stock gained less than the average: it stands beside the average, so the average is not read alone.
  it('gives the average and the typical stock with the mark, then any stock that dropped and the market', () => {
    expect(strip.figures.slice(0, 4)).toEqual([
      {label: 'DIP BUY, on average', value: '+12.1%'},
      {label: 'DIP BUY, the typical one', value: '+4.8%'},
      {label: 'Any stock that dropped', value: jasmine.stringMatching(/^[+−]\d+\.\d%$/)},
      {label: 'The market', value: jasmine.stringMatching(/^[+−]\d+\.\d%$/)},
    ]);
  });

  // Found by a review: four gains stood in sight and what limits them was a click away.
  it('gives the risk as one of the figures, and says what "typical" is and which years were tested', () => {
    expect(strip.figures[4]).toEqual({label: 'DIP BUYs that fell a further 20% first', value: '1 in 3', risk: true});
    expect(strip.limits).toBe('The typical one is the middle stock: half did better, half worse. Tested 2023–2026 only.');
  });

  it('writes a loss with the true minus sign and nothing with no sign', () => {
    const lost = testedStrip({...FIGURES_2026_11_21, dipBuy: {...FIGURES_2026_11_21.dipBuy, mean: -2.34, median: 0}});
    expect(lost.figures.slice(0, 2).map(it => it.value)).toEqual(['−2.3%', '0.0%']);
  });
});
