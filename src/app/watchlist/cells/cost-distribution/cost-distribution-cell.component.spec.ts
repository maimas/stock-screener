import {CostDistributionCellComponent} from "./cost-distribution-cell.component";

describe('CostDistributionCellComponent ("Holders in profit")', () => {
  // The owner asked for less in the tables' cells: the heading already says "in profit", and "Could add" writes the
  // same figure in whole percent.
  it('shows the share of owners in profit in whole percent, and keeps the words for a screen reader', () => {
    const c = new CostDistributionCellComponent();
    c.distribution = {low: 100, step: 10, weights: [0.5, 0.5], averageCost: 120, profitRatio: 11.04, price: 130};
    expect(c.shortText).toBe('11%');
    expect(c.profitText).toBe('11.0% in profit');
    c.distribution = {low: 100, step: 10, weights: [0.5, 0.5], averageCost: 120, profitRatio: 0.4, price: 100};
    expect(c.shortText).toBe('0%');
  });
});
