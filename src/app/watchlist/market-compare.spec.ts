import {againstMarket, againstMarketLines} from "./market-compare";
import {PositionView, viewOf} from "./positions";

const TODAY = '2026-11-21';
/** Where the market stands today. */
const MARKET_NOW = 520;

/** A holding: the shares, what was paid for one, today's price, the day it was bought and where the market stood then. */
function held(symbol: string, o: { shares: number, paid: number, price?: number, day?: string, marketThen?: number }): PositionView {
  const position = {symbol, shares: o.shares, price: o.paid, ...(o.day ? {day: o.day} : {})};
  return viewOf(position, {price: o.price, today: TODAY, indexThen: o.marketThen, indexNow: MARKET_NOW});
}

// AAA: $3,000 paid 100 days ago, worth $3,300 now (+$300). The market went from 500 to 520: +4%, +$120 on that money.
const AAA = held('AAA', {shares: 30, paid: 100, price: 110, day: '2026-08-13', marketThen: 500});
// BBB: $1,000 paid 20 days ago, worth $960 now (−$40). The market went from 650 to 520: −20%, −$200 on that money.
const BBB = held('BBB', {shares: 20, paid: 50, price: 48, day: '2026-11-01', marketThen: 650});
// Three that cannot be compared: no purchase day, no price today, bought before the market's prices on the page begin.
const UNDATED = held('CCC', {shares: 10, paid: 100, price: 150, marketThen: 500});
const UNPRICED = held('DDD', {shares: 10, paid: 100, day: '2026-08-13', marketThen: 500});
const TOO_OLD = held('EEE', {shares: 10, paid: 100, price: 150, day: '2024-08-13'});

/** One stock: $1,000 paid on that day at 100 a share, at `price` now; the market was at 500 then (+4% since). */
const one = (price: number, day = '2026-08-13') => held('AAA', {shares: 10, paid: 100, price, day, marketThen: 500});

describe('againstMarket (the same money in the market on the same days)', () => {
  it('adds up what each purchase would have made in the market, counted from its own day', () => {
    const it = againstMarket([AAA, BBB])!;
    expect([it.compared, it.held]).toEqual([2, 2]);
    expect(it.cost).toBe(4000);
    expect(it.gain).toBeCloseTo(260, 6);
    expect(it.gainPercent).toBeCloseTo(6.5, 6);
    expect(it.marketGain).toBeCloseTo(-80, 6);          // +120 and −200
    expect(it.marketPercent).toBeCloseTo(-2, 6);
    expect(it.ahead).toBeCloseTo(340, 6);
  });

  it('says how long the money has been in: the days of each purchase, weighted by what was paid', () => {
    expect(againstMarket([AAA, BBB])!.days).toBeCloseTo(80, 6);     // (3,000 x 100 + 1,000 x 20) / 4,000
  });

  it('leaves out a stock that cannot be compared, and counts like with like for the others', () => {
    const it = againstMarket([AAA, UNDATED, UNPRICED, BBB, TOO_OLD])!;
    expect([it.compared, it.held]).toEqual([2, 5]);
    expect(it.cost).toBe(4000);
    expect(it.gain).withContext('the result of the two that are compared, not of all five').toBeCloseTo(260, 6);
    expect(it.marketGain).toBeCloseTo(-80, 6);
  });

  it('has nothing to say while no stock can be compared', () => {
    expect(againstMarket([])).toBeUndefined();
    expect(againstMarket([UNDATED, UNPRICED, TOO_OLD])).toBeUndefined();
  });
});

describe('againstMarketLines (the line under the "What you own" headline)', () => {
  const lines = (...views: PositionView[]) => againstMarketLines(againstMarket(views));

  it('gives the market\'s result for the same money, in the headline\'s own format, and how far ahead the stocks are', () => {
    expect(lines(AAA, BBB)[0]).toBe('The same money in the market on the same days: −$80 (−2.0%). Your stocks are $340 ahead of it.');
  });

  it('says behind, or level, as plainly, and "your stock" for one', () => {
    expect(lines(one(100))[0]).toBe('The same money in the market on the same days: +$40 (+4.0%). Your stock is $40 behind it.');
    expect(lines(one(104))[0]).toBe('The same money in the market on the same days: +$40 (+4.0%). Your stock is level with it.');
    expect(lines(one(110))[0]).toBe('The same money in the market on the same days: +$40 (+4.0%). Your stock is $60 ahead of it.');
  });

  it('says that it is too early to mean much until the money has been in for the 6 months the tests looked at', () => {
    expect(lines(AAA, BBB)[1]).toBe('Too early to mean much: on average this money has been in for 11 weeks. The tests looked at 6 months.');
    expect(lines(one(110, '2026-05-24')).length).withContext('181 days').toBe(2);
    expect(lines(one(110, '2026-05-23'))).withContext('182 days: 26 weeks')
      .toEqual(['The same money in the market on the same days: +$40 (+4.0%). Your stock is $60 ahead of it.']);
  });

  it('counts that time in days for the first two weeks and in whole weeks after', () => {
    const time = (day: string) => /for (.*)\. The tests/.exec(lines(one(110, day))[1])![1];
    expect(time('2026-11-21')).toBe('less than a day');
    expect(time('2026-11-20')).toBe('1 day');
    expect(time('2026-11-08')).toBe('13 days');
    expect(time('2026-11-07')).toBe('2 weeks');
    expect(time('2026-05-24')).toBe('25 weeks');
  });

  // The headline's "since bought" counts every stock with a price. When the market can be counted for fewer, the
  // line gives the result of those same stocks beside the market's: two figures that can be compared.
  it('gives the result of the stocks it counts when it cannot count them all, and says what the others lack', () => {
    expect(lines(AAA, UNDATED, UNPRICED, BBB, TOO_OLD)).toEqual([
      'For 2 of your 5 stocks: +$260 (+6.5%) since bought. The same money in the market on the same days: −$80 (−2.0%). ' +
      'Those 2 are $340 ahead of it.',
      'Left out: 3 with no price today, no purchase date, or bought over a year ago.',
      'Too early to mean much: on average this money has been in for 11 weeks. The tests looked at 6 months.',
    ]);
    expect(lines(one(110), UNDATED).slice(0, 2)).toEqual([
      'For 1 of your 2 stocks: +$100 (+10.0%) since bought. The same money in the market on the same days: +$40 (+4.0%). ' +
      'That one is $60 ahead of it.',
      'Left out: 1 with no price today, no purchase date, or bought over a year ago.',
    ]);
  });

  it('says nothing while there is nothing to compare', () => {
    expect(againstMarketLines(undefined)).toEqual([]);
    expect(lines(UNDATED)).toEqual([]);
  });

  it('keeps to everyday words and short sentences, and states the difference without judging it', () => {
    [...lines(AAA, BBB), ...lines(AAA, UNDATED, UNPRICED, BBB, TOO_OLD), ...lines(one(100)), ...lines(one(110), UNDATED)].forEach(line => {
      expect(line).withContext(line).not.toMatch(/S&P|index|benchmark|position|beat|underperform|outperform|return/i);
      line.split(/(?<=\.) /).forEach(sentence => expect(sentence.length).withContext(sentence).toBeLessThanOrEqual(80));
    });
  });
});
