import {money, shareCount, signedMoney, signedPercent, signedWholeMoney, signedWholePercent} from "./format";

describe('money', () => {
  it('shows whole dollars with thousands separators', () => {
    expect(money(2439.02)).toBe('$2,439');
    expect(money(1_250_000)).toBe('$1,250,000');
  });

  it('keeps cents for amounts under 100 dollars', () => {
    expect(money(14.01)).toBe('$14.01');
  });

  it('shows a dash for a missing amount', () => {
    expect(money(undefined)).toBe('—');
  });
});

describe('signedMoney', () => {
  it('puts a plus on a gain and a real minus sign on a loss', () => {
    expect(signedMoney(540)).toBe('+$540');
    expect(signedMoney(-540.4)).toBe('−$540');
  });

  it('shows zero without a sign', () => {
    expect(signedMoney(0)).toBe('$0');
  });
});

// A bad or a good case is worked out from tests, not counted: cents would claim a precision it does not have,
// and in a column a small amount with cents is as long as one ten times larger.
describe('signedWholeMoney', () => {
  it('shows a worked-out amount in whole dollars, also under 100 dollars', () => {
    expect(signedWholeMoney(-41.03)).toBe('−$41');
    expect(signedWholeMoney(85.07)).toBe('+$85');
    expect(signedWholeMoney(-2306.4)).toBe('−$2,306');
  });

  it('shows no sign on an amount that rounds to zero, and a dash for a missing one', () => {
    expect(signedWholeMoney(0.4)).toBe('$0');
    expect(signedWholeMoney(undefined)).toBe('—');
  });
});

describe('signedPercent', () => {
  it('shows one decimal with a sign', () => {
    expect(signedPercent(4.25)).toBe('+4.3%');
    expect(signedPercent(-20)).toBe('−20.0%');
  });

  it('does not show a sign on a value that rounds to zero', () => {
    expect(signedPercent(-0.04)).toBe('0.0%');
  });

  it('shows a dash for a missing value', () => {
    expect(signedPercent(undefined)).toBe('—');
  });
});

describe('signedWholePercent', () => {
  it('shows a whole percentage with its sign: the size of a tested bad or good case', () => {
    expect(signedWholePercent(85)).toBe('+85%');
    expect(signedWholePercent(-41)).toBe('−41%');
    expect(signedWholePercent(0)).toBe('0%');
  });

  it('shows a dash for a missing value', () => {
    expect(signedWholePercent(undefined)).toBe('—');
  });
});

describe('shareCount', () => {
  it('shows whole shares plainly and fractions to at most five decimals, as brokers report them', () => {
    expect(shareCount(30)).toBe('30');
    expect(shareCount(0.25)).toBe('0.25');
    expect(shareCount(12.34567)).toBe('12.34567');
    expect(shareCount(1.1234567)).toBe('1.12346');
    expect(shareCount(12_500)).toBe('12,500');
  });
});
