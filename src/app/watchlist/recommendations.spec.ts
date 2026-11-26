import {
  additions, addLabel, afterSelling, badCaseTip, COLUMNS, COUNT_SOLD, couldAddHeadline, couldAddLead, equalRiskShare, FIT_NOTE, fitOf, goodCaseTip, NO_SIZE_NOTE,
  nothingToAdd, sellFact, sellNote, splitFacts, tiedFact, toSell,
  badHalfYearLine, COLUMN_HELP, fitBrief, ORDER_NOTE, ownedFit, readingOf, recommend, shareText, sizeLabel, sizeOfNew, sizeRules, sizeTip, SizingInput, splitCell, splitLines, tickHint,
  whereItFits
} from "./recommendations";
import {CashSplit, SplitPart} from "./cash-split";
import {TestedCases} from "./sizing";
import {FIGURES_2026_11_21 as F} from "./testing/figures";
import {makeStock} from "./testing/fixtures";

/** What the tests found for the three kinds of stock, as recorded on 2026-11-21. */
const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
const MIDDLE: TestedCases = {group: 'middle', lossPercent: 31, typicalPercent: -0.1, gainPercent: 56};
const CALM: TestedCases = {group: 'calm', lossPercent: 24, typicalPercent: 4.1, gainPercent: 41};

/** The tested plan held three or more stocks; one whose bad case is not known counts as one in between (31%). */
const SPLIT = {atLeast: 3, standIn: 31};

/** A made-up portfolio worth $10,000 with a limit of 20%: it may lose $2,000 on one stock. */
function worth10000(holdings: SizingInput['holdings'], limitPercent = 20): SizingInput {
  return {portfolioValue: 10_000, limitPercent, holdings};
}

describe('equalRiskShare (the share of a portfolio one stock takes when every stock in it carries the same risk)', () => {
  it('gives stocks of one kind equal shares: one of four alike takes a quarter', () => {
    expect(equalRiskShare(41, [41, 41, 41], SPLIT)).toBeCloseTo(0.25, 10);
  });

  it('gives a stock whose bad case is twice as bad half as much, so that the bad case costs the same for both', () => {
    const jumpy = equalRiskShare(40, [20], {atLeast: 2, standIn: 31}), steady = equalRiskShare(20, [40], {atLeast: 2, standIn: 31});
    expect(jumpy).toBeCloseTo(1 / 3, 10);
    expect(steady).toBeCloseTo(2 / 3, 10);
    expect(jumpy * 40).withContext('what the bad case costs, as a share of the portfolio').toBeCloseTo(steady * 20, 10);
  });

  it('counts as if there were three stocks while there are fewer: the tested plan held three or more', () => {
    expect(equalRiskShare(31, [], SPLIT)).toBeCloseTo(1 / 3, 10);
    expect(equalRiskShare(31, [31], SPLIT)).toBeCloseTo(1 / 3, 10);
    expect(equalRiskShare(31, [31, 31, 31], SPLIT)).withContext('four stocks: no padding').toBeCloseTo(1 / 4, 10);
  });

  it('gives the first stock of a portfolio more than a third when it is calm and less when its price swings a lot', () => {
    expect(equalRiskShare(24, [], SPLIT)).toBeCloseTo(31 / 79, 10);     // 39%
    expect(equalRiskShare(41, [], SPLIT)).toBeCloseTo(31 / 113, 10);    // 27%
  });
});

describe('sizeOfNew (the size the plan gives a stock the portfolio does not hold)', () => {
  const threeInBetween = worth10000([
    {symbol: 'AAA', value: 3000, cases: MIDDLE}, {symbol: 'BBB', value: 3000, cases: MIDDLE}, {symbol: 'CCC', value: 3000, cases: MIDDLE},
  ]);

  it('is an equal share for a stock like the ones held: a quarter beside three', () => {
    expect(sizeOfNew(MIDDLE, threeInBetween, F)).toEqual({sharePercent: 25, dollars: 2500, loss: 775, gain: 1400, capped: false});
  });

  it('is smaller for a stock whose price swings more, so that its bad half-year costs the same', () => {
    // 1/41 against three of 1/31: 31 / 154 of the portfolio.
    const size = sizeOfNew(VOLATILE, threeInBetween, F);
    expect(size.sharePercent).toBeCloseTo(20.13, 2);
    expect(size.dollars).toBeCloseTo(2012.99, 2);
    expect(size.loss).withContext('41% of that').toBeCloseTo(825.32, 2);
    expect(size.gain).withContext('85% of that').toBeCloseTo(1711.04, 2);
    expect(size.capped).toBeFalse();
    // The three held would each take 41 / 154 of it, and lose the same in their bad case.
    expect(10_000 * 41 / 154 * 0.31).toBeCloseTo(size.loss, 2);
  });

  it('is never more than fits the limit: the bad case then costs exactly the limit', () => {
    // Nothing held and a limit of 5% ($500): an equal share of the risk would be 27%, but only 12% fits.
    const size = sizeOfNew(VOLATILE, worth10000([], 5), F);
    expect(size.dollars).toBeCloseTo(1219.51, 2);
    expect(size.loss).toBeCloseTo(500, 6);
    expect(size.capped).toBeTrue();
  });

  it('counts a stock held whose bad case is not known as one in between', () => {
    // The stock held, the new one and one more to make three: a third each.
    expect(sizeOfNew(MIDDLE, worth10000([{symbol: 'XXX', value: 5000}]), F).dollars).toBeCloseTo(3333.33, 2);
  });

  it('does not depend on how much of the portfolio is cash', () => {
    const allCash = worth10000([]);
    expect(sizeOfNew(MIDDLE, allCash, F).dollars).toBeCloseTo(3333.33, 2);
  });
});

describe('additions (what can still be added to the stocks held that are marked DIP BUY)', () => {
  /** AAA beside two stocks in between that are above their share. `cases: 'none'`: AAA is not marked DIP BUY now. */
  const held = (aaa: number, o: { cases?: TestedCases | 'none', limitPercent?: number } = {}) => worth10000([
    {symbol: 'AAA', value: aaa, cases: o.cases === 'none' ? undefined : o.cases ?? CALM},
    {symbol: 'BBB', value: 4500, cases: MIDDLE}, {symbol: 'CCC', value: 4500, cases: MIDDLE},
  ], o.limitPercent);

  it('is what a stock is short of its equal share of the risk, and nothing for one that is at or above it', () => {
    // AAA is calm: its share is 31 / 79 of the portfolio, $3,924. It holds $1,000 of that.
    const result = additions(held(1000), F);
    expect(result.map(it => it.symbol)).toEqual(['AAA']);
    expect(result[0].dollars).toBeCloseTo(2924.05, 2);
    expect(result[0].sharePercent).toBeCloseTo(29.24, 2);
    expect(result[0].loss).withContext('24% of what is added').toBeCloseTo(701.77, 2);
    expect(result[0].gain).withContext('41% of what is added').toBeCloseTo(1198.86, 2);
  });

  it('offers nothing while less than a tenth of the stock\'s share is still free', () => {
    expect(additions(held(3600), F)).toEqual([]);
    expect(additions(held(3500), F).map(it => it.symbol)).toEqual(['AAA']);
  });

  it('offers nothing for a stock that is not marked DIP BUY now: the tests say nothing about its bad case', () => {
    expect(additions(held(1000, {cases: 'none'}), F)).toEqual([]);
  });

  it('stops at what fits the limit', () => {
    // A limit of 5% ($500): of a calm stock $2,083 fits, less than its equal share of the risk.
    const result = additions(held(1000, {limitPercent: 5}), F);
    expect(result[0].dollars).toBeCloseTo(1083.33, 2);
    expect(result[0].capped).toBeTrue();
  });
});

describe('recommend (every stock marked DIP BUY that the portfolio does not hold, each with its size)', () => {
  it('lists them from A to Z, which is no order of merit', () => {
    const result = recommend([{symbol: 'ZED', cases: MIDDLE}, {symbol: 'ACME', cases: VOLATILE}], worth10000([]), F);
    expect(result.map(it => it.symbol)).toEqual(['ACME', 'ZED']);
    expect(result[1].size!.dollars).toBeCloseTo(3333.33, 2);
    expect(result[0].cases).toEqual(VOLATILE);
  });

  it('lists them without a size while the portfolio is worth nothing: there is nothing to take a share of', () => {
    expect(recommend([{symbol: 'ACME', cases: VOLATILE}], undefined, F)).toEqual([{symbol: 'ACME', cases: VOLATILE}]);
  });
});

describe('shareText, sizeLabel and addLabel (a size in words)', () => {
  // A whole percent did not seem to agree with the dollars beside it: "9% $3,400" in a portfolio worth $40,000,
  // where the share is 8.5%. One decimal, as in the "% of total" column of what you own.
  // (Made-up amounts: the repository is shared, so no figure of a real account is written into it.)
  it('says a share to one decimal, so that it agrees with the dollars beside it', () => {
    expect([20.13, 20.5, 0.6, 99.6, 8.5, 11.02, 25].map(shareText)).toEqual(['20.1%', '20.5%', '0.6%', '99.6%', '8.5%', '11.0%', '25.0%']);
    expect(3400 / 40_000 * 100).withContext('the share behind "9% $3,400"').toBeCloseTo(8.5, 3);
  });

  it('says "under 0.1%" for a share too small to show', () => {
    expect([0.05, 0.049, 0.01].map(shareText)).toEqual(['0.1%', 'under 0.1%', 'under 0.1%']);
  });

  it('says the share first and the dollars second', () => {
    const size = {sharePercent: 20.13, dollars: 2012.99, loss: 825.32, gain: 1711.04, capped: false};
    expect(sizeLabel(size)).toBe('20.1% ($2,013)');
    expect(addLabel(size)).toBe('add 20.1% ($2,013)');
  });
});

/** 80 daily closes from a repeating cycle of daily returns. */
function closesFrom(cycle: number[], start = 100): number[] {
  const closes = [start];
  for (let i = 0; i < 79; i++) {
    closes.push(closes[closes.length - 1] * (1 + cycle[i % cycle.length]));
  }
  return closes;
}

const CYCLE = [0.01, -0.02, 0.03, 0, -0.01];
const OTHER_CYCLE = [0.02, 0.01, -0.01, -0.02, 0];

describe('fitOf (what the portfolio already holds that is like the stock: facts, not a reason to pick it)', () => {
  const held = [
    makeStock({symbol: 'AAA', sector: 'Technology', closes: closesFrom(CYCLE)}),
    makeStock({symbol: 'BBB', sector: 'Technology', closes: closesFrom(CYCLE, 40)}),
    makeStock({symbol: 'CCC', sector: 'Utilities', closes: closesFrom(CYCLE, 15)}),
  ];

  it('counts the stocks held in its sector and says how closely its price has moved with theirs', () => {
    const fit = fitOf(makeStock({symbol: 'NEW', sector: 'Technology', closes: closesFrom(CYCLE, 70)}), held)!;
    expect(fit.holdings).toBe(3);
    expect(fit.sector).toBe('Technology');
    expect(fit.sameSector).toBe(2);
    expect(fit.tied).toBeCloseTo(1, 6);
    expect(fit.recent).toBeCloseTo(1, 6);
    expect(fit.close).toBeTrue();
    expect(fitBrief(fit)).toEqual({
      sector: 'Technology (2)', moves: 'closely',
      tip: 'How closely its price has moved with your stocks: 1.00 over the past year, 1.00 over the last month (0 = not at all, 1 = exactly together).',
    });
  });

  it('says so when nothing held is in its sector, and says "not closely" when it moves differently', () => {
    const fit = fitOf(makeStock({symbol: 'NEW', sector: 'Energy', closes: closesFrom(OTHER_CYCLE)}), held)!;
    expect(fit.sameSector).toBe(0);
    expect(fit.close).toBeFalse();
    expect(fitBrief(fit).sector).toBe('Energy (none)');
    expect(fitBrief(fit).moves).toBe('not closely');
    expect(fitBrief(fit).tip).toMatch(
      /^How closely its price has moved with your stocks: -?0\.\d\d over the past year, -?0\.\d\d over the last month \(0 = not at all, 1 = exactly together\)\.$/);
  });

  it('says one stock in the singular', () => {
    const fit = fitOf(makeStock({symbol: 'NEW', sector: 'Utilities'}), held)!;
    expect(fitBrief(fit).sector).toBe('Utilities (1)');
  });

  it('has nothing to say for an empty portfolio, or about a stock the page knows too little of', () => {
    expect(fitOf(makeStock({symbol: 'NEW', sector: 'Energy'}), [])).toBeUndefined();
    expect(fitBrief(undefined)).toEqual({sector: '', moves: '', tip: ''});
    // No sector on record and no price history in common with what is held.
    expect(fitBrief(fitOf(makeStock({symbol: 'NEW', sector: ''}), [makeStock({symbol: 'AAA'})]))).toEqual({sector: '', moves: '', tip: ''});
  });
});

/**
 * The sell side of a rebalance. The plan has one reason to sell, and the box no other: a stock whose tested bad
 * half-year would cost more than the user's own limit (SELL SOME). The money that selling it down to the limit
 * would free can be counted in the split of the cash, if the user says so.
 */
describe('toSell, afterSelling and sellNote (what the plan says to sell some of, and what that would free)', () => {
  // Worth $10,000 with a limit of 5%: $500 may be lost on one stock. $3,000 of a volatile stock could lose $1,230.
  const tooBig = worth10000([
    {symbol: 'ACME', value: 3000, cases: VOLATILE}, {symbol: 'BBB', value: 1000, cases: MIDDLE}, {symbol: 'FUND', value: 2000},
  ], 5);

  it('finds the stock that could lose more than the limit: what fits it, and what selling down to that frees', () => {
    const [acme, ...rest] = toSell(tooBig);
    expect(rest).withContext('the others are within the limit, or have no tested bad case').toEqual([]);
    expect(acme.symbol).toBe('ACME');
    expect(acme.keep).withContext('$500 is 41% of it').toBeCloseTo(1219.51, 2);
    expect(acme.free).toBeCloseTo(1780.49, 2);
  });

  it('leaves alone a stock that is over the limit by a tenth or less, as the plan does', () => {
    // 41% of $1,300 is $533: over $500, but by less than a tenth of it.
    expect(toSell(worth10000([{symbol: 'ACME', value: 1300, cases: VOLATILE}], 5))).toEqual([]);
    expect(toSell(worth10000([{symbol: 'ACME', value: 1400, cases: VOLATILE}], 5)).map(it => it.symbol)).toEqual(['ACME']);
  });

  it('has nothing to sell for a portfolio that is worth nothing, or within its limit', () => {
    expect(toSell(undefined)).toEqual([]);
    expect(toSell(worth10000([{symbol: 'ACME', value: 3000, cases: VOLATILE}]))).withContext('a limit of 20%').toEqual([]);
  });

  it('gives the portfolio as it would be after those sales: the stock at what is kept, the worth the same', () => {
    const after = afterSelling(tooBig, toSell(tooBig));
    expect(after.portfolioValue).toBe(10_000);
    expect(after.limitPercent).toBe(5);
    expect(after.holdings.map(it => [it.symbol, Math.round(it.value)])).toEqual([['ACME', 1220], ['BBB', 1000], ['FUND', 2000]]);
    expect(tooBig.holdings[0].value).withContext('the portfolio handed in is left as it was').toBe(3000);
  });

  it('says that the plan asks to sell nothing, or what it asks to sell and what that would free', () => {
    // Only a stock marked DIP BUY has a tested bad case, and a stock may be over the limit by a tenth before the
    // plan names it: the sentence says what the plan asks, with that tenth in it, and not that no stock held could
    // lose more than the limit.
    expect(sellNote([])).toBe(
      'The plan asks you to sell nothing today. Its one reason to sell is a stock marked DIP BUY that could lose over a tenth more ' +
      'than your limit in a bad half-year, and it names none of yours.');
    expect(sellNote([{symbol: 'ACME', keep: 1219.51, free: 1780.49}])).toBe(
      'The plan says SELL SOME: selling ACME down to $1,220 would free $1,780.');
    expect(sellNote([{symbol: 'ACME', keep: 1219.51, free: 1780.49}, {symbol: 'ZED', keep: 1612.9, free: 400}])).toBe(
      'The plan says SELL SOME: selling ACME down to $1,220 and ZED down to $1,613 would free $2,180 in all.');
    const three = [{symbol: 'AAA', keep: 1000, free: 100}, {symbol: 'BBB', keep: 2000, free: 200}, {symbol: 'CCC', keep: 3000, free: 300}];
    expect(sellNote(three)).toBe(
      'The plan says SELL SOME: selling AAA down to $1,000, BBB down to $2,000 and CCC down to $3,000 would free $600 in all.');
    expect(COUNT_SOLD).toBe('Count that money in the split');
  });

  // The owner: "too much text and not much signal". Above the table the sale is a figure with its name, beside the
  // box that counts it; the sentence that names the stocks is where the pointer rests, and with the explanations.
  it('gives what the sale would free as a figure with its name, and the sentence as what the pointer shows', () => {
    expect(sellFact([])).withContext('nothing to sell: nothing to show').toBeUndefined();
    expect(sellFact([{symbol: 'ACME', keep: 1219.51, free: 1780.49}])).toEqual({
      label: 'SELL SOME would free', value: '$1,780', tip: 'The plan says SELL SOME: selling ACME down to $1,220 would free $1,780.',
    });
    expect(sellFact([{symbol: 'ACME', keep: 1219.51, free: 1780.49}, {symbol: 'ZED', keep: 1612.9, free: 400}])!.value).toBe('$2,180');
  });
});

describe('whereItFits (one stock marked DIP BUY, a line for each portfolio)', () => {
  const size = {sharePercent: 20.13, dollars: 2012.99, loss: 825.32, gain: 1711.04, capped: false};
  const room = {sharePercent: 8.4, dollars: 840, loss: 201.6, gain: 344.4, capped: false};

  it('says the size where the stock is not held, and what can be added where it is', () => {
    const lines = whereItFits('ACME', [
      {name: 'Brokerage', held: [], recommendations: [{symbol: 'ACME', cases: VOLATILE, size}], additions: []},
      {name: 'Retirement', held: ['ACME'], recommendations: [], additions: [{symbol: 'ACME', ...room}]},
      {name: 'Savings', held: ['ACME'], recommendations: [], additions: []},
    ]);
    expect(lines).toEqual([
      'Brokerage: 20.1% ($2,013)',
      'Retirement: you own it; add 8.4% ($840)',
      'Savings: you own it, and it is at its share',
    ]);
  });

  it('leaves out a portfolio that is worth nothing yet, and says nothing for a stock that is not marked DIP BUY', () => {
    expect(whereItFits('ACME', [{name: 'Brokerage', held: [], recommendations: [{symbol: 'ACME', cases: VOLATILE}], additions: []}])).toEqual([]);
    expect(whereItFits('OTHER', [{name: 'Brokerage', held: [], recommendations: [{symbol: 'ACME', cases: VOLATILE, size}], additions: []}])).toEqual([]);
  });
});

describe('the sentences of the "Could add" box', () => {
  // A long list of rows, each a good part of the portfolio, reads as "buy all of them", which can be more than the
  // whole portfolio. A size is worked out for that one stock joining what is held now; the last sentence says so
  // before the table is read.
  // "They are in no order" stood here until the owner asked for every table to be sortable (2026-11-26): the
  // reader may now order the rows, so the sentence says what stays true, that the page ranks none of them.
  it('says above the table which stocks these are, that the page ranks none of them, and that each size stands alone', () => {
    expect(couldAddLead(3, 'Brokerage')).toBe(
      '3 stocks are marked DIP BUY on the Watchlist (the price dropped while the business keeps growing) and are not in Brokerage yet. ' +
      'The page ranks none of them: the tests found no way to tell which will do best. ' +
      'Each size is for adding that one stock alone: once a stock is added, the others are sized again.');
    expect(couldAddLead(1, 'Brokerage')).withContext('one stock: no order and no other size to speak of').toBe(
      '1 stock is marked DIP BUY on the Watchlist (the price dropped while the business keeps growing) and is not in Brokerage yet.');
  });

  // The owner, of a page where every box began with a paragraph: "too much text and not much signal". Beside the
  // title stands what the paragraph's first sentence said, as a count and a few words; the paragraph itself is
  // with the explanations of the box, behind its one control.
  it('says beside the title how many stocks there are, whose they are not yet, and that they are not ranked', () => {
    expect(couldAddHeadline(3, 'Brokerage')).toBe('3 stocks marked DIP BUY, not in Brokerage yet · not ranked');
    expect(couldAddHeadline(1, 'Brokerage')).withContext('one stock: no order to speak of').toBe('1 stock marked DIP BUY, not in Brokerage yet');
    expect(couldAddHeadline(3, 'Brokerage', 2)).withContext('owned stocks that can be added to say so in their rows').toBe(couldAddHeadline(3, 'Brokerage'));
    expect(couldAddHeadline(0, 'Brokerage', 2)).toBe('Brokerage holds every stock marked DIP BUY · 2 could be added to');
    expect(couldAddHeadline(0, 'Brokerage', 1)).toBe('Brokerage holds every stock marked DIP BUY · 1 could be added to');
    expect(couldAddHeadline(0, 'Brokerage')).toBe('');
  });

  // The stocks that are owned, marked and under their share are rows of the same table, after the new ones, so
  // that they can be ticked too. Each such row says so itself ("held", "add 4.0%"): a sentence about them
  // above the table made a long lead longer and said nothing the rows do not.
  it('says nothing more above the table when stocks that are owned can be added to: their rows say it', () => {
    expect(couldAddLead(3, 'Brokerage', 2)).toBe(couldAddLead(3, 'Brokerage'));
    expect(couldAddLead(1, 'Brokerage', 1)).toBe(couldAddLead(1, 'Brokerage'));
  });

  it('says so when every marked stock is owned and some could be added to', () => {
    expect(couldAddLead(0, 'Brokerage', 2)).toBe(
      'Brokerage already holds every stock that is marked DIP BUY right now. 2 of them could be added to.');
    expect(couldAddLead(0, 'Brokerage', 1)).toBe(
      'Brokerage already holds every stock that is marked DIP BUY right now. One of them could be added to.');
  });

  it('says under the example what holds for every row, that the split was not tested, and when the cases were', () => {
    expect(sizeRules(F)).toBe(
      'A stock whose price swings more gets a smaller size. No size is more than fits your limit, and none depends on your cash. ' +
      'How to split money between stocks was not tested. Bad case and good case were tested in 2023–2026, when the market was ' +
      'rising; in a falling market it can be worse.');
  });

  it('says how to get sizes while the portfolio is worth nothing', () => {
    expect(NO_SIZE_NOTE).toBe(
      'This portfolio is worth nothing yet, so there is nothing to take a share of. Enter its cash in the "Your plan today" box to ' +
      'see a size for each.');
  });

  // The rows of the table are one line tall: the two cells say the finding in a word or two, and the two figures
  // behind "closely" show where the pointer rests. The note names the two columns, says what the number in brackets
  // is, what "closely" means and where the figures are.
  it('says that fit is a fact and not a reason to pick, what the brackets and "closely" mean, and where the figures are', () => {
    expect(FIT_NOTE).toBe(
      '"Sector (you own)" and "Moves with yours" say what you already own that is like the stock: its sector with, in brackets, ' +
      'how many of your stocks are in it, and whether its price has moved closely with theirs (0.5 or more, where 0 is not at ' +
      'all and 1 is exactly together). The figures for the past year and the last month show where the pointer rests on that ' +
      'cell. These are facts, not a tested reason to pick one.');
    expect([COLUMNS.sector, COLUMNS.moves]).toEqual(['Sector (you own)', 'Moves with yours']);
  });

  // Two short cells in place of a sentence a row: the sectors stand one under the other, and so do the "closely".
  it('says a stock\'s fit in two short cells: its sector with how many are owned in it, and "closely" when it moves with them', () => {
    const base = {holdings: 3, sector: 'Technology', sameSector: 2};
    expect(fitBrief({...base, tied: 0.61, recent: 0.7, close: true})).toEqual({
      sector: 'Technology (2)', moves: 'closely',
      tip: 'How closely its price has moved with your stocks: 0.61 over the past year, 0.70 over the last month (0 = not at all, 1 = exactly together).',
    });
    expect(fitBrief({holdings: 3, sector: 'Energy', sameSector: 0, tied: 0.31, recent: 0.2, close: false})).withContext('known, and not closely')
      .toEqual({
        sector: 'Energy (none)', moves: 'not closely',
        tip: 'How closely its price has moved with your stocks: 0.31 over the past year, 0.20 over the last month (0 = not at all, 1 = exactly together).',
      });
    expect(fitBrief({...base, tied: 0.55, close: true}).tip).withContext('too few days for the last month')
      .toBe('How closely its price has moved with your stocks: 0.55 over the past year (0 = not at all, 1 = exactly together).');
  });

  it('has nothing to say about fit for an empty portfolio, or about a stock the page knows too little of', () => {
    expect(fitBrief(undefined)).toEqual({sector: '', moves: '', tip: ''});
    // Blank means "not known" (no prices to compare), never "not closely": a reader could not tell the two apart.
    expect(fitBrief({holdings: 1, sameSector: 0, close: false})).toEqual({sector: '', moves: '', tip: ''});
    const noSector = fitBrief({holdings: 3, sameSector: 0, tied: 0.7, close: true});
    expect([noSector.sector, noSector.moves]).withContext('no sector on record').toEqual(['', 'closely']);
  });

  it('says why there is nothing to add', () => {
    expect(nothingToAdd(0)).toBe('No stock on the Watchlist is marked DIP BUY right now, so there is nothing to add.');
    expect(nothingToAdd(4)).toBe('This portfolio already holds every stock that is marked DIP BUY right now.');
  });

  it('says where each number of a row comes from', () => {
    const size = {sharePercent: 20.13, dollars: 2012.99, loss: 825.32, gain: 1711.04, capped: false};
    expect(sizeTip(size)).toBe('An equal share of the risk in this portfolio.');
    expect(sizeTip({...size, capped: true})).toBe('Made smaller so that it fits your limit: an equal share of the risk would be more.');
    expect(badCaseTip(VOLATILE)).toBe(
      'In tests, 1 in 10 stocks like this lost 41% or more after 6 months. At this size that would be the amount shown.');
    expect(goodCaseTip(MIDDLE)).toBe(
      'In tests, 1 in 10 stocks like this gained 56% or more after 6 months. The typical one ended at −0.1%.');
  });
});

/**
 * The owner of the page could not tell from the table what a size was, nor what the two cases were: one paragraph
 * of definitions under it had not done it. So the box works its first row out in words, a line under each of the
 * three numbers, with that row's own amounts.
 */
describe('readingOf (the first row of "Could add" worked out in words, a line for each of its numbers)', () => {
  const threeInBetween = worth10000([
    {symbol: 'AAA', value: 3000, cases: MIDDLE}, {symbol: 'BBB', value: 3000, cases: MIDDLE}, {symbol: 'CCC', value: 3000, cases: MIDDLE},
  ]);
  const first = (cases: TestedCases, input: SizingInput, symbol = 'ACME') => recommend([{symbol, cases}], input, F)[0];
  const lines = (cases: TestedCases, input: SizingInput, symbol = 'ACME') =>
    readingOf(first(cases, input, symbol), input, F)!.lines.map(it => it.text);

  it('is headed as an example, so that the first row is not taken for a pick', () => {
    expect(readingOf(first(VOLATILE, threeInBetween), threeInBetween, F)!.title).toBe('For example, the first row: ACME');
  });

  it('has a line for each number of the row, under the name of its column', () => {
    expect(readingOf(first(VOLATILE, threeInBetween), threeInBetween, F)!.lines.map(it => it.label)).toEqual(['Size', 'Bad case', 'Good case']);
  });

  it('says what the size is a share of, in an order that can be checked, and why it is that share', () => {
    // $2,013 / $10,000 = 20.1%. A volatile stock beside three in between: 31 / 154 of the portfolio.
    expect(lines(VOLATILE, threeInBetween)[0]).toBe(
      "$2,013 is 20.1% of what this portfolio is worth today ($10,000). With ACME it would hold 4 stocks; " +
      "this is ACME's share if a bad half-year were to cost the same on each of them.");
  });

  // What was measured is stocks marked DIP BUY that swing that much, not every stock that does: the sentence says so.
  it('says what the two cases are and what they come to at that size, with the typical result beside the good one', () => {
    const [, bad, good] = lines(VOLATILE, threeInBetween);
    // The limit is the most to lose on one stock ($2,000 here), not the most to hold of it: the size, $2,013, is more
    // than the limit and fits it all the same. Read side by side without that, the two looked like a contradiction.
    expect(bad).toBe('In tests, 1 in 10 stocks marked DIP BUY that swing as much as ACME lost 41% or more after 6 months. ' +
      'On $2,013 that is −$825, within the $2,000 you accept to lose on one stock.');
    // Whole dollars, as in the row: these are worked out from tests, not counted.
    expect(good).toBe('In the same tests, 1 in 10 gained 85% or more: +$1,711. The typical one ended at +2.4%: +$48.');
  });

  it('says a typical result that is a small loss as a loss', () => {
    // A third of $10,000: $3,333. The typical stock in between ended at −0.1%.
    expect(lines(MIDDLE, worth10000([]), 'ZED')[2]).toBe(
      'In the same tests, 1 in 10 gained 56% or more: +$1,867. The typical one ended at −0.1%: −$3.');
  });

  it('says so when the portfolio would hold fewer than three stocks: the size then counts three', () => {
    expect(lines(MIDDLE, worth10000([{symbol: 'XXX', value: 5000}]), 'ZED')[0]).toBe(
      "$3,333 is 33.3% of what this portfolio is worth today ($10,000). With ZED it would hold 2 stocks, but the tests held 3 or " +
      "more: this is ZED's share as one of 3, if a bad half-year were to cost the same on each.");
    expect(lines(MIDDLE, worth10000([]), 'ZED')[0]).toBe(
      "$3,333 is 33.3% of what this portfolio is worth today ($10,000). ZED would be its only stock, but the tests held 3 or " +
      "more: this is ZED's share as one of 3, if a bad half-year were to cost the same on each.");
  });

  it('says that the limit made it smaller, and what the limit is, when it did', () => {
    // Nothing held and a limit of 5% ($500): an equal share of the risk would be 27%, but only 12.2% fits.
    const capped = worth10000([], 5);
    expect(lines(VOLATILE, capped)[0]).toBe(
      '$1,220 is 12.2% of what this portfolio is worth today ($10,000). It is the most that fits your limit: at this size a bad ' +
      'half-year costs $500, the most you accept to lose on one stock. An equal share of the risk would be more.');
    expect(lines(VOLATILE, capped)[1]).toBe(
      'In tests, 1 in 10 stocks marked DIP BUY that swing as much as ACME lost 41% or more after 6 months. ' +
      'On $1,220 that is −$500, the most you accept to lose on one stock.');
  });

  it('has nothing to work out without a first row, or while the portfolio is worth nothing', () => {
    expect(readingOf(undefined, threeInBetween, F)).toBeUndefined();
    expect(readingOf({symbol: 'ACME', cases: VOLATILE}, undefined, F)).toBeUndefined();
    expect(readingOf({symbol: 'ACME', cases: VOLATILE}, threeInBetween, F)).withContext('a row without a size').toBeUndefined();
  });
});

/**
 * The sentences of the cash split: the user ticks stocks in "Could add", and the box says what the portfolio's cash
 * would buy of each and what the purchase would change. The amounts come from `cashSplit` (cash-split.ts); here
 * they are made up, in the shape it hands over.
 */
describe('the sentences of the cash split in "Could add"', () => {
  const part = (o: Partial<SplitPart> = {}): SplitPart =>
    ({symbol: 'ACME', owned: false, gap: 2012.99, dollars: 1000, bound: 'cash', loss: 410, gain: 850, ...o});
  /** One stock ticked in a portfolio of three: $1,000 of cash against a gap of $2,013. */
  const split = (o: Partial<CashSplit> = {}): CashSplit => ({
    parts: [part()], cash: 1000, gap: 2012.99, placed: 1000, left: 0,
    stocksBefore: 3, stocksAfter: 4, togetherLossBefore: 2790, togetherLossAfter: 3200, ...o,
  });
  const three = [part({symbol: 'AAA'}), part({symbol: 'BBB'}), part({symbol: 'CCC'})];
  const ONE_SHORT = 'The one you ticked is $2,013 short of its share. Your $1,000 covers a part of that.';
  const CASH_SOURCE = 'The cash is what you entered under "Cash" in the "Your plan today" box.';
  const BAD_CASE = 'A bad half-year for every marked stock at once: −$2,790 today, −$3,200 after. ' +
    'More of your money would be in stocks, and cash cannot fall.';

  // With what selling would free counted, the money is no longer the cash alone, and a portfolio may have no cash
  // at all: the column and the heading over the lines then have another name.
  it('names the column of the second amount: by the cash, or by the money once what selling would free is counted', () => {
    expect(COLUMNS.cash).toBe('With your cash');
    expect(COLUMNS.money).toBe('With the money');
  });

  // The one sentence the box keeps in sight: an instruction, starting with what to do.
  it('says in one short instruction that ticking is the way in, and how much cash there is to split', () => {
    expect(tickHint(1000)).toBe('Tick stocks to split your cash ($1,000) between them.');
  });

  it('says where to enter the cash when the portfolio has none', () => {
    const none = 'No cash to split yet: enter it in the "Your plan today" box, under "Cash".';
    expect(tickHint(undefined)).toBe(none);
    expect(tickHint(0)).toBe(none);
  });

  it('says in the hint that what selling would free is split too, once that is counted', () => {
    expect(tickHint(4000, 1780.49)).toBe('Tick stocks to split your cash and what selling would free ($5,780) between them.');
    const freedOnly = 'Tick stocks to split what selling would free ($1,780) between them.';
    expect(tickHint(0, 1780.49)).toBe(freedOnly);
    expect(tickHint(undefined, 1780.49)).toBe(freedOnly);
  });

  // "There is nothing to split yet" over a box that offers money to split would not be the whole truth.
  it('names the other way to have something to split, when the plan says to sell some of a stock and that is not counted', () => {
    expect(tickHint(0, 0, true)).toBe(
      'No cash to split yet: enter it in the "Your plan today" box, under "Cash", or tick "Count that money in the split".');
    expect(tickHint(1000, 0, true)).withContext('with cash there is something to split: the hint stays as it is').toBe(tickHint(1000));
    expect(splitLines(split({parts: three, cash: 0, gap: 13896, placed: 0, stocksAfter: 3, togetherLossAfter: 2790}), {offered: true})).toEqual([
      'You ticked 3, but this portfolio has no cash to split. Enter it in the "Your plan today" box, under "Cash", ' +
      'or tick "Count that money in the split".',
    ]);
  });

  // Found by a review of the page: a ticked row carried three dollar amounts ("9.0% $3,000" under Size, then
  // "$1,400 of $2,600"), and the sentence about "the amount after 'of'" was the hardest on the page. A ticked row
  // now shows one amount, what the money would buy of that stock. What it is measured against is said in words:
  // in the lines under the table, and where the pointer rests on the amount.
  it('says in a ticked row what the money gives the stock, and no second amount beside it', () => {
    expect([splitCell(part()).amount, splitCell(part()).note]).toEqual(['$1,000', '']);
    const whole = splitCell(part({dollars: 2012.99, bound: 'share'}));
    expect([whole.amount, whole.note]).withContext('all it is short of').toEqual(['$2,013', '']);
    // No money to split: a bold "$0" would read as an amount to act on. A dash and two words, like a stock that is
    // at its share.
    const nothing = splitCell(part({dollars: 0}));
    expect([nothing.amount, nothing.note]).withContext('no money at all').toEqual(['—', 'nothing to split']);
  });

  it('says where the pointer rests what the amount is measured against, with the amount that stood beside it', () => {
    expect(splitCell(part()).tip).toBe(
      'It is $2,013 short of its share with the stocks you ticked in the portfolio. This covers a part of that, ' +
      'the same part for every stock you ticked.');
    expect(splitCell(part({dollars: 2012.99, bound: 'share'})).tip).toBe(
      'This is all it is short of its share with the stocks you ticked in the portfolio.');
    expect(splitCell(part({gap: 1219.51, dollars: 1219.51, bound: 'limit'})).tip).withContext('held back by the limit: the row says so under "Size"')
      .toBe('This is all it is short of its share with the stocks you ticked in the portfolio. Your limit holds that share back.');
    expect(splitCell(part({dollars: 0})).tip).withContext('no money at all')
      .toBe('It is $2,013 short of its share with the stocks you ticked in the portfolio, and there is no money to split.');
    expect(splitCell(part({gap: 3000.2, dollars: 2999.9})).tip).withContext('a part by cents: the two print the same')
      .toBe('This is all it is short of its share with the stocks you ticked in the portfolio.');
  });

  it('says what the columns of a row\'s numbers are, for a heading that is pointed at or reached with the Tab key', () => {
    expect(COLUMN_HELP).toEqual({
      size: 'What the stock would get if it were the only one you add: a share of what this portfolio is worth, and that share in dollars.',
      bad: 'What that size would lose in a bad half-year: in tests, 1 in 10 stocks like it lost that much or more after 6 months.',
      good: 'What that size would gain in a good half-year: in tests, 1 in 10 stocks like it gained that much or more after 6 months.',
      cash: 'What the money to split would buy of each stock you ticked. A stock you did not tick shows nothing here.',
      // Found by a review: these two headings said nothing where the pointer rests. What they say is the note's.
      sector: 'The stock\'s sector and, in brackets, how many of your stocks are in it. A fact, not a tested reason to pick one.',
      moves: 'Whether its price has moved closely with your stocks over the past year (0.5 or more, where 0 is not at all and 1 is ' +
        'exactly together). The two figures show where the pointer rests on a cell. A fact, not a tested reason to pick one.',
    });
  });

  it('gives a reason, not a bare zero, for a ticked stock that gets nothing, and the whole of it where the pointer rests', () => {
    expect(splitCell(part({gap: 0, dollars: 0, bound: 'none'}))).toEqual({
      amount: '—', note: 'at its share',
      tip: 'With the stocks you ticked in the portfolio its share is smaller, and you hold that much of it already.',
    });
  });

  it('says what one ticked stock is short of and that the cash covers a part, then what the purchase changes', () => {
    expect(splitLines(split())).toEqual([ONE_SHORT, 'You would hold 4 stocks instead of 3.', BAD_CASE, CASH_SOURCE]);
  });

  // The owner: "too much text and not much signal". What a tick answers stands beside the lead as figures with
  // their names; each keeps its sentence for the pointer, and the sentences stay with the box's explanations.
  describe('splitFacts (the answer to a tick as labelled figures)', () => {
    it('gives what the ticked stock is short of, the cash, the stocks held and the bad half-year, each with its sentence', () => {
      expect(splitFacts(split())).toEqual({
        instead: '',
        facts: [
          // Not "short of its share": beside a stock, "shares" reads as shares of stock (found by a review).
          {label: 'Room for the one ticked', value: '$2,013', tip: ONE_SHORT},
          {label: 'Cash to split', value: '$1,000', tip: CASH_SOURCE},
          {label: 'Stocks held', value: '3 today, 4 after', tip: 'You would hold 4 stocks instead of 3.'},
          {label: 'Bad half-year, every marked stock at once', value: '−$2,790 today, −$3,200 after', tip: BAD_CASE},
        ],
      });
    });

    it('names the figure for several, and says what stays cash when the cash covers everything', () => {
      const facts = splitFacts(split({parts: three, cash: 20000, gap: 13896, placed: 13896, left: 6104, stocksAfter: 6})).facts;
      expect(facts.map(it => [it.label, it.value])).toEqual([
        ['Room for the 3 ticked', '$13,896'], ['Cash to split', '$20,000'], ['Stays cash', '$6,104'],
        ['Stocks held', '3 today, 6 after'], ['Bad half-year, every marked stock at once', '−$2,790 today, −$3,200 after'],
      ]);
      expect(splitFacts(split({parts: three, cash: 13896, gap: 13896, placed: 13896, left: 0})).facts.map(it => it.label))
        .withContext('nothing over: no figure for it').not.toContain('Stays cash');
    });

    it('leaves out the stocks held when that does not change, and gives one number for a portfolio that held none', () => {
      expect(splitFacts(split({stocksBefore: 3, stocksAfter: 3})).facts.map(it => it.label)).not.toContain('Stocks held');
      expect(splitFacts(split({stocksBefore: 0, stocksAfter: 4})).facts.find(it => it.label === 'Stocks held')!.value).toBe('4 after');
    });

    it('names the money by what it is once what selling would free is counted', () => {
      const withSale = splitFacts(split({cash: 5780.49, gap: 9000, placed: 5780.49}), {freed: 1780.49, cash: 4000}).facts;
      expect(withSale.map(it => [it.label, it.value]).slice(0, 2)).toEqual([['Room for the one ticked', '$9,000'], ['Cash and sale money to split', '$5,780']]);
      expect(withSale[withSale.length - 1].value).withContext('after is after selling and buying').toBe('−$2,790 today, −$3,200 after selling and buying');
      const saleOnly = splitFacts(split({cash: 1780.49, gap: 9000, placed: 1780.49}), {freed: 1780.49, cash: 0}).facts;
      expect(saleOnly[1].label).toBe('Sale money to split');
      const over = splitFacts(split({cash: 5780.49, gap: 2012.99, placed: 2012.99, left: 3767.5}), {freed: 1780.49, cash: 4000}).facts;
      expect(over.map(it => [it.label, it.value])[2]).withContext('not all of it is cash today').toEqual(['Would be left as cash', '$3,768']);
    });

    it('says for a portfolio with no marked stock yet what the purchase itself could lose', () => {
      const first = splitFacts(split({togetherLossBefore: 0, togetherLossAfter: 410})).facts;
      expect([first[first.length - 1].label, first[first.length - 1].value]).toEqual(['Bad half-year, what you would buy', '−$410']);
    });

    // An owned stock ticked beside new ones is often at its share already: the figure counts the ones with room.
    it('names the figure by the ticked stocks that have room, when some are at their share already', () => {
      const atShare = part({symbol: 'CCC', owned: true, gap: 0, dollars: 0, bound: 'none', loss: 0, gain: 0});
      const facts = splitFacts(split({parts: [part(), part({symbol: 'BBB'}), atShare], cash: 8000, gap: 13896, placed: 8000, stocksAfter: 5})).facts;
      expect([facts[0].label, facts[0].value]).toEqual(['Room for 2 of the 3 ticked', '$13,896']);
    });

    // Which of the ticked stocks moved together is a fact about them, so it stands with the figures: the stocks
    // and their group, and the sentence where the pointer rests.
    it('gives which of the ticked stocks moved together as one more figure, with its sentence', () => {
      const tied = {groups: [{letter: 'A', index: 0, symbols: ['AAA', 'BBB', 'CCC'], level: 0.7, sector: ''}], alone: ['DDD'], unknown: []};
      expect(tiedFact(['AAA', 'BBB', 'DDD'], tied)).toEqual({
        label: 'Moved together', value: 'AAA and BBB (group A)',
        tip: 'AAA and BBB are both in group A: over the past year they moved closely together.',
      });
      expect(tiedFact(['AAA', 'DDD'], tied)).toEqual({
        label: 'Moved together', value: 'none of the 2', tip: 'None of the 2 you ticked moved closely with another of them over the past year.',
      });
      expect(tiedFact(['AAA'], tied)).withContext('one stock has no other to move with').toBeUndefined();
      expect(tiedFact(['AAA', 'BBB'], {groups: [], alone: [], unknown: []})).withContext('no groups on the page').toBeUndefined();
    });

    // Where the sentences had one line that said why nothing is split, that line is the answer: no figures.
    it('gives the one sentence in place of figures when nothing is split, or nothing is short', () => {
      expect(splitFacts(split({parts: three, cash: 0, gap: 13896, placed: 0, stocksAfter: 3, togetherLossAfter: 2790}))).toEqual({
        facts: [], instead: 'You ticked 3, but this portfolio has no cash to split. Enter it in the "Your plan today" box, under "Cash".',
      });
      const none = part({gap: 0, dollars: 0, bound: 'none', loss: 0, gain: 0});
      expect(splitFacts(split({parts: [none], gap: 0, placed: 0, left: 1000, stocksAfter: 3, togetherLossAfter: 2790}))).toEqual({
        facts: [], instead: 'The one you ticked is at its share already, so none of your $1,000 goes to it.',
      });
    });
  });

  it('says for several that each gets the same part of what it is short of', () => {
    expect(splitLines(split({parts: three, cash: 8000, gap: 13896, placed: 8000, stocksAfter: 6}))[0]).toBe(
      'The 3 you ticked are $13,896 short of their shares. Your $8,000 covers a part of that, the same part for each.');
  });

  it('says what stays cash when the cash covers everything', () => {
    expect(splitLines(split({parts: three, cash: 20000, gap: 13896, placed: 13896, left: 6104}))[0]).toBe(
      'The 3 you ticked are $13,896 short of their shares. Your $20,000 covers all of it, and $6,104 stays cash.');
    expect(splitLines(split({parts: three, cash: 13896, gap: 13896, placed: 13896, left: 0}))[0]).toBe(
      'The 3 you ticked are $13,896 short of their shares. Your $13,896 covers all of it.');
  });

  it('says only that there is no cash to split, and where to enter it, when there is none', () => {
    expect(splitLines(split({parts: three, cash: 0, gap: 13896, placed: 0, stocksAfter: 3, togetherLossAfter: 2790}))).toEqual([
      'You ticked 3, but this portfolio has no cash to split. Enter it in the "Your plan today" box, under "Cash".',
    ]);
  });

  it('says that the ticked stocks are at their shares when nothing is short', () => {
    const none = part({gap: 0, dollars: 0, bound: 'none', loss: 0, gain: 0});
    expect(splitLines(split({parts: [none, none, none], gap: 0, placed: 0, left: 1000, stocksAfter: 3, togetherLossAfter: 2790}))).toEqual([
      'The 3 you ticked are at their shares already, so none of your $1,000 goes to them.',
      CASH_SOURCE,
    ]);
    expect(splitLines(split({parts: [none], gap: 0, placed: 0, left: 1000, stocksAfter: 3, togetherLossAfter: 2790}))[0]).toBe(
      'The one you ticked is at its share already, so none of your $1,000 goes to it.');
  });

  it('says how many stocks the portfolio would hold only when that changes', () => {
    const lines = (o: Partial<CashSplit>) => splitLines(split(o));
    expect(lines({stocksBefore: 3, stocksAfter: 3})).withContext('more of what is owned').toEqual([ONE_SHORT, BAD_CASE, CASH_SOURCE]);
    expect(lines({stocksBefore: 0, stocksAfter: 4})[1]).toBe('You would hold 4 stocks.');
    expect(lines({stocksBefore: 3, stocksAfter: 5})[1]).toBe('You would hold 5 stocks instead of 3.');
  });

  // The plan says how many to hold, by its own count of the stocks it covers ("HOW MANY", and a sentence in "What
  // you own"). The box counts every priced holding, a fund without a mark included, so it does not quote that test:
  // it would say "three" for a purchase after which the plan still says the portfolio is short of three.
  it('does not quote the test of how many: the plan does, by its own count', () => {
    [[2, 3], [1, 4], [0, 3], [3, 5]].forEach(([stocksBefore, stocksAfter]) => {
      const lines = splitLines(split({stocksBefore, stocksAfter}));
      expect(lines.some(line => line.startsWith('In tests'))).withContext(`${stocksBefore} to ${stocksAfter}`).toBeFalse();
      expect(lines.length).toBe(4);
    });
  });

  // An owned stock ticked beside new ones is often at its share already. The line then said "The 3 you ticked are
  // short", and "the same part for each", with one row beside it saying "at its share".
  it('counts in its first line only the ticked stocks that are short of something, and says where the others stand', () => {
    const atShare = part({symbol: 'CCC', owned: true, gap: 0, dollars: 0, bound: 'none', loss: 0, gain: 0});
    expect(splitLines(split({parts: [part(), part({symbol: 'BBB'}), atShare], cash: 8000, gap: 13896, placed: 8000, stocksAfter: 5}))[0]).toBe(
      '2 of the 3 you ticked are $13,896 short of their shares; the other is at its share already. ' +
      'Your $8,000 covers a part of that, the same part for each of the 2.');
    expect(splitLines(split({parts: [part(), atShare, {...atShare, symbol: 'DDD'}]}))[0]).toBe(
      '1 of the 3 you ticked is $2,013 short of its share; the other 2 are at their shares already. Your $1,000 covers a part of that.');
    expect(splitLines(split({parts: [part({dollars: 2012.99, bound: 'share'}), atShare], cash: 3000, placed: 2012.99, left: 987.01}))[0]).toBe(
      '1 of the 2 you ticked is $2,013 short of its share; the other is at its share already. ' +
      'Your $3,000 covers all of it, and $987 stays cash.');
  });

  // "20.1% $2,013" under Size and "$1,590" beside it, under a line that says the money covers all of it: two amounts
  // for one stock. With more stocks in the portfolio a share is usually smaller than the size of a stock that is
  // added alone. Not always: a size the limit holds back stays the same amount, and beside fewer than two other
  // stocks a share can come out larger. So the line is told what each row shows under "Size", and says why only
  // where the money covers everything and an amount is still less than that. (When the money covers a part, that
  // is why an amount is less, and the first line says so.)
  it('says why an amount is less than "Size" although the money covers all of it, and only then', () => {
    const smaller = `With the others you ticked in the portfolio a stock's share is smaller than alone: that is why an amount ` +
      `can be less than the stock's "Size".`;
    // Three ticked, each $2,013 short of its share, and $8,000 to split: every one gets all it is short of.
    const whole = (symbol: string) => part({symbol, dollars: 2012.99, bound: 'share'});
    const ticked = split({parts: [whole('AAA'), whole('BBB'), whole('CCC')], cash: 8000, gap: 6038.97, placed: 6038.97, left: 1961.03, stocksAfter: 6});
    const said = (alone: Record<string, number>) => splitLines(ticked, {alone});
    expect(said({AAA: 2500, BBB: 2500, CCC: 2500})[1]).withContext('every one is less than its size alone').toBe(smaller);
    expect(said({AAA: 2500, BBB: 2012.99, CCC: 1800})[1]).withContext('one less, one the same, one more').toBe(smaller);
    expect(said({AAA: 2012.99, BBB: 2012.99, CCC: 2012.99}).length).withContext('the limit holds every size: the same amounts').toBe(4);
    expect(said({AAA: 2013.4, BBB: 2013.4, CCC: 2013.4}).length).withContext('less by cents: the same as printed').toBe(4);
    expect(said({AAA: 1800, BBB: 1800, CCC: 1800}).length).withContext('every one is more: nothing is less').toBe(4);
    expect(splitLines(ticked).length).withContext('not told the sizes: it claims nothing').toBe(4);
    const short = split({parts: three, cash: 8000, gap: 13896, placed: 8000, stocksAfter: 6});
    expect(splitLines(short, {alone: {AAA: 2500, BBB: 2500, CCC: 2500}}).length)
      .withContext('the money covers a part: the first line says why the amounts are less').toBe(4);
    expect(splitLines(split({parts: [whole('ACME')], cash: 3000, placed: 2012.99, left: 987.01}), {alone: {ACME: 2500}}).length)
      .withContext('one stock ticked: no others in the portfolio').toBe(4);
  });

  it('no longer speaks of an amount after "of": a row shows one amount', () => {
    const whole = (symbol: string) => part({symbol, dollars: 2012.99, bound: 'share'});
    const lines = splitLines(split({parts: [whole('AAA'), whole('BBB')], cash: 8000, gap: 4025.98, placed: 4025.98, left: 3974.02, stocksAfter: 5}),
      {alone: {AAA: 2500, BBB: 2500}});
    expect(lines.join(' ')).not.toContain('after "of"');
  });

  // The one line of the split that is about risk. The box shows it under the table among the others and again
  // beside the answer to a tick, so it is a value of its own: a template does not pick a line by its place.
  it('gives the line about a bad half-year by itself, the same sentence as among the lines', () => {
    expect(badHalfYearLine(split())).toBe(BAD_CASE);
    expect(splitLines(split())).toContain(badHalfYearLine(split()));
    const sold = split({parts: [part({gap: 4000, dollars: 2780.49})], cash: 2780.49, gap: 4000, placed: 2780.49});
    expect(splitLines(sold, {freed: 1780.49})).withContext('with what selling would free counted').toContain(badHalfYearLine(sold, {freed: 1780.49}));
    expect(badHalfYearLine(sold, {freed: 1780.49})).toContain('after selling and buying');
  });

  it('has no line about a bad half-year while nothing would be bought', () => {
    const none = part({gap: 0, dollars: 0, bound: 'none', loss: 0, gain: 0});
    expect(badHalfYearLine(split({parts: [none], gap: 0, placed: 0, left: 1000, stocksAfter: 3, togetherLossAfter: 2790})))
      .withContext('the ticked stock is at its share').toBe('');
    expect(badHalfYearLine(split({cash: 0, placed: 0, stocksAfter: 3, togetherLossAfter: 2790}))).withContext('no cash to split').toBe('');
    expect(badHalfYearLine(split(), {keep: 600, keepUnknown: true})).withContext('what is kept outside stocks cannot be worked out').toBe('');
  });

  // The owner asked for every table to be sortable (2026-11-26). The page still ranks nothing: an order by a column
  // is the reader's own view, and a sentence with the notes of a table says so.
  it('says that an order by a column is the reader\'s own view, not a ranking by the page', () => {
    expect(ORDER_NOTE).toBe(
      'A click on a heading orders the rows by its column, and a second click turns the order round. ' +
      'That is your own view of them: the page ranks nothing.');
  });

  it('says "1 stock" for one', () => {
    expect(splitLines(split({stocksBefore: 0, stocksAfter: 1}))[1]).toBe('You would hold 1 stock.');
    expect(splitLines(split({stocksBefore: 1, stocksAfter: 2}))[1]).toBe('You would hold 2 stocks instead of 1.');
  });

  // The page shows whole dollars. "$6,000 short ... Your $6,000 covers a part of that" would contradict itself in
  // one sentence, though it is true to the cent. So "all" goes by the two amounts of the sentence as they print. A
  // row beside it can still be a dollar off when rounding falls differently for the rows than for their sum; no
  // wording fits both then, and the sentence is the one that must agree with itself.
  it('says "all" exactly when the two amounts of the sentence print the same', () => {
    const two = [part({symbol: 'AAA', gap: 3000.2, dollars: 2999.9}), part({symbol: 'BBB', gap: 3000.2, dollars: 2999.9})];
    expect(splitLines(split({parts: two, cash: 5999.8, gap: 6000.4, placed: 5999.8, left: 0}))[0]).toBe(
      'The 2 you ticked are $6,000 short of their shares. Your $6,000 covers all of it.');
    expect(splitLines(split({parts: two, cash: 5999.8, gap: 6001.4, placed: 5999.8, left: 0}))[0]).withContext('a dollar apart')
      .toBe('The 2 you ticked are $6,001 short of their shares. Your $6,000 covers a part of that, the same part for each.');
  });

  it('says so when the money that selling would free is counted with the cash', () => {
    const lines = splitLines(split({parts: [part({gap: 4000, dollars: 2780.49})], cash: 2780.49, gap: 4000, placed: 2780.49}), {freed: 1780.49});
    expect(lines[0]).toBe(
      'The one you ticked is $4,000 short of its share. Your $2,780 (your cash and what selling would free) covers a part of that.');
    expect(lines[lines.length - 1]).toBe(
      'The cash is what you entered under "Cash" in the "Your plan today" box; $1,780 of the $2,780 is what SELL SOME would free.');
    const atItsShare = split({parts: [part({owned: true, gap: 0, dollars: 0, bound: 'none'})], cash: 2780.49, gap: 0, placed: 0, left: 2780.49});
    expect(splitLines(atItsShare, {freed: 1780.49})[0]).withContext('nothing ticked is short of anything').toBe(
      'The one you ticked is at its share already, so none of your $2,780 (your cash and what selling would free) goes to it.');
  });

  // Money that is in a stock today cannot "stay" cash, and a portfolio without cash has none to stay.
  it('says what is over would be left as cash, not that it stays cash, once what selling would free is counted', () => {
    const covered = (cash: number) => split({
      parts: [part({gap: 1219.51, dollars: 1219.51, bound: 'limit'})], cash, gap: 1219.51, placed: 1219.51, left: cash - 1219.51,
    });
    expect(splitLines(covered(5780.49), {freed: 1780.49})[0]).toBe(
      'The one you ticked is $1,220 short of its share. Your $5,780 (your cash and what selling would free) covers all of it, ' +
      'and $4,561 would be left as cash.');
    expect(splitLines(covered(1780.49), {freed: 1780.49})[0]).withContext('no cash entered').toBe(
      'The one you ticked is $1,220 short of its share. The $1,780 that selling would free covers all of it, ' +
      'and $561 would be left as cash.');
    expect(splitLines(covered(4000))[0]).withContext('cash alone: it is cash today and stays so').toBe(
      'The one you ticked is $1,220 short of its share. Your $4,000 covers all of it, and $2,780 stays cash.');
  });

  it('says so when what selling would free is all there is to split: the portfolio has no cash', () => {
    const lines = splitLines(split({parts: [part({gap: 4000, dollars: 1780.49})], cash: 1780.49, gap: 4000, placed: 1780.49}), {freed: 1780.49});
    expect(lines[0]).toBe('The one you ticked is $4,000 short of its share. The $1,780 that selling would free covers a part of that.');
    expect(lines[lines.length - 1]).toBe('This portfolio has no cash entered: the $1,780 is what SELL SOME would free.');
    const atItsShare = split({parts: [part({owned: true, gap: 0, dollars: 0, bound: 'none'})], cash: 1780.49, gap: 0, placed: 0, left: 1780.49});
    expect(splitLines(atItsShare, {freed: 1780.49})[0]).withContext('nothing ticked is short of anything').toBe(
      'The one you ticked is at its share already, so none of the $1,780 that selling would free goes to it.');
  });

  // With a sale counted "after" is after selling AND buying, and the line says so: a purchase alone never lowers
  // the sum, and a ticked purchase beside a smaller loss would read as if buying had made the portfolio safer. The
  // sum can then go either way, and the line gives the reason that holds: more of the money in stocks when more is
  // bought than is sold; stocks that swing more when less is bought and the sum is up all the same (a calm stock
  // sold, a volatile one bought); the sale, when the sum is down.
  it('says after what, and why the sum went the way it did, once what selling would free is counted', () => {
    const sums = 'A bad half-year for every marked stock at once';
    const lessBought = (o: Partial<CashSplit>) => splitLines(split({
      parts: [part({gap: 1219.51, dollars: 1219.51, bound: 'limit'})], cash: 6780.49, gap: 1219.51, placed: 1219.51, left: 5560.98, ...o,
    }), {freed: 1780.49})[2];
    const moreBought = (o: Partial<CashSplit>) => splitLines(split({
      parts: [part({gap: 4000, dollars: 2780.49})], cash: 2780.49, gap: 4000, placed: 2780.49, ...o,
    }), {freed: 1780.49})[2];
    expect(moreBought({})).withContext('more bought than sold, the sum up').toBe(
      `${sums}: −$2,790 today, −$3,200 after selling and buying. More of your money would be in stocks, and cash cannot fall.`);
    expect(moreBought({togetherLossBefore: 3200, togetherLossAfter: 3100})).withContext('more bought than sold, the sum down').toBe(
      `${sums}: −$3,200 today, −$3,100 after selling and buying. Selling takes more off it than what you would buy adds.`);
    expect(lessBought({togetherLossBefore: 1850, togetherLossAfter: 1620})).withContext('less bought than sold, the sum down').toBe(
      `${sums}: −$1,850 today, −$1,620 after selling and buying. Selling takes more off it than what you would buy adds.`);
    expect(lessBought({togetherLossBefore: 1850, togetherLossAfter: 1900})).withContext('less bought than sold, the sum up').toBe(
      `${sums}: −$1,850 today, −$1,900 after selling and buying. What you would buy swings more than what you would sell.`);
    expect(lessBought({togetherLossBefore: 1850, togetherLossAfter: 1850.3})).withContext('the same as printed: nothing to explain').toBe(
      `${sums}: −$1,850 today, −$1,850 after selling and buying.`);
  });

  // The sums are worked out from tests, like the cells of the two case columns: whole dollars, also under $100.
  it('says the sums in whole dollars', () => {
    expect(splitLines(split({togetherLossBefore: 46.4, togetherLossAfter: 127.3}))[2]).toBe(
      'A bad half-year for every marked stock at once: −$46 today, −$127 after. More of your money would be in stocks, and cash cannot fall.');
    expect(splitLines(split({togetherLossBefore: 0, togetherLossAfter: 80.6}))[2]).toBe(
      'A bad half-year for what you would buy, all at once: −$81. Today that money is cash, and cash cannot fall.');
  });

  it('says what the purchase could lose when nothing held is marked today', () => {
    expect(splitLines(split({togetherLossBefore: 0, togetherLossAfter: 410}))[2]).toBe(
      'A bad half-year for what you would buy, all at once: −$410. Today that money is cash, and cash cannot fall.');
  });

  it('says in the row of a stock that is owned what is held of it', () => {
    expect(ownedFit(3000)).toBe('You own $3,000 of it today.');
  });

  // A second limit of the user's own: a share of the portfolio stays outside stocks ("Keep outside stocks"), so only
  // the money above it is split. Here it is $2,000, a fifth of a $10,000 portfolio.
  describe('with a share kept outside stocks', () => {
    it('says in the hint how much is above what is kept: that is what is split', () => {
      expect(tickHint(3000, 0, false, 2000)).toBe(
        'Tick stocks to split your cash above the $2,000 you keep outside stocks ($1,000) between them.');
      expect(tickHint(3000, 1500, false, 2000)).withContext('with what selling would free counted').toBe(
        'Tick stocks to split your cash and what selling would free, above the $2,000 you keep outside stocks ($2,500), between them.');
      expect(tickHint(0, 3000, false, 2000)).withContext('no cash entered').toBe(
        'Tick stocks to split what selling would free, above the $2,000 you keep outside stocks ($1,000), between them.');
    });

    it('says in the hint that there is nothing to split when all the money lies within what is kept', () => {
      const within = 'Nothing to split yet: your cash ($1,500) is within the $2,000 you keep outside stocks.';
      expect(tickHint(1500, 0, false, 2000)).toBe(within);
      expect(tickHint(1500, 0, true, 2000)).withContext('a sale is on offer').toBe(`${within} Or tick "Count that money in the split".`);
      expect(tickHint(100, 1500, false, 2000)).toBe(
        'Nothing to split yet: your cash and what selling would free ($1,600) are within the $2,000 you keep outside stocks.');
      expect(tickHint(0, 1500, false, 2000)).toBe(
        'Nothing to split yet: what selling would free ($1,500) is within the $2,000 you keep outside stocks.');
      expect(tickHint(3000, 0, false, 0)).withContext('nothing kept: as before').toBe(tickHint(3000));
    });

    // With no cash entered, "enter it" alone would mislead: any cash up to what is kept still leaves nothing to split.
    it('says in the hint that only cash above what is kept is split, when no cash is entered', () => {
      const none = 'No cash to split yet, and only cash above the $2,000 you keep outside stocks is split: ' +
        'enter it in the "Your plan today" box, under "Cash"';
      expect(tickHint(0, 0, false, 2000)).toBe(`${none}.`);
      expect(tickHint(undefined, 0, true, 2000)).withContext('a sale is on offer').toBe(`${none}, or tick "Count that money in the split".`);
    });

    // A holding whose quote did not load adds nothing to what the portfolio is worth, so the amount to keep is the
    // least it can be. Splitting what lies above it could hand out money the user set aside: nothing is split.
    it('splits nothing while a stock has no price: what is kept cannot be worked out then', () => {
      const unknown = 'one of your stocks has no price, so what you keep outside stocks cannot be worked out yet: ' +
        'nothing is split until its price loads.';
      expect(tickHint(3000, 0, false, 2000, true)).withContext('no "tick": nothing would come of it yet').toBe(`O${unknown.slice(1)}`);
      const nothing = split({parts: [part({dollars: 0})], cash: 0, placed: 0, stocksAfter: 3, togetherLossAfter: 2790});
      expect(splitLines(nothing, {keep: 2000, cash: 3000, keepUnknown: true})).toEqual([`You ticked 1, but ${unknown}`]);
      expect(tickHint(3000, 0, false, 0, true)).withContext('nothing kept: a missing price changes nothing here').toBe(tickHint(3000));
    });

    it('says in the lines that the money is what is above the kept share, and where the kept share is set', () => {
      // $3,000 in cash, $2,000 of it kept: $1,000 against a stock that is $2,013 short.
      const lines = splitLines(split(), {keep: 2000, cash: 3000});
      expect(lines[0]).toBe(
        'The one you ticked is $2,013 short of its share. Your $1,000 (your cash above the $2,000 you keep outside stocks) covers a part of that.');
      expect(lines[lines.length - 1]).toBe(
        'The cash is what you entered under "Cash" in the "Your plan today" box; $2,000 of it stays outside stocks, as you set under ' +
        '"Keep outside stocks".');
    });

    it('says the same with what selling would free counted, with cash and without', () => {
      const covered = (cash: number) => split({parts: [part({dollars: 2012.99, bound: 'share'})], cash, placed: 2012.99, left: cash - 2012.99});
      // $3,000 in cash and $1,500 freed, $2,000 kept: $2,500 to split, of which $487 is over.
      const both = splitLines(covered(2500), {keep: 2000, cash: 3000, freed: 1500});
      expect(both[0]).toBe(
        'The one you ticked is $2,013 short of its share. Your $2,500 (your cash and what selling would free, above the $2,000 you keep ' +
        'outside stocks) covers all of it, and $487 more would be left as cash.');
      expect(both[both.length - 1]).toBe(
        'The cash is what you entered under "Cash" in the "Your plan today" box, and $1,500 is what SELL SOME would free; $2,000 of the two ' +
        'stays outside stocks, as you set under "Keep outside stocks".');
      // No cash, $3,000 freed, $2,000 kept: $1,000 to split.
      const freedOnly = splitLines(split(), {keep: 2000, cash: 0, freed: 3000});
      expect(freedOnly[0]).toBe(
        'The one you ticked is $2,013 short of its share. The $1,000 that selling would free above the $2,000 you keep outside stocks ' +
        'covers a part of that.');
      expect(freedOnly[freedOnly.length - 1]).toBe(
        'This portfolio has no cash entered: the money is what SELL SOME would free ($3,000), and $2,000 of it stays outside stocks, as you ' +
        'set under "Keep outside stocks".');
    });

    it('says what is over stays cash on top of what is kept', () => {
      const over = split({parts: [part({dollars: 2012.99, bound: 'share'})], cash: 3000, placed: 2012.99, left: 987.01});
      expect(splitLines(over, {keep: 2000, cash: 5000})[0]).toBe(
        'The one you ticked is $2,013 short of its share. Your $3,000 (your cash above the $2,000 you keep outside stocks) covers all of it, ' +
        'and $987 more stays cash.');
    });

    it('says that nothing is left to split when all the money lies within the kept share', () => {
      const nothing = split({parts: [part({dollars: 0})], cash: 0, placed: 0, stocksAfter: 3, togetherLossAfter: 2790});
      expect(splitLines(nothing, {keep: 2000, cash: 1500})).toEqual([
        'You ticked 1, but your cash ($1,500) is within the $2,000 you keep outside stocks: nothing is left to split.',
      ]);
      expect(splitLines(nothing, {keep: 2000, cash: 1500, offered: true})).toEqual([
        'You ticked 1, but your cash ($1,500) is within the $2,000 you keep outside stocks: nothing is left to split. ' +
        'Or tick "Count that money in the split".',
      ]);
      expect(splitLines(nothing, {keep: 2000, cash: 100, freed: 1500})).toEqual([
        'You ticked 1, but your cash and what selling would free ($1,600) are within the $2,000 you keep outside stocks: nothing is left to split.',
      ]);
      expect(splitLines(nothing, {keep: 2000, cash: 0})).withContext('no money at all').toEqual([
        'You ticked 1, but this portfolio has no cash to split, and only cash above the $2,000 you keep outside stocks is split. ' +
        'Enter it in the "Your plan today" box, under "Cash".',
      ]);
      expect(splitLines(nothing, {cash: 0})).withContext('no money and nothing kept: as before').toEqual([
        'You ticked 1, but this portfolio has no cash to split. Enter it in the "Your plan today" box, under "Cash".',
      ]);
    });
  });
});
