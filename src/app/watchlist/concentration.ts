import {ChartSeries, Stock} from "../api/microsoft-money.service";
import type {Fact} from "./recommendations";

/**
 * How much a group of stocks is really one bet: the sector most of them share, and how closely their daily
 * returns have moved together over the past year. Facts about the list, not a tested signal.
 */
export type Concentration = {
  count: number
  /** The sector with the most stocks in the group. */
  topSector?: { name: string, count: number }
  /** Average correlation of daily returns across every pair (1 = moved as one). Undefined with no comparable pair. */
  averageCorrelation?: number
};

/** Two stocks need at least this many trading days in common for their correlation to count. */
const MIN_COMMON_DAYS = 60;
/** From this average correlation up, a group of stocks has moved closely enough together to call it one bet. */
export const LINKED_CORRELATION = 0.5;
/** About a month of trading days: stocks that drift apart over a year often fall together in a sell-off. */
const RECENT_DAYS = 21;
/** A month of trading days, and from how many shared days a comparison counts as "the past year" (eleven months). */
const MONTH_OF_DAYS = 21, YEAR_OF_DAYS = 230;
/** Two shares of the money this close are the same share. */
const SAME_SHARE = 1e-9;
/** A figure against the market needs the market's prices for this part of the days the stocks were compared over. */
const MARKET_COVERS = 0.9;
/** A count of separate bets this close to a whole number is said without "about". */
const CLOSE_TO_WHOLE = 0.05;

/**
 * @param lastDays measure the correlation over only the most recent trading days the two stocks share
 *                 (e.g. 21 for the last month); by default over everything in the 1-year chart.
 */
export function concentrationOf(stocks: Stock[], lastDays?: number): Concentration {
  const sectors = new Map<string, number>();
  for (const stock of stocks) {
    const sector = stock.equity?.company?.sector;
    if (sector) {
      sectors.set(sector, (sectors.get(sector) ?? 0) + 1);
    }
  }
  let topSector: { name: string, count: number } | undefined;
  sectors.forEach((count, name) => {
    if (!topSector || count > topSector.count) {
      topSector = {name, count};
    }
  });

  const series = stocks.map(dailyReturns).filter(it => it.size > 0);
  let sum = 0, pairs = 0;
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const c = correlation(series[i], series[j], lastDays);
      if (c !== undefined) {
        sum += c;
        pairs++;
      }
    }
  }
  return {count: stocks.length, topSector, averageCorrelation: pairs ? sum / pairs : undefined};
}

/**
 * Says in everyday words how far a group of stocks (the DIP BUYs on the page, or the holdings) is a single bet.
 * The test results count stocks spread over years; stocks in one sector tend to rise and fall together, which a
 * plain count hides. `whose` is "these" for the stocks on the page and "your" for the holdings.
 */
export function movingTogetherText(stocks: Stock[], whose: 'these' | 'your', minCount: number): string {
  if (stocks.length < minCount) {
    return '';
  }
  const {count, topSector, averageCorrelation: year} = concentrationOf(stocks);
  const month = concentrationOf(stocks, RECENT_DAYS).averageCorrelation;
  const sector = !topSector || topSector.count < 2 || topSector.count / count < 0.5 ? ''
    : topSector.count < count ? `${topSector.count} of ${whose} ${count} stocks are in ${topSector.name}.`
      : count === 2 ? `Both of ${whose} stocks are in ${topSector.name}.` : `All ${count} of ${whose} stocks are in ${topSector.name}.`;
  if (year === undefined) {
    return sector;
  }
  const recent = month === undefined ? '' : ` and ${month.toFixed(2)} over the last month`;
  const figures = `${year.toFixed(2)} over the past year${recent} (0 = not at all, 1 = exactly together).`;
  // When they move closely, what that means is said first, in words; the figures it rests on follow, for who
  // wants them. When they do not, there is nothing to conclude and the figures are all there is to say.
  const linked = Math.max(year, month ?? 0) >= LINKED_CORRELATION;
  return (sector ? sector + ' ' : '') + (linked
    ? `Their prices move closely together: owning all ${count} is nearer to one big bet than to ${count} separate ones. How closely: ${figures}`
    : `How closely their prices move together: ${figures}`);
}

/**
 * How closely one stock's price has moved with those of a group it is not part of (the stocks a portfolio holds,
 * say): the average correlation of its daily returns with each of theirs, over the past year and over the last
 * month, and whether either is close by the same mark as for a group. A fact about the stock, not a tested signal.
 * `year` is undefined when no stock of the group has enough days in common with it.
 */
export function tiedTo(stock: Stock, others: Stock[]): { year?: number, month?: number, close: boolean } {
  const own = dailyReturns(stock);
  const average = (lastDays?: number): number | undefined => {
    let sum = 0, pairs = 0;
    for (const other of others) {
      const c = other === stock ? undefined : correlation(own, dailyReturns(other), lastDays);
      if (c !== undefined) {
        sum += c;
        pairs++;
      }
    }
    return pairs ? sum / pairs : undefined;
  };
  const year = average(), month = year === undefined ? undefined : average(RECENT_DAYS);
  return {year, month, close: year !== undefined && Math.max(year, month ?? 0) >= LINKED_CORRELATION};
}

/**
 * How closely the prices of two stocks moved over the past year: the correlation of their daily returns (1 = as
 * one, 0 = not at all). Undefined when they have too few days in common to say.
 */
export function pairCorrelation(a: Stock, b: Stock): number | undefined {
  return correlation(dailyReturns(a), dailyReturns(b));
}

/** Day (YYYY-MM-DD) -> close-to-close return. */
function dailyReturns(stock: Stock): Map<string, number> {
  return seriesReturns(stock.chart);
}

/** The same for any series of daily prices: a stock's, or the market's. */
function seriesReturns(chart: ChartSeries | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!chart?.prices || !chart.timeStamps) {
    return out;
  }
  const n = Math.min(chart.prices.length, chart.timeStamps.length);
  for (let i = 1; i < n; i++) {
    const prev = chart.prices[i - 1], cur = chart.prices[i];
    if (isNum(prev) && isNum(cur) && prev > 0) {
      out.set(chart.timeStamps[i].slice(0, 10), cur / prev - 1);
    }
  }
  return out;
}

function correlation(a: Map<string, number>, b: Map<string, number>, lastDays?: number): number | undefined {
  let xs: number[] = [], ys: number[] = [];
  a.forEach((value, day) => {   // days were inserted oldest first, so the arrays end with the latest
    const other = b.get(day);
    if (other !== undefined) {
      xs.push(value);
      ys.push(other);
    }
  });
  if (xs.length < (lastDays ?? MIN_COMMON_DAYS)) {
    return undefined;
  }
  if (lastDays) {
    xs = xs.slice(-lastDays);
    ys = ys.slice(-lastDays);
  }
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
    syy += (ys[i] - my) * (ys[i] - my);
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : undefined;
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A holding with what it is worth today: the money is what the shares of a sector and the weights are taken of. */
export type Weighted = { stock: Stock, value: number };

/**
 * How far the stocks of one portfolio are a single bet, from what holds up on one year of daily prices. Weights and
 * sector labels are exact. The two figures of the portfolio as a whole (how many separate bets its stocks moved
 * like, and how much they moved against the market) describe the past year reasonably well. A figure for one pair
 * of stocks, or for the last month, does not: its error is as large as the figure, so none is given here.
 * Stocks move together more in a fall than in an ordinary year, so the count of separate bets flatters. Facts
 * about the portfolio, not a tested signal.
 */
export type OneBet = {
  /** The holdings that have a value. */
  count: number
  /** How many of them have enough price history in common to be compared (0 when fewer than two do). */
  compared: number
  /** Over how many trading days they were compared: the days all of them share, a year's at most. */
  days?: number
  /** The sector that holds most of the money: how many of the stocks are in it, and its share of the money (0 to 1). */
  topSector?: { name: string, count: number, share: number }
  /**
   * How many separate bets the compared stocks moved like: the money-weighted average of their daily swings over
   * the swing of all of them together, squared. 1 when they move as one; as many as they are when each goes its
   * own way, they swing alike and the money is spread evenly.
   */
  bets?: number
  /**
   * How many times as much as the market the stocks together swung, over the days they share with it: the swing of
   * all of them together over the market's swing. It counts the whole of their movement, also the part that has
   * nothing to do with the market: a few volatile stocks swing far more than they follow. Not given unless the
   * market's prices cover the days the stocks were compared over.
   */
  swing?: number
};

/**
 * @param holdings the stocks held, each with what it is worth today; one without a value is left out
 * @param market   the market's daily prices over the same year (the S&P 500), when the page has them
 */
export function oneBetOf(holdings: Weighted[], market?: ChartSeries): OneBet {
  const valued = holdings.filter(it => isNum(it.value) && it.value > 0);
  const total = valued.reduce((sum, it) => sum + it.value, 0);
  const sectors = new Map<string, { count: number, value: number }>();
  for (const it of valued) {
    const name = it.stock.equity?.company?.sector;
    if (name) {
      const sector = sectors.get(name) ?? {count: 0, value: 0};
      sectors.set(name, {count: sector.count + 1, value: sector.value + it.value});
    }
  }
  let top: OneBet['topSector'];
  sectors.forEach((sector, name) => {
    if (!top || sector.value / total > top.share) {
      top = {name, count: sector.count, share: sector.value / total};
    }
  });
  // Two sectors with the same share of the money: neither holds most of it, and which came first is chance.
  const tied = [...sectors.values()].filter(sector => top && Math.abs(sector.value / total - top.share) < SAME_SHARE).length > 1;
  const topSector = tied ? undefined : top;
  const result: OneBet = {count: valued.length, compared: 0, topSector};

  // The stocks that can be compared: enough days each, and enough days all of them share. A stock listed lately
  // would cut the shared days below what a figure needs; the one with the shortest history is then left out.
  let compared = valued.map(it => ({value: it.value, returns: dailyReturns(it.stock)})).filter(it => it.returns.size >= MIN_COMMON_DAYS);
  let days = sharedDays(compared.map(it => it.returns));
  while (compared.length >= 2 && days.length < MIN_COMMON_DAYS) {
    const shortest = compared.reduce((a, b) => b.returns.size < a.returns.size ? b : a);
    compared = compared.filter(it => it !== shortest);
    days = sharedDays(compared.map(it => it.returns));
  }
  if (compared.length < 2) {
    return result;
  }
  const money = compared.reduce((sum, it) => sum + it.value, 0);
  const together = days.map(day => compared.reduce((sum, it) => sum + it.value / money * it.returns.get(day)!, 0));
  const swing = spread(together);
  if (!(swing > 0)) {
    return result;
  }
  const average = compared.reduce((sum, it) => sum + it.value / money * spread(days.map(day => it.returns.get(day)!)), 0);
  result.compared = compared.length;
  result.days = days.length;
  result.bets = (average / swing) ** 2;

  // Against the market: only when its prices cover the days the stocks were compared over, or the sentence would
  // name a span the figure is not from.
  const marketReturns = seriesReturns(market);
  const both = days.map((day, index) => ({day, index})).filter(it => marketReturns.has(it.day));
  if (both.length >= MIN_COMMON_DAYS && both.length >= days.length * MARKET_COVERS) {
    const theirs = spread(both.map(it => marketReturns.get(it.day)!));
    result.swing = theirs > 0 ? spread(both.map(it => together[it.index])) / theirs : undefined;
  }
  return result;
}

/**
 * The same in words, for the box of a portfolio: where the money is, then how the stocks moved over the past year.
 * "All 4 of your stocks are in Technology. Over the past year your stocks moved like about 2 separate bets, and
 * about 1.9 times as much as the market." Nothing for fewer than two stocks: there is nothing to set side by side.
 */
export function oneBetText(holdings: Weighted[], market?: ChartSeries): string {
  return oneBetSaid(oneBetOf(holdings, market)).sentences.join(' ');
}

/**
 * The same as figures with their names, for the place beside the headline of "What you own" (the owner had it put
 * in sight): the sector most of the money is in, how many separate bets the stocks moved like, and how much they
 * swung against the market. Each carries the sentences (`oneBetText`) as its tip. Nothing for fewer than two stocks.
 */
export function oneBetFacts(holdings: Weighted[], market?: ChartSeries): Fact[] {
  const said = oneBetSaid(oneBetOf(holdings, market)), tip = said.sentences.join(' ');
  return [
    ...(said.sector ? [{label: 'Most money in', value: said.sector, tip}] : []),
    ...(said.like ? [{label: 'Moved like', value: said.like, tip}] : []),
    ...(said.swung ? [{label: 'Swung', value: said.swung, tip}] : []),
  ];
}

/**
 * What is said of how far the stocks are one bet, once: as sentences, and as the few words of each figure (the
 * sector with its share, the bets, the swing against the market). Nothing for fewer than two stocks.
 */
function oneBetSaid({count, compared, days, topSector, bets, swing}: OneBet): { sentences: string[], sector?: string, like?: string, swung?: string } {
  if (count < 2) {
    return {sentences: []};
  }
  const sentences: string[] = [];
  let sector: string | undefined, likeSaid: string | undefined, swung: string | undefined;
  // The sector is said from half of the money up: below that no sector is where the money is.
  if (topSector && topSector.share >= 0.5) {
    // With a stock outside the sector the share is never printed as 100%, however little that stock is worth.
    const percent = Math.round(topSector.share * 100);
    const all = topSector.count === count;
    sentences.push(all
      ? `${count === 2 ? 'Both' : `All ${count}`} of your stocks are in ${topSector.name}.`
      : `${percent >= 100 ? 'Nearly all' : `${percent}%`} of your stock money is in ${topSector.name}: ${topSector.count} of your ${count} stocks.`);
    sector = `${topSector.name}, ${all ? (count === 2 ? 'both stocks' : `all ${count} stocks`) : percent >= 100 ? 'nearly all' : `${percent}%`}`;
  }
  if (bets !== undefined) {
    // "About", unless the figure is the whole number itself. It is never under one, and it is not said above the
    // number of stocks: stocks that move against each other make it run away.
    const whole = Math.round(bets), close = (to: number) => Math.abs(bets - to) < CLOSE_TO_WHOLE;
    const like = whole <= 1 ? `${close(1) ? '' : 'about '}one bet`
      : whole >= compared ? `${bets > compared || close(compared) ? '' : 'about '}${compared} separate bets`
      : `about ${whole} separate bets`;
    // Within a twentieth of the market's own swing it is "as much as the market".
    const times = swing === undefined ? '' : Math.abs(swing - 1) < 0.05 ? 'about as much as the market' : `about ${swing.toFixed(1)} times as much as the market`;
    const against = times ? `, and ${times}` : '';
    // The page loads a year of prices; a stock listed since then cuts the days all of them share, and the sentence
    // then says how many months it is about.
    const span = days === undefined || days >= YEAR_OF_DAYS ? 'year' : `${Math.max(1, Math.round(days / MONTH_OF_DAYS))} months`;
    sentences.push(`Over the past ${span} your stocks moved like ${like}${against}.`);
    likeSaid = span === 'year' ? like : `${like}, over ${span}`;
    swung = times || undefined;
    if (compared < count) {
      sentences.push(`Counted for ${compared} of your ${count} stocks: the ${count - compared === 1 ? 'other has' : 'others have'} too little price history.`);
    }
  }
  return {sentences, sector, like: likeSaid, swung};
}

/** The days every one of the series has a return for, oldest first. */
function sharedDays(series: Map<string, number>[]): string[] {
  if (series.length === 0) {
    return [];
  }
  return [...series[0].keys()].filter(day => series.every(it => it.has(day))).sort();
}

function mean(xs: number[]): number {
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

/** How much a series of daily returns swings: its standard deviation. */
function spread(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) * (x - m), 0) / xs.length);
}
