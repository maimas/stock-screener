import {withCents} from "./price.directive";

// Found by a review of the page: a price filled in by the page lost its last zero in the forms ("70.1" beside
// "70.10" in the tables).
describe('withCents (a price in a form, written as in the tables)', () => {
  it('gives a price its cents', () => {
    expect(withCents('70.1')).toBe('70.10');
    expect(withCents('70')).toBe('70.00');
    expect(withCents(' 406 ')).toBe('406.00');
  });

  it('leaves alone what has its cents, what has more decimals, and what is not a price', () => {
    expect(withCents('70.10')).toBeNull();
    expect(withCents('153.291234')).toBeNull();
    expect(withCents('')).toBeNull();
    expect(withCents('-5')).toBeNull();
    expect(withCents('abc')).toBeNull();
  });
});
