import {nextSort, RowSort, SortColumn, sortedRows} from "./position-sort";
import {StepKind} from "./plan";
import {PositionRow} from "./portfolio-view";
import {viewOf} from "./positions";
import {riskOf, TestedCases} from "./sizing";

const TODAY = '2026-11-21';
/** A portfolio worth 10,000; the market stands at 6,000 today. */
const PORTFOLIO = 10_000, INDEX_NOW = 6_000;
const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
const MIDDLE: TestedCases = {group: 'middle', lossPercent: 31, typicalPercent: -0.1, gainPercent: 56};
const CALM: TestedCases = {group: 'calm', lossPercent: 24, typicalPercent: 4.1, gainPercent: 41};

type Holding = { shares: number, paid: number, now?: number, day?: string, indexThen?: number, cases?: TestedCases };

function row(symbol: string, o: Holding): PositionRow {
  const position = {symbol, shares: o.shares, price: o.paid, ...(o.day ? {day: o.day} : {})};
  const view = viewOf(position, {price: o.now, portfolioValue: PORTFOLIO, today: TODAY, indexThen: o.indexThen, indexNow: INDEX_NOW});
  return {symbol, view, verdict: o.cases ? 'DIP BUY' : 'PASS', cases: o.cases, risk: riskOf(view, o.cases, undefined, PORTFOLIO)};
}

/**
 * Four made-up holdings, and what each column of the table shows for them:
 *
 *        value  % of total  result  market    bad   good   held      shares  paid  now  bought
 *  AAA     700       7%      -300    +20%     287    595    20 days     10    100   70  Nov 1
 *  BBB   1,000      10%      +200     -4%     310    560   204 days      4    200  250  May 1
 *  CCC   3,000      30%         0     -9%     720  1,230    81 days    100     30   30  Sep 1
 *  DDD     800       8%      +600      -       -      -      -          20     10   40    -
 *
 * DDD has no purchase date and is not marked DIP BUY, so four of its cells are dashes.
 */
const AAA = row('AAA', {shares: 10, paid: 100, now: 70, day: '2026-11-01', indexThen: 5_000, cases: VOLATILE});
const BBB = row('BBB', {shares: 4, paid: 200, now: 250, day: '2026-05-01', indexThen: 6_250, cases: MIDDLE});
const CCC = row('CCC', {shares: 100, paid: 30, now: 30, day: '2026-09-01', indexThen: 6_600, cases: CALM});
const DDD = row('DDD', {shares: 20, paid: 10, now: 40});
const ROWS = [AAA, BBB, CCC, DDD];
/** What the plan says about each: sell some of CCC, BBB is your call, keep AAA, no opinion on DDD. */
const PLANS = new Map<string, { kind: StepKind }>([['AAA', {kind: 'hold'}], ['BBB', {kind: 'review'}], ['CCC', {kind: 'trim'}], ['DDD', {kind: 'outside'}]]);

const symbols = (rows: PositionRow[]) => rows.map(it => it.symbol).join(' ');

describe('The order of the rows in "What you own"', () => {
  it('is the biggest holding first until a column is clicked', () => {
    expect(symbols(sortedRows(ROWS))).toBe('CCC BBB DDD AAA');
  });

  //                                 from the top: smallest, A, or earliest    the other way round
  const ORDERS: [SortColumn, string, string][] = [
    ['symbol', 'AAA BBB CCC DDD', 'DDD CCC BBB AAA'],
    ['plan', 'CCC BBB AAA DDD', 'DDD AAA BBB CCC'],
    ['value', 'AAA DDD BBB CCC', 'CCC BBB DDD AAA'],
    ['weight', 'AAA DDD BBB CCC', 'CCC BBB DDD AAA'],
    ['result', 'AAA CCC BBB DDD', 'DDD BBB CCC AAA'],
    ['market', 'CCC BBB AAA DDD', 'AAA BBB CCC DDD'],
    ['bad', 'AAA BBB CCC DDD', 'CCC BBB AAA DDD'],
    ['good', 'BBB AAA CCC DDD', 'CCC AAA BBB DDD'],
    // The typical result follows what each is worth and how its kind ended: the same order as the good case here.
    ['typical', 'BBB AAA CCC DDD', 'CCC AAA BBB DDD'],
    ['held', 'AAA CCC BBB DDD', 'BBB CCC AAA DDD'],
    ['shares', 'BBB AAA DDD CCC', 'CCC DDD AAA BBB'],
    ['paid', 'DDD CCC AAA BBB', 'BBB AAA CCC DDD'],
    ['now', 'CCC DDD AAA BBB', 'BBB AAA DDD CCC'],
    ['bought', 'BBB CCC AAA DDD', 'AAA CCC BBB DDD'],
  ];
  ORDERS.forEach(([column, up, down]) => {
    it(`can follow the "${column}" column, either way`, () => {
      expect(symbols(sortedRows(ROWS, {column, direction: 'asc'}, PLANS))).withContext('from the smallest').toBe(up);
      expect(symbols(sortedRows(ROWS, {column, direction: 'desc'}, PLANS))).withContext('from the biggest').toBe(down);
    });
  });

  it('follows the size of the loss in "Bad case": the stock that could lose most is at the top when sorted from the biggest', () => {
    expect(sortedRows(ROWS, {column: 'bad', direction: 'desc'})[0].symbol).toBe('CCC');
  });

  it('follows the plan card\'s own order in "Plan": what asks for something comes first', () => {
    expect(symbols(sortedRows(ROWS, {column: 'plan', direction: 'asc'}, PLANS))).toBe('CCC BBB AAA DDD');
  });

  it('goes A to Z in "Plan" until the plan is worked out', () => {
    expect(symbols(sortedRows([DDD, CCC, BBB, AAA], {column: 'plan', direction: 'asc'}))).toBe('AAA BBB CCC DDD');
  });

  it('keeps a stock with a dash in that column at the bottom, whichever way the column is sorted', () => {
    // DDD has no purchase date, so nothing under "Market since"; NOP's price did not load, so it has no value.
    const nop = row('NOP', {shares: 5, paid: 50});
    expect(symbols(sortedRows([DDD, ...ROWS.slice(0, 3)], {column: 'market', direction: 'asc'}))).toBe('CCC BBB AAA DDD');
    expect(symbols(sortedRows([DDD, ...ROWS.slice(0, 3)], {column: 'market', direction: 'desc'}))).toBe('AAA BBB CCC DDD');
    expect(symbols(sortedRows([nop, ...ROWS], {column: 'weight', direction: 'asc'}))).toBe('AAA DDD BBB CCC NOP');
    expect(symbols(sortedRows([nop, ...ROWS], {column: 'weight', direction: 'desc'}))).toBe('CCC BBB DDD AAA NOP');
  });

  it('puts stocks that are level in a column in A to Z order, whichever way it is sorted', () => {
    // MMM and ZZZ are both worth 500; AAA is worth 700.
    const zzz = row('ZZZ', {shares: 5, paid: 100, now: 100}), mmm = row('MMM', {shares: 10, paid: 50, now: 50});
    expect(symbols(sortedRows([zzz, AAA, mmm], {column: 'value', direction: 'asc'}))).toBe('MMM ZZZ AAA');
    expect(symbols(sortedRows([zzz, AAA, mmm], {column: 'value', direction: 'desc'}))).toBe('AAA MMM ZZZ');
  });

  it('goes by what the cells show: stocks a few cents apart, which the table shows as the same, go A to Z', () => {
    // Worth 500.40, 500.20 and 499.90: each shows as $500 and as 5.0% of the 10,000. PPP shows as $501.
    const kkk = row('KKK', {shares: 1, paid: 500, now: 500.4}), lll = row('LLL', {shares: 1, paid: 500, now: 500.2});
    const jjj = row('JJJ', {shares: 1, paid: 500, now: 499.9}), ppp = row('PPP', {shares: 1, paid: 500, now: 501});
    (['value', 'weight'] as SortColumn[]).forEach(column => {
      expect(symbols(sortedRows([kkk, lll, jjj], {column, direction: 'desc'}))).withContext(column).toBe('JJJ KKK LLL');
      expect(symbols(sortedRows([kkk, lll, jjj], {column, direction: 'asc'}))).withContext(column).toBe('JJJ KKK LLL');
    });
    expect(symbols(sortedRows([kkk, lll, jjj, ppp], {column: 'value', direction: 'desc'}))).toBe('PPP JJJ KKK LLL');
    // Their results: +$0.40, +$0.20 and −$0.10, which the table does tell apart (it shows the cents under $100).
    expect(symbols(sortedRows([kkk, lll, jjj], {column: 'result', direction: 'desc'}))).toBe('KKK LLL JJJ');
  });

  it('counts the time held in weeks, as the table does: two stocks in the same week go A to Z', () => {
    // Bought 16 and 18 days ago, both "week 3 of 26"; and 26 days ago, "week 4 of 26".
    const later = row('TTT', {shares: 1, paid: 100, now: 100, day: '2026-11-05'}), sooner = row('SSS', {shares: 1, paid: 100, now: 100, day: '2026-11-03'});
    const before = row('UUU', {shares: 1, paid: 100, now: 100, day: '2026-10-26'});
    expect(symbols(sortedRows([later, sooner, before], {column: 'held', direction: 'desc'}))).toBe('UUU SSS TTT');
    expect(symbols(sortedRows([later, sooner, before], {column: 'held', direction: 'asc'}))).toBe('SSS TTT UUU');
    // "Bought" shows the day itself, so there the two are told apart.
    expect(symbols(sortedRows([later, sooner, before], {column: 'bought', direction: 'desc'}))).toBe('TTT SSS UUU');
  });

  it('leaves the list it was given as it was', () => {
    const given = [AAA, BBB, CCC, DDD];
    sortedRows(given, {column: 'value', direction: 'desc'});
    expect(symbols(given)).toBe('AAA BBB CCC DDD');
  });
});

describe('Clicking a column heading in "What you own"', () => {
  const BIGGEST_HOLDING_FIRST: RowSort = {column: 'weight', direction: 'desc'};

  it('puts the biggest (or the latest) at the top for a column of numbers or dates', () => {
    const numbers: SortColumn[] = ['value', 'result', 'market', 'bad', 'typical', 'good', 'held', 'shares', 'paid', 'now', 'bought'];
    numbers.forEach(column =>
      expect(nextSort(BIGGEST_HOLDING_FIRST, column)).withContext(column).toEqual({column, direction: 'desc'}));
    expect(nextSort({column: 'symbol', direction: 'asc'}, 'weight')).toEqual({column: 'weight', direction: 'desc'});
  });

  it('reads from the top for the symbol (A to Z) and for the plan (what asks for something first)', () => {
    expect(nextSort(BIGGEST_HOLDING_FIRST, 'symbol')).toEqual({column: 'symbol', direction: 'asc'});
    expect(nextSort(BIGGEST_HOLDING_FIRST, 'plan')).toEqual({column: 'plan', direction: 'asc'});
  });

  it('turns the column around on a second click, and back on a third', () => {
    expect(nextSort(BIGGEST_HOLDING_FIRST, 'weight')).toEqual({column: 'weight', direction: 'asc'});
    expect(nextSort({column: 'weight', direction: 'asc'}, 'weight')).toEqual({column: 'weight', direction: 'desc'});
    expect(nextSort({column: 'symbol', direction: 'asc'}, 'symbol')).toEqual({column: 'symbol', direction: 'desc'});
  });

  it('starts another column in its own direction, whichever way the last one was sorted', () => {
    expect(nextSort({column: 'weight', direction: 'asc'}, 'value')).toEqual({column: 'value', direction: 'desc'});
    expect(nextSort({column: 'value', direction: 'desc'}, 'symbol')).toEqual({column: 'symbol', direction: 'asc'});
  });
});
