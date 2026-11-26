/**
 * What you hold: one position per symbol, with the account settings the sizing calculator needs.
 * Portfolios are kept together in a book (portfolio-book.ts), which is what gets saved; they stay on this
 * computer and are separate from the snapshot log, so exporting the log does not export your holdings.
 */

export type Position = {
  symbol: string
  shares: number
  /** Average price paid per share. */
  price: number
  /** Day bought, YYYY-MM-DD. Optional: a broker's list of positions gives the average price but not the dates. */
  day?: string
};

export type Portfolio = {
  v: 1
  /** Cash held beside the positions, in dollars. The portfolio value is the positions at today's prices plus this. */
  cash?: number
  /** The most the user accepts to lose on one position in a bad case, as % of the portfolio. Theirs to choose. */
  lossBudgetPercent?: number
  /**
   * The share of the portfolio the user wants to keep outside stocks, in cash, as % of the portfolio: above 0 and
   * under 100. Theirs to choose; none until they enter one. Cash is the part that cannot fall with the stocks.
   */
  reservePercent?: number
  /**
   * The level at which the user wants to take a profit on a stock the plan covers, in % above what was paid: one of
   * the levels that passed the take-profit test (pre-registered #9). Theirs to choose; none until they pick one.
   */
  takeProfitPercent?: number
  /** Only in files written before portfolios had names; the save time now belongs to the whole book. */
  savedAt?: string
  positions: Record<string, Position>
};

/**
 * Every backtest held a purchase for 26 weeks. Weeks 26 to 52 were tested twice (pre-registered #6 P3 and #7 G4):
 * the kept stocks beat the market on one list and not on the next, so there is no rule beyond 26 weeks, and a
 * position older than that is beyond what the tests agree on.
 */
export const TESTED_DAYS = 26 * 7;

export function emptyPortfolio(): Portfolio {
  return {v: 1, positions: {}};
}

/** What is wrong with a position being entered, in words for the form, or undefined when it can be saved. */
export function positionProblem(position: Partial<Position>, today: string): string | undefined {
  if (!isPositive(position.shares)) {
    return 'Enter how many shares you hold.';
  }
  if (!isPositive(position.price)) {
    return 'Enter the price you paid per share.';
  }
  if (position.day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(position.day) || isNaN(Date.parse(position.day))) {
      return 'Enter the purchase date as a day, or leave it empty.';
    }
    if (position.day > today) {
      return 'The purchase date cannot be in the future.';
    }
  }
  return undefined;
}

/** One more purchase of a stock that is already held: how many shares, at what price, and on which day when known. */
export type Purchase = { shares: number, price: number, day?: string };

/** What is wrong with a purchase being entered, in words for the form, or undefined when it can be added. */
export function purchaseProblem(purchase: Partial<Purchase>, today: string): string | undefined {
  if (typeof purchase.shares === 'number' && purchase.shares < 0) {
    return 'The shares bought cannot be less than 0.';
  }
  if (!isPositive(purchase.shares)) {
    return 'Enter how many shares you bought.';
  }
  return positionProblem({shares: purchase.shares, price: purchase.price, day: purchase.day}, today);
}

/**
 * The holding after one more purchase, worked out so that the reader does not have to: the shares added up, and
 * the price paid averaged by what each part cost. The holding keeps one day: the average day the money went in,
 * each part weighted by its cost, so that a small later purchase moves the day a little and does not start the
 * 6 months again. When one of the two days is not known there is nothing to average, and the day stays as it
 * was recorded. The holding given is not changed.
 */
export function withPurchase(position: Position, purchase: Purchase): Position {
  const before = position.shares * position.price, added = purchase.shares * purchase.price;
  const shares = tidy(position.shares + purchase.shares, 5);
  const after: Position = {symbol: position.symbol, shares, price: tidy((before + added) / shares, 6)};
  if (position.day) {
    const from = Date.parse(position.day), to = purchase.day ? Date.parse(purchase.day) : NaN;
    const days = Number.isFinite(to) && before + added > 0 ? Math.round((to - from) / DAY_MS * added / (before + added)) : 0;
    after.day = new Date(from + days * DAY_MS).toISOString().slice(0, 10);
  }
  return after;
}

/** What is wrong with a sale being entered, in words for the form, or undefined when it can be recorded. */
export function saleProblem(position: Position, sharesSold: number | undefined): string | undefined {
  if (typeof sharesSold === 'number' && sharesSold < 0) {
    return 'The shares sold cannot be less than 0.';
  }
  if (!isPositive(sharesSold)) {
    return 'Enter how many shares you sold.';
  }
  return sharesSold > position.shares + 1e-9
    ? `You hold ${tidy(position.shares, 5)} share${position.shares === 1 ? '' : 's'}: enter that many or fewer.` : undefined;
}

/**
 * The holding after some of its shares were sold: fewer shares, at the same price paid and with the same day,
 * since neither is changed by a sale. Nothing is left when every share is sold.
 */
export function afterSale(position: Position, sharesSold: number): Position | undefined {
  const shares = tidy(position.shares - sharesSold, 5);
  return shares > 0 ? plain({...position, shares}) : undefined;
}

/** Adds the position, or replaces the one already held in that symbol. */
export function withPosition(portfolio: Portfolio, position: Position): Portfolio {
  return {...portfolio, positions: {...portfolio.positions, [position.symbol]: plain(position)}};
}

export function withoutPosition(portfolio: Portfolio, symbol: string): Portfolio {
  const positions = {...portfolio.positions};
  delete positions[symbol];
  return {...portfolio, positions};
}

/** A position with everything that can be worked out from today's price and the portfolio value. */
export type PositionView = {
  position: Position
  /** Latest price; missing when the stock's quote did not load. */
  price?: number
  cost: number
  value?: number
  gain?: number
  gainPercent?: number
  /** Share of the portfolio value. */
  weightPercent?: number
  /** Unknown, like the week and the index comparison, for a position without a purchase date. */
  daysHeld?: number
  /** Week of holding, counting the purchase day as the first day of week 1. */
  week?: number
  /** Held longer than the 26 weeks the backtests agree on. */
  beyondTested: boolean
  /** S&P 500 change since the purchase day, in %. */
  indexPercent?: number
};

export function viewOf(position: Position, o: {
  price?: number, portfolioValue?: number, today: string,
  /** S&P 500 level on the purchase day and now. */
  indexThen?: number, indexNow?: number
}): PositionView {
  const cost = position.shares * position.price;
  const view: PositionView = {position, cost, beyondTested: false};
  if (position.day) {
    view.daysHeld = Math.max(0, Math.round((Date.parse(o.today) - Date.parse(position.day)) / 86_400_000));
    view.week = Math.floor(view.daysHeld / 7) + 1;
    view.beyondTested = view.daysHeld >= TESTED_DAYS;
    if (isPositive(o.indexThen) && isPositive(o.indexNow)) {
      view.indexPercent = (o.indexNow / o.indexThen - 1) * 100;
    }
  }
  if (isPositive(o.price)) {
    view.price = o.price;
    view.value = position.shares * o.price;
    view.gain = view.value - cost;
    view.gainPercent = (view.value / cost - 1) * 100;
    if (isPositive(o.portfolioValue)) {
      view.weightPercent = view.value / o.portfolioValue * 100;
    }
  }
  return view;
}

/**
 * Reads a portfolio from text (the stored file, or one being imported). Returns undefined unless every part is
 * sound: a half-read portfolio would silently lose positions. Fields this app does not know are dropped.
 */
export function parsePortfolio(text: string): Portfolio | undefined {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const isObject = (it: unknown) => !!it && typeof it === 'object' && !Array.isArray(it);
  if (!isObject(raw) || raw.v !== 1 || !isObject(raw.positions)) {
    return undefined;
  }
  const portfolio: Portfolio = {v: 1, positions: {}};
  // The first version stored a portfolio value typed in by hand; it is now worked out, so that field is not read.
  if (raw.cash !== undefined && raw.cash !== null) {
    if (typeof raw.cash !== 'number' || !Number.isFinite(raw.cash) || raw.cash < 0) {
      return undefined;
    }
    portfolio.cash = raw.cash;
  }
  if (raw.lossBudgetPercent !== undefined && raw.lossBudgetPercent !== null) {
    if (!isPositive(raw.lossBudgetPercent)) {
      return undefined;
    }
    portfolio.lossBudgetPercent = raw.lossBudgetPercent;
  }
  // A zero means "no share", as it does when typed into the field: one stray zero is no reason to refuse the book.
  if (raw.reservePercent !== undefined && raw.reservePercent !== null && raw.reservePercent !== 0) {
    if (!isPositive(raw.reservePercent) || raw.reservePercent >= 100) {
      return undefined;
    }
    portfolio.reservePercent = raw.reservePercent;
  }
  // The level for taking a profit: a number above 0 (which levels are offered is the tests' to say, not the file's).
  if (raw.takeProfitPercent !== undefined && raw.takeProfitPercent !== null && raw.takeProfitPercent !== 0) {
    if (!isPositive(raw.takeProfitPercent)) {
      return undefined;
    }
    portfolio.takeProfitPercent = raw.takeProfitPercent;
  }
  if (typeof raw.savedAt === 'string' && !isNaN(Date.parse(raw.savedAt))) {
    portfolio.savedAt = raw.savedAt;
  }
  for (const key of Object.keys(raw.positions)) {
    const position = raw.positions[key];
    // Any date is acceptable here: the file may have been written on a later day than this computer thinks it is.
    if (!isObject(position) || typeof position.symbol !== 'string' || !position.symbol.trim() || positionProblem(position, '9999-12-31')) {
      return undefined;
    }
    portfolio.positions[position.symbol] = plain(position);
  }
  return portfolio;
}

/** The position with only the fields this app keeps, and no date field at all when there is no date. */
function plain(position: Position): Position {
  const kept: Position = {symbol: position.symbol, shares: position.shares, price: position.price};
  if (position.day) {
    kept.day = position.day;
  }
  return kept;
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const DAY_MS = 86_400_000;

/** A number without the dust that adding fractions leaves (0.1 + 0.2), kept to as many decimals as are shown. */
function tidy(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}
