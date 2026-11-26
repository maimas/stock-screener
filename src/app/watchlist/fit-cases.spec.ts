import {fitCases} from "./fit-cases";
import {TestedCases} from "./sizing";

describe('fitCases (what a stock\'s size in a portfolio could lose or make)', () => {
  const cases: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};

  // Found by a review: a stock's details gave its size and not what that size could lose or make; the three
  // amounts stood only in "Could add", on the other view.
  it('gives the bad, the typical and the good case of the size in dollars, as "Could add" does in the stock\'s row', () => {
    expect(fitCases('Brokerage', {dollars: 2000, loss: 820, gain: 1700}, cases)).toEqual(
      {portfolio: 'Brokerage', bad: '−$820', typical: '+$48', good: '+$1,700'});
  });

  it('gives nothing without a size, without tested cases or without a portfolio to name', () => {
    expect(fitCases('Brokerage', undefined, cases)).toBeUndefined();
    expect(fitCases('Brokerage', {dollars: 2000, loss: 820, gain: 1700}, undefined)).toBeUndefined();
    expect(fitCases('', {dollars: 2000, loss: 820, gain: 1700}, cases)).toBeUndefined();
    expect(fitCases('Brokerage', {dollars: 0, loss: 0, gain: 0}, cases)).toBeUndefined();
  });

  // Seen on a portfolio worth a few cents: "Bad case $0 · Typical $0 · Good case $0" under a size of $0.03.
  it('gives nothing where every amount would round to nothing', () => {
    expect(fitCases('Brokerage', {dollars: 0.03, loss: 0.01, gain: 0.02}, cases)).toBeUndefined();
  });
});
