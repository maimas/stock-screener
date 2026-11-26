/** Number formatting shared by the positions views. US-style separators regardless of the browser's locale. */

const WHOLE_DOLLARS = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
const DOLLARS_AND_CENTS = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2});
const SHARES = new Intl.NumberFormat('en-US', {maximumFractionDigits: 5});
const MINUS = '−';

/** "$2,439"; cents only under $100, where they matter. A dash when there is no amount. */
export function money(value: number | undefined): string {
  if (!isNum(value)) {
    return '—';
  }
  const amount = Math.abs(value);
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return (amount < 100 && hasCents ? DOLLARS_AND_CENTS : WHOLE_DOLLARS).format(amount);
}

/** "+$540" / "−$540": a result, so the sign is always shown except on zero. */
export function signedMoney(value: number | undefined): string {
  if (!isNum(value)) {
    return '—';
  }
  const text = money(value);
  const isZero = Number(text.replace(/[^0-9.]/g, '')) === 0;
  return isZero ? text : `${value > 0 ? '+' : MINUS}${text}`;
}

/**
 * "+$85" / "−$41": a signed amount in whole dollars whatever its size. For what is worked out from tests and not
 * counted (a bad case, a good case): cents would claim a precision it does not have.
 */
export function signedWholeMoney(value: number | undefined): string {
  if (!isNum(value)) {
    return '—';
  }
  const text = WHOLE_DOLLARS.format(Math.abs(value));
  return Math.round(Math.abs(value)) === 0 ? text : `${value > 0 ? '+' : MINUS}${text}`;
}

/** "+4.3%" / "−20.0%", one decimal; no sign on a value that rounds to zero. */
export function signedPercent(value: number | undefined): string {
  if (!isNum(value)) {
    return '—';
  }
  const fixed = Math.abs(value).toFixed(1);
  return `${Number(fixed) === 0 ? '' : value > 0 ? '+' : MINUS}${fixed}%`;
}

/** "+85%" / "−41%": a whole percentage with its sign, for the size of a tested case. */
export function signedWholePercent(value: number | undefined): string {
  if (!isNum(value)) {
    return '—';
  }
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : rounded < 0 ? MINUS : ''}${Math.abs(rounded)}%`;
}

/** "30", "12.34567", "12,500": whole shares plainly, fractions to at most five decimals, as brokers report them. */
export function shareCount(value: number): string {
  return SHARES.format(value);
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A share the user typed, as it is printed: two decimals at most and no trailing zeros ("20", "33.33", "0.5"),
 * however many were typed or stand in a file.
 */
export function shareText(percent: number): string {
  return String(Math.round(percent * 100) / 100);
}

/** "$115.00": a price of one share, always with its cents. A dash when there is none. */
export function priceText(value: number | undefined): string {
  return isNum(value) ? DOLLARS_AND_CENTS.format(value) : '—';
}

const FOUR_DECIMALS = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4});

/**
 * The price to put on a sell order that is to sell at `value` or better: rounded UP, so that an order at the printed
 * price never sells under it. To the next cent ("$2.34" for 2.3345); under a dollar to the fourth decimal
 * ("$0.9545"), which is how such prices are quoted. A dash when there is none.
 */
export function orderPriceText(value: number | undefined): string {
  if (!isNum(value)) {
    return '—';
  }
  const steps = value < 1 ? 10_000 : 100;
  // The last bits of a float are not a reason to go up a step: 2183.85 arrives as 2183.8500000000004.
  const up = Math.ceil(value * steps - 1e-7) / steps;
  return (value < 1 ? FOUR_DECIMALS : DOLLARS_AND_CENTS).format(up);
}
