import {EVIDENCE, inTen, monthYear, numberWord, oneIn, roughShare, roughStart, textsFor, watchHeadline} from "./evidence";
import {DIP_PERCENT, TESTED_DEPTH_P95, TESTED_VOL_P95, VIX_HIGH, VOL_HIGH, VOL_LOW} from "./signal";
import {FIGURES_2026_11_21} from "./testing/figures";

describe('how tested shares and dates are worded', () => {
  it('says "1 in N" when that is within two points of the share, and the percentage otherwise', () => {
    expect([33, 25, 20, 50, 34].map(oneIn)).toEqual(['1 in 3', '1 in 4', '1 in 5', '1 in 2', '1 in 3']);
    expect([28, 40, 60].map(oneIn)).toEqual(['28%', '40%', '60%']);
  });

  it('says "N in 10" for shares compared side by side', () => {
    expect([41, 21, 71, 45].map(inTen)).toEqual(['4 in 10', '2 in 10', '7 in 10', '5 in 10']);
  });

  it('does not say "0 in 10" or "10 in 10"', () => {
    expect(inTen(3)).toBe('fewer than 1 in 10');
    expect(inTen(97)).toBe('nearly all');
  });

  it('says "about half" from 45% to 55%, and the percentage otherwise', () => {
    expect([45, 53, 55].map(roughShare)).toEqual(['about half', 'about half', 'about half']);
    expect([44, 62].map(roughShare)).toEqual(['44%', '62%']);
  });

  it('names the start of the test window roughly and its end by month', () => {
    expect(['2023-02-10', '2023-05-26', '2023-08-31', '2023-11-03'].map(roughStart)).toEqual(['early 2023', 'mid-2023', 'mid-2023', 'late 2023']);
    expect(monthYear('2026-05-22')).toBe('May 2026');
    expect(monthYear('2026-12-04')).toBe('December 2026');
  });
});

/**
 * The wording is for someone new to investing: "the market" rather than an index's name, "dropped" rather than
 * "dip", "1 in 10" rather than "the worst tenth". The app's own marks (DIP BUY, WATCH, PASS) are the only terms kept.
 */
describe('the texts built from the figures recorded on 2026-11-21', () => {
  const t = textsFor(FIGURES_2026_11_21);

  it('names the test window and its years', () => {
    expect(t.window).toBe('mid-2023 to May 2026');
    expect(t.years).toBe('2023–2026');
  });

  it('gives a DIP BUY its headline', () => {
    expect(t.dipBuyHeadline('20% below its high')).toBe(
      'A growing company, 20% below its high. Over all 636 test stocks, stocks like this gained +12.1% on average over 6 months ' +
      '(any stock that dropped: +10.0%; the market: +10.8%). ' +
      'The typical one gained only +4.8%, and 1 in 3 fell a further 20% first.');
  });

  it('gives a PASS its headline', () => {
    expect(t.passHeadline(10, 15)).toBe(
      'The business is not growing enough: the app looks for profit per share on course to grow 10%, or sales up 15% on a year ago. ' +
      'Over all 636 test stocks, stocks like this that dropped gained +9.2% on average over 6 months, against +12.1% for growing ones; ' +
      'the typical result was about the same (+4.5% and +4.8%).');
  });

  it('gives a WATCH its headline, which quotes no tested number', () => {
    expect(watchHeadline('5.0% below its highest price of the past year', 15)).toBe(
      'A growing company, 5.0% below its highest price of the past year. That is not a drop of 15% or more, so the tests do not apply yet.');
    expect(watchHeadline('', 15)).toBe(
      'A growing company, but its highest price of the past year is not known, so there is no drop to measure and the tests do not apply yet.');
  });

  it('says what the tests found for DIP BUYs, caveats included', () => {
    expect(t.dipBuyTestNotes).toEqual([
      'On 636 stocks never used to build the rule (bought from mid-2023 to May 2026), stocks that dropped while the business kept growing ' +
      'gained +12.1% on average over 6 months. Any stock that dropped gained +10.0%, and the market (the S&P 500) +10.8% over the same weeks.',
      'The gain comes from a few big winners. The typical one gained +4.8% (any stock that dropped: +4.6%), 56% were up, ' +
      '42% beat the market, and 1 in 3 fell a further 20% first.',
      'Not proven outside 2023–2026. A simpler version of "growing" (yearly sales only), tested on 424 stocks over 1994–2022, ' +
      'showed no advantage: +11.0% against +13.5% for the other stocks that dropped, and about 11 points worse in 2020–22.',
      'On one of the test lists (234 faster-growing stocks) growing made no difference: +12.0% against +12.2% for any stock that dropped.',
      'On the newest list (202 stocks never used before) such stocks gained +9.3% on average over 6 months, no more than the ' +
      'market (+10.2%); the typical one ended at +3.6%.',
    ]);
  });

  it('says what the tests found about keeping a DIP BUY', () => {
    expect(t.afterBuyingNotes).toEqual([
      'The typical one traded 13% below the purchase price at some point in the next 13 weeks.',
      'Selling after a 20% drop (a "stop-loss") lowered the average 6-month result on one test list (+7.1% against +12.0% for keeping), ' +
      'and about half of the stocks hit it.',
      'Selling as soon as a stock was up 25% lowered it too, on two other lists (+7.4% against +20.2% for keeping, ' +
      'and +5.5% against +9.3%).',
      'After 6 months the tests disagree: kept for 6 months more, the stocks beat the market on one list ' +
      '(+16.1% against +7.4%) and not clearly on the next (+9.4% against +7.7%).',
    ]);
  });

  it('describes the two tested volatility groups', () => {
    expect(t.volatilityNote('high', 62.4)).toBe(
      'Volatile: its price swings a lot (62% a year). On one test list 4 in 10 such stocks fell a further 20% within 13 weeks ' +
      'of being marked DIP BUY, against 2 in 10 of the calm ones (under 35%).');
    expect(t.volatilityNote('low', 28)).toBe(
      'Calm: its price is steady (28% a year). On one test list 2 in 10 such stocks fell a further 20% within 13 weeks ' +
      'of being marked DIP BUY, against 4 in 10 of the volatile ones (45% or more).');
    expect(t.volatilityGroupsNote).toBe(
      'On one test list, 4 in 10 of the stocks marked DIP BUY whose price swings 45% or more a year fell a further 20% within 13 weeks, ' +
      'against 2 in 10 of those under 35%.');
    expect(t.volatilityColumnNote).toBe(
      'How much the price swings in a year. The one risk measure that passed a test: on 234 stocks, 4 in 10 of the "volatile" ones ' +
      '(45% or more) fell a further 20% within 13 weeks of being marked DIP BUY, against 2 in 10 of the "calm" ones (under 35%).');
  });

  it('gives the whole tested range of a kind of DIP BUY, not only its bad case', () => {
    expect(t.casesNote('volatile')).toBe(
      'In tests, 1 in 10 volatile stocks like this lost 41% or more 6 months after being marked DIP BUY, the typical one ended at +2.4%, ' +
      'and 1 in 10 gained 85% or more (one test list, 234 stocks). ' +
      'Those tests cover mid-2023 to May 2026, when the market was rising; in a falling market it can be worse.');
    expect(t.casesNote('middle')).toContain(
      '1 in 10 stocks with middling swings like this lost 31% or more 6 months after being marked DIP BUY, the typical one ended at −0.1%');
    expect(t.casesNote('calm')).toContain('1 in 10 calm stocks like this lost 24% or more');
    expect(t.casesNote('calm')).toContain('1 in 10 gained 41% or more');
  });

  it('explains the bad and good cases under the positions table, with the typical results beside them', () => {
    expect(t.casesCardNote).toBe(
      '"Bad case" and "good case": in tests, 1 in 10 stocks like these did that badly or worse after 6 months, and 1 in 10 that well or better. ' +
      'The typical one ended at +2.4% (volatile), −0.1% (in between) or +4.1% (calm). ' +
      'Tested in 2023–2026, when the market was rising; in a falling market it can be worse. Arithmetic on your numbers, not advice.');
  });

  // The owner had it put in sight under the two tables that show the cases: a quiet line, not a paragraph.
  it('says in one quiet line when the three cases were tested, and that a falling market can be worse', () => {
    expect(t.casesLimit).toBe(
      'Bad, typical and good case: tested in 2023–2026, when the market was rising. In a falling market they can be worse.');
  });

  it('sums the evidence up in one line for the Dip candidates card, naming the mark it is about', () => {
    expect(t.cardNote).toBe(
      'In tests on 636 stocks (bought from mid-2023 to May 2026) stocks marked DIP BUY gained +12.1% on average over 6 months; ' +
      'any stock that dropped gained +10.0% and the market +10.8%. The typical one gained only +4.8%, and 1 in 3 fell a further 20% first. ' +
      'Not proven outside 2023–2026.');
  });

  // (The plan's record in one line, "In tests on new stocks: +9.3% ... (the market: +10.2%)", stood here: the plan's
  // box now shows the strip of tested figures both views share, tested-strip.ts, which has the same two numbers.)

  it('says in plain words what the plan is and whether it made money, next to the market', () => {
    expect(t.planNote).toBe(
      'The plan: buy stocks that dropped 15% or more while the business keeps growing (the app marks them DIP BUY), ' +
      'three or more rather than one; put no more into each than fits your limit; keep each for 6 months and do not sell early. ' +
      'Does that make money? On 202 stocks never used before, such stocks gained +9.3% on average over 6 months and 56% of them ' +
      'were up; the typical one ended at +3.6%, and 1 in 10 lost 31% or more. The market gained +10.2% over the same weeks, ' +
      'so on that list the plan made money, but no more than the market did. ' +
      'Over all 636 test stocks (bought from mid-2023 to May 2026) the average was +12.1% against +10.8% for the market, ' +
      'thanks to a few huge winners; the typical one ended at +4.8%. ' +
      'Replayed month by month, the stocks bought in 24 of 33 months were up 6 months later (the market: 29 of 33). ' +
      'How many: in a separate test on 618 stocks that dropped, from 1994 to 2026, three bought in the same month and held ' +
      'together for 6 months had a milder bad half-year and a higher typical result than one alone, and about the same average. ' +
      'Holding several does not earn more on average, it makes the result steadier. When the market fell over those 6 months, ' +
      'three together still typically lost (−10.2%). ' +
      'That far back the test cannot check that a business was growing, so it covers any stock that dropped, among companies ' +
      'that still exist. The three were picked at random and held in equal amounts: which ones did not matter. ' +
      '"The market" is the S&P 500, an index of 500 large US companies. Apart from the test of how many, all of this is from ' +
      '2023–2026, when the market was rising. Not advice, and nothing is guaranteed.');
  });

  it('gives that account in short paragraphs: the plan, the profit test, the whole record, how many (twice), what to keep in mind', () => {
    expect(t.planParts.length).toBe(6);
    expect(t.planParts.join(' ')).toBe(t.planNote);
    expect(t.planParts.map(it => it.split(' ').slice(0, 3).join(' '))).toEqual([
      'The plan: buy', 'Does that make', 'Over all 636', 'How many: in', 'Holding several does', '"The market" is',
    ]);
  });

  // A review of the page found the box a wall of numbers. Like figures stand in a small table, each once: the
  // paragraph before it says what was found, the one after it what the test cannot say.
  it('sets the figures of how many in a small table, between the two paragraphs about it', () => {
    expect(t.planBlocks.map(block => block.table ? 'table' : 'text')).toEqual(['text', 'text', 'text', 'text', 'table', 'text', 'text']);
    expect(t.planBlocks[4].table).toEqual({
      caption: 'Three stocks together against one alone',
      columns: ['Held for 6 months', 'Typical result', '1 in 10 lost at least', 'On average'],
      rows: [
        {label: 'One alone', cells: ['+3.8%', '33%', '+8.8%']},
        {label: 'Three together', cells: ['+5.3%', '22%', '+8.6%']},
        {label: 'The market', cells: ['+5.5%', '', '']},
      ],
    });
    expect(t.planParts[3]).withContext('no figure of that test in the sentence before the table').not.toMatch(/\d\.\d%/);
    expect(t.planBlocks.flatMap(block => block.text === undefined ? [] : [block.text])).toEqual([...t.planParts]);
  });

  it('says how many in one clause, for the places that only mention it', () => {
    expect(t.severalBrief).toBe(
      'three stocks held together had a milder bad half-year than one alone (1 in 10 lost 22% or more, against 33%)');
    expect(t.severalCardNote(1)).toBe(
      'The plan covers 1 of your stocks. In tests, three stocks held together had a milder bad half-year than one alone ' +
      '(1 in 10 lost 22% or more, against 33%).');
    expect(t.severalCardNote(2)).toContain('The plan covers 2 of your stocks. In tests, three stocks');
  });

  it('writes a small number of stocks as a word', () => {
    expect([1, 3, 5, 10, 12].map(numberWord)).toEqual(['one', 'three', 'five', 'ten', '12']);
  });

  it('says "more than the market" only when that passed its own test', () => {
    const passed = {...FIGURES_2026_11_21, seventh: {...FIGURES_2026_11_21.seventh, market: {...FIGURES_2026_11_21.seventh.market, beats: true}}};
    expect(textsFor(passed).planNote).toContain('so on that list the plan made money, and more than the market did.');
  });

  it('describes what market fear has meant, in a fearful and in a calm market', () => {
    expect(t.fearText(true)).toBe(
      'The VIX measures how nervous investors are; 25 or more counts as fearful. In tests, stocks bought after a drop in fearful months ' +
      'gained +20.4% on average over the next 6 months, against +7.3% in calm months, and about 7 in 10 were up. ' +
      'Fear can still get worse first: about 15% fell a further 20%. ' +
      'This rests on only about 16 fearful periods between 1994 and 2026, and a one-day spike may fade before the month ends.');
    expect(t.fearText(false)).toBe(
      'The VIX measures how nervous investors are; under 25 counts as calm. In tests, stocks bought after a drop in calm months ' +
      'gained +7.3% on average over the next 6 months, against +20.4% in fearful months. ' +
      'Nothing wrong with buying in a calm market; fearful months were just better. Tested on 424 stocks, 1994 to 2026.');
    expect(t.fearHighShort).toBe(
      'in the past a better time to buy stocks that dropped (+20% against +7% on average over 6 months), but fear can get worse first');
  });
});

describe('the app and the backtests use the same rule', () => {
  it('takes the dip threshold, the volatility groups and the fear level from what the backtests tested', () => {
    expect(DIP_PERCENT).toBe(EVIDENCE.dipPercent);
    expect(VOL_HIGH).toBe(EVIDENCE.groups.volatileFrom);
    expect(VOL_LOW).toBe(EVIDENCE.groups.calmBelow);
    expect(VIX_HIGH).toBe(EVIDENCE.fear.vixHigh);
  });

  it('takes how far the tested DIP BUYs reach from the backtests', () => {
    expect(TESTED_DEPTH_P95).toBe(EVIDENCE.reach.depthP95);
    expect(TESTED_VOL_P95).toBe(EVIDENCE.reach.volatilityP95);
  });
});
