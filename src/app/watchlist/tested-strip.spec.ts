import {FIGURES_2026_11_21} from "./testing/figures";
import {testedStrip} from "./tested-strip";

describe('testedStrip (what the mark was worth in the tests, as figures)', () => {
  const strip = testedStrip(FIGURES_2026_11_21);

  // The owner chose the newest test for the one strip both views show: the stocks no earlier test had used.
  it('says of what the figures are, in one quiet line: the newest test', () => {
    expect(strip.title).toBe('In tests on 202 new stocks, over 6 months');
  });

  // The typical stock gained less than the average: it stands beside the average, so the average is not read alone.
  it('gives the average and the typical stock with the mark, then the market', () => {
    expect(strip.figures.slice(0, 3)).toEqual([
      {label: 'DIP BUY, on average', value: '+9.3%'},
      {label: 'DIP BUY, the typical one', value: '+3.6%'},
      {label: 'The market', value: '+10.2%'},
    ]);
  });

  // Found by a review: gains stood in sight and what limits them was a click away.
  it('gives the risk as the last of the figures, and says what "typical" is and which years the tests cover', () => {
    expect(strip.figures.length).toBe(4);
    expect(strip.figures[3]).toEqual({label: '1 in 10 DIP BUYs lost', value: '31% or more', risk: true});
    expect(strip.limits).toBe('The typical one is the middle stock: half did better, half worse. The tests cover 2023–2026 only.');
  });

  it('leads into the account of all the tested lists, which stays behind "How to read this"', () => {
    expect(strip.bridge).toBe('The figures above are from the newest test, on 202 stocks that no earlier test had used. All the tested lists together:');
  });

  it('writes a loss with the true minus sign and nothing with no sign', () => {
    const seventh = FIGURES_2026_11_21.seventh;
    const lost = testedStrip({...FIGURES_2026_11_21, seventh: {...seventh, profit: {...seventh.profit, mean: -2.34, typical: 0}}});
    expect(lost.figures.slice(0, 2).map(it => it.value)).toEqual(['−2.3%', '0.0%']);
  });
});
