import {Component} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {By} from "@angular/platform-browser";
import {MatTooltip} from "@angular/material/tooltip";
import {PortfolioSettings, PositionsCardComponent} from "./positions-card.component";
import {SortColumn} from "../position-sort";
import {PortfolioBook} from "../portfolio-book";
import {PositionRow, Reserve} from "../portfolio-view";
import {Portfolio, viewOf} from "../positions";
import {EVIDENCE, textsFor} from "../evidence";
import {PositionRisk, riskOf, summarize, TestedCases} from "../sizing";
import {PlanStep} from "../plan";

const TODAY = '2026-11-21';
const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
/** A 40,000 portfolio and a 2% limit: 800 on one stock. */
const PORTFOLIO = 40_000, LIMIT = 800;

/**
 * A holding bought at 100 (or at `paid`) and at 90 now; marked DIP BUY (so the tests have a bad and a good case for
 * it) unless told otherwise.
 */
function row(symbol: string, o: { shares?: number, day?: string, marked?: boolean, limit?: number | null, paid?: number } = {}): PositionRow {
  const position = {symbol, shares: o.shares ?? 10, price: o.paid ?? 100, ...(o.day ? {day: o.day} : {})};
  const view = viewOf(position, {price: 90, portfolioValue: PORTFOLIO, today: TODAY});
  const cases = o.marked === false ? undefined : VOLATILE;
  const limit = o.limit === null ? undefined : o.limit ?? LIMIT;
  return {symbol, view, verdict: cases ? 'DIP BUY' : 'PASS', cases, risk: riskOf(view, cases, limit, PORTFOLIO)};
}

/** A holding with a purchase day, so it can be compared with the market: bought at 100 on Aug 13, the market at 500 then and 520 now. */
function dated(symbol: string): PositionRow {
  const view = viewOf({symbol, shares: 10, price: 100, day: '2026-08-13'}, {price: 90, portfolioValue: PORTFOLIO, today: TODAY, indexThen: 500, indexNow: 520});
  return {symbol, view};
}

function cardWith(rows: PositionRow[], o: { cash?: number, limit?: number | null, starting?: boolean, reserve?: Reserve } = {}): PositionsCardComponent {
  const risks = new Map<string, PositionRisk>(rows.filter(it => it.risk).map(it => [it.symbol, it.risk!]));
  const card = new PositionsCardComponent();
  card.portfolio = {v: 1, cash: o.cash, positions: {}};
  card.view = {
    rows, summary: summarize(rows.map(it => it.view), risks, PORTFOLIO), portfolioValue: PORTFOLIO,
    budget: o.limit === null ? undefined : LIMIT, limitPercent: 2, limitIsDefault: !!o.starting, reserve: o.reserve,
  };
  return card;
}

describe('PositionsCardComponent, in everyday words', () => {
  it('is the page\'s first box, "Your plan today", with the holdings under "What you own": the names the texts point to', () => {
    const card = new PositionsCardComponent();
    expect(card.title).toBe('Your plan today');
    expect(card.ownTitle).toBe('What you own');
  });

  // NVDA: 60 shares, worth 5,400 (cost 6,000). AMD: 10 shares, worth 900 (cost 1,000).
  const nvda = row('NVDA', {shares: 60}), amd = row('AMD');

  it('sums the portfolio up: how many stocks, what they are worth and the result since they were bought', () => {
    expect(cardWith([nvda, amd]).headline).toBe('2 stocks · worth $6,300 · −$700 (−10.0%) since bought');
    expect(cardWith([amd]).headline).toBe('1 stock · worth $900 · −$100 (−10.0%) since bought');
  });

  // The one figure that says whether owning these stocks paid more than simply owning the market. The sentences
  // themselves are market-compare.ts's (its spec has every form); here: that the box says them for its own rows.
  it('says what the same money would have made in the market on the same days, and how far the stocks are from it', () => {
    // Each: 10 shares bought at 100 on Aug 13 (100 days ago), at 90 now: −$100. The market went from 500 to 520: +$40.
    const card = cardWith([dated('NVDA'), dated('AMD')]);
    expect(card.headline).toBe('2 stocks · worth $1,800 · −$200 (−10.0%) since bought');
    expect(card.marketLines).toEqual([
      'The same money in the market on the same days: +$80 (+4.0%). Your stocks are $280 behind it.',
      'Too early to mean much: on average this money has been in for 14 weeks. The tests looked at 6 months.',
    ]);
    expect(cardWith([nvda, amd]).marketLines).withContext('no purchase date, so nothing to compare').toEqual([]);
    expect(cardWith([]).marketLines).toEqual([]);
  });

  // The owner: "too much text and not much signal". Beside the headline the comparison is figures with their names;
  // the sentences they come from are where the pointer rests, and with the explanations of the box.
  it('gives that comparison as figures for the place beside the headline', () => {
    const card = cardWith([dated('NVDA'), dated('AMD')]);
    expect(card.ownFacts.map(it => [it.label, it.value])).toEqual([
      ['Against the market', '$280 behind'], ['Money in for', '14 weeks: too early to mean much'],
    ]);
    expect(card.ownFacts.map(it => it.tip)).toEqual(card.marketLines);
    expect(cardWith([]).ownFacts).toEqual([]);
  });

  it('says in that place what the comparison needs, while no stock has a purchase date', () => {
    const card = cardWith([nvda, amd]);
    expect(card.ownFacts).toEqual([{label: 'Against the market', value: 'needs a purchase date', tip: card.undatedText}]);
    expect(cardWith([dated('NVDA'), amd]).ownFacts[0].label).withContext('one can be compared: the figure is about it').toBe('Against the market, 1 of 2 stocks');
  });

  // The two cases of all the marked stocks at once were two sentences beside the table: they are the sums of two
  // of its columns, so they are a row at its foot.
  it('adds the two cases of the marked stocks up for a row at the foot of the table, from two of them', () => {
    const card = cardWith([nvda, amd]);
    expect(card.totals).toEqual({
      label: 'Both marked DIP BUY at once', bad: '−$2,583', share: '6.5% of this portfolio', good: '+$5,355', tip: card.togetherLines.join(' '),
    });
    expect(cardWith([nvda, amd, row('ARM')]).totals!.label).toBe('All 3 marked DIP BUY at once');
    expect(cardWith([amd]).totals).withContext('one marked stock: its own row has the two figures').toBeUndefined();
    expect(cardWith([row('SPCX', {marked: false})]).totals).toBeUndefined();
  });

  it('gives what the entries come to as figures under the fields: the worth with cash, the cash share, the limit in dollars', () => {
    const card = cardWith([row('NVDA', {shares: 60})], {cash: 500});
    const share = /the cash is ([\d.]+%) of it/.exec(card.cashText)![1];
    expect(card.settingFacts.map(it => [it.label, it.value])).toEqual([
      ['Worth with cash', '$40,000'], ['In cash', share], ['Limit on one stock', '$800'],
    ]);
    expect(card.settingFacts.map(it => it.tip)).toEqual([card.cashText, card.cashText, card.limitText]);
    expect(cardWith([row('NVDA', {shares: 60})], {cash: 500, starting: true}).settingFacts.map(it => it.value))
      .withContext('a limit the user did not set is named as the starting value').toContain('$800 (starting value)');
    expect(cardWith([row('NVDA', {shares: 60})]).settingFacts.map(it => it.label)).withContext('no cash entered').toEqual(['Limit on one stock']);
    card.unvalued = true;
    expect(card.settingFacts).withContext('no price arrived: nothing is worked out').toEqual([]);
  });

  it('gives the share kept outside stocks in dollars among those figures, with whether the cash covers it', () => {
    const facts = (cash: number, short: number, atLeast = false) => cardWith([nvda], {
      cash, reserve: {percent: 20, dollars: 8000, cash, short, cashPercent: cash / 400, atLeast},
    }).settingFacts.filter(it => it.label === 'Kept outside stocks');
    expect(facts(5000, 3000).map(it => it.value)).toEqual(['$8,000: cash is $3,000 short']);
    expect(facts(9000, 0).map(it => it.value)).toEqual(['$8,000: cash covers it']);
    expect(facts(5000, 3000, true).map(it => it.value)).withContext('a stock has no price').toEqual(['at least $8,000: cash is at least $3,000 short']);
    expect(facts(9000, 0, true).map(it => it.value)).toEqual(['at least $8,000']);
    expect(cardWith([nvda], {cash: 5000}).settingFacts.map(it => it.label)).withContext('no share set: nothing to show').not.toContain('Kept outside stocks');
  });

  // Under the field "Keep outside stocks", which shows the share: the sentence adds what the field does not show,
  // what that share is in dollars and whether the cash covers it.
  it('says what the share to keep outside stocks comes to in dollars, and where the cash stands against it', () => {
    // A fifth of a $40,000 portfolio.
    expect(cardWith([nvda], {cash: 5000, reserve: {percent: 20, dollars: 8000, cash: 5000, short: 3000, cashPercent: 12.5, atLeast: false}}).reserveText)
      .toBe('20% of this portfolio is $8,000: your cash is $3,000 short of it.');
    expect(cardWith([nvda], {cash: 9000, reserve: {percent: 20, dollars: 8000, cash: 9000, short: 0, cashPercent: 22.5, atLeast: false}}).reserveText)
      .toBe('20% of this portfolio is $8,000: your cash covers it.');
  });

  it('counts a gap of half a dollar as a gap, and less as none', () => {
    const at = (short: number) => cardWith([nvda], {cash: 5000, reserve: {percent: 20, dollars: 5000 + short, cash: 5000, short, cashPercent: 12.5, atLeast: false}}).reserveText;
    expect(at(0.49)).toContain(': your cash covers it.');
    expect(at(0.5)).toContain(': your cash is $0.50 short of it.');
  });

  it('prints the share with two decimals at most, however it was typed', () => {
    expect(cardWith([nvda], {cash: 9000, reserve: {percent: 33.3333333, dollars: 8000, cash: 9000, short: 0, cashPercent: 37.5, atLeast: false}}).reserveText)
      .toBe('33.33% of this portfolio is $8,000: your cash covers it.');
  });

  // A holding whose quote did not load adds nothing to what the portfolio is worth, so the amount to keep is the
  // least it can be: "your cash covers it" cannot be said then.
  it('says "at least" and does not say the cash covers it while a stock has no price', () => {
    expect(cardWith([nvda], {cash: 6000, reserve: {percent: 20, dollars: 5800, cash: 6000, short: 0, cashPercent: 20.7, atLeast: true}}).reserveText)
      .toBe('20% of this portfolio is at least $5,800, because a stock has no price: whether your cash covers it cannot be said until the price loads.');
    expect(cardWith([nvda], {cash: 5000, reserve: {percent: 20, dollars: 5800, cash: 5000, short: 800, cashPercent: 17.2, atLeast: true}}).reserveText)
      .toBe('20% of this portfolio is at least $5,800, because a stock has no price: your cash is at least $800 short of it.');
  });

  // An empty field says nothing about itself: until a share is entered the sentence under the fields says what the
  // field is for, as the limit's sentence does while the limit is the app's starting one.
  it('says what the third field is for while it is empty, once the portfolio is worth something', () => {
    expect(cardWith([nvda], {cash: 5000}).reserveText).toBe(
      'No share is set to keep outside stocks. Enter one under "Keep outside stocks" to have the plan and the split in "Could add" leave it in cash.');
    const worthless = cardWith([]);
    worthless.view = {...worthless.view, portfolioValue: undefined};
    expect(worthless.reserveText).withContext('nothing to take a share of yet').toBe('');
  });

  // "Your limit: $800 on one stock" read as the most that can be put into a stock, next to sizes several times
  // that. The sentence says what it is a limit of, and what it does to the plan's sizes.
  // It stands right under the field "Most I can lose on one stock", which already says what the number is: the
  // sentence adds the one thing the field does not show, what the percentage comes to in dollars.
  it('says what the limit comes to in dollars and what it does to the sizes, without repeating its field', () => {
    expect(cardWith([nvda]).limitText).toBe('2% of this portfolio is $800. No size in the plan goes above what fits it.');
    expect(cardWith([nvda], {limit: null}).limitText).toBe('');
  });

  // While the prices are arriving no stock has one yet and the portfolio looks as if it were worth its cash alone.
  // Sentences worked out from that are wrong for those seconds, and one of them says the quotes did not load.
  it('says nothing that is worked out from prices while they are still arriving', () => {
    const waiting = (symbol: string): PositionRow => ({symbol, view: viewOf({symbol, shares: 10, price: 100}, {portfolioValue: 500, today: TODAY})});
    const card = cardWith([waiting('NVDA'), waiting('AMD')], {cash: 500});
    expect(card.unpricedText).withContext('once loading is over, a price that is missing is said').toBe(
      'No price for NVDA, AMD: the quote did not load, so it is left out of the totals.');
    // On a day no price arrives at all it is one short line: the plan box names the cause, and every symbol by
    // name would only repeat it.
    card.unvalued = true;
    expect(card.unpricedText).toBe('No price for any of your 2 stocks, so nothing here is valued.');
    card.unvalued = false;
    expect(card.limitText).not.toBe('');
    expect(card.cashText).not.toBe('');
    expect(card.reserveText).not.toBe('');

    card.loading = true;
    expect(card.unpricedText).withContext('not said while it may still load').toBe('');
    expect(card.limitText).withContext('the limit in dollars needs what the portfolio is worth').toBe('');
    expect(card.cashText).withContext('so does the share that is cash').toBe('');
    expect(card.reserveText).withContext('and whether the cash covers the share to keep').toBe('');
  });

  it('explains the cash: that it counts toward what the portfolio is worth, and that the plan\'s sizes do not depend on it', () => {
    expect(new PositionsCardComponent().cashTooltip).toBe(
      'The cash in this account. The portfolio is worth your stocks at today\'s prices plus this cash. ' +
      'The sizes in the plan are shares of that worth; they do not depend on how much of it is cash.');
  });

  it('explains the limit, with the value the plan starts from', () => {
    expect(new PositionsCardComponent().limitTooltip).toBe(
      'The most you are willing to lose on one stock in a bad half-year, as a share of this portfolio. ' +
      'Until you enter your own number the plan starts from 10.');
  });

  // The sentence stands beside the two fields, so it names the field to fill in rather than saying "above".
  it('says so when the limit is the app\'s starting value, not the user\'s own, and which field changes it', () => {
    expect(cardWith([nvda], {starting: true}).limitText).toBe(
      'The plan assumes you accept to lose $800 on one stock: the app\'s starting value, 2% of this portfolio. ' +
      'Enter your own under "Most I can lose on one stock".');
  });

  // The plan's sentence and where the two cases come from were said only where the pointer rests on a cell, and a
  // cell cannot take the keyboard. The stock is the row's tab stop: with the keyboard on it, it says them.
  it('says what the cells of a row say to a pointer when the keyboard is on its stock, and the name alone under the pointer', () => {
    const card = cardWith([nvda, amd]);
    card.names = {NVDA: 'Nvidia Corp'};
    const keyboard = {target: {matches: () => true}} as unknown as FocusEvent;
    const pointer = {target: {matches: () => false}} as unknown as FocusEvent;
    expect(card.stockTip(nvda)).toBe('Nvidia Corp');
    card.onStockFocus(nvda, keyboard);
    expect(card.stockTip(nvda)).toBe([
      'Nvidia Corp', card.planTooltip(nvda), `Bad case: ${card.badCaseTooltip(nvda)}`, `Good case: ${card.goodCaseTooltip(nvda)}`,
    ].join('\n'));
    expect(card.stockTip(amd)).withContext('another row').toBe('');
    card.onStockBlur();
    expect(card.stockTip(nvda)).toBe('Nvidia Corp');
    card.onStockFocus(nvda, pointer);
    expect(card.stockTip(nvda)).withContext('a click is not the keyboard').toBe('Nvidia Corp');
  });

  it('leaves the two cases out for a stock the tests did not measure', () => {
    const fund = row('SPCX', {marked: false});
    const card = cardWith([fund]);
    card.onStockFocus(fund, {target: {matches: () => true}} as unknown as FocusEvent);
    expect(card.stockTip(fund)).toBe(card.planTooltip(fund));
  });

  it('explains a bad case as what 1 in 10 such stocks did, and says how it stands against the limit', () => {
    const card = cardWith([nvda, amd]);
    expect(card.badCase(nvda)).withContext('the cell is one amount; its share of the portfolio is in the explanation').toBe('−$2,214');
    // AMD: 10 shares at 90, so 900: a bad case of 41% is 369 and a good one of 85% is 765. A small holding has
    // cases under 100 dollars: whole dollars there too, so the column is one precision from top to bottom.
    const small = row('AMD', {shares: 1});
    expect([card.badCase(small), card.goodCase(small)]).toEqual(['−$37', '+$77']);
    expect(card.badCaseTooltip(nvda)).toBe(
      'In tests, 1 in 10 stocks like this lost 41% or more after 6 months. Here that would be the amount shown ' +
      '(5.5% of this portfolio), which is over your limit of $800.');
    expect(card.badCaseTooltip(amd)).toBe(
      'In tests, 1 in 10 stocks like this lost 41% or more after 6 months. Here that would be the amount shown ' +
      '(0.9% of this portfolio), which is within your limit of $800.');
    const unlimited = row('NVDA', {shares: 60, limit: null});
    expect(cardWith([unlimited], {limit: null}).badCaseTooltip(unlimited)).toBe(
      'In tests, 1 in 10 stocks like this lost 41% or more after 6 months. Here that would be the amount shown (5.5% of this portfolio).');
  });

  it('shows the columns that need a purchase date only once a stock has one', () => {
    expect(cardWith([nvda, amd]).hasDates).toBe(false);
    expect(cardWith([nvda, row('AVGO', {day: '2026-10-15'})]).hasDates).toBe(true);
  });

  it('gives the bad and the good outcome a line each', () => {
    expect(cardWith([nvda, amd]).togetherLines).toEqual([
      'If the bad case hit both of your stocks marked DIP BUY at once: −$2,583, 6.5% of this portfolio. ' +
      'Added to your loss so far, that is −$3,283 (−46.9%) since bought.',
      'If the good case did: +$5,355, which would be +$4,655 (+66.5%) since bought.',
    ]);
    expect(cardWith([row('SPCX', {marked: false})]).togetherLines).toEqual([]);
  });

  it('explains a good case the same way, with the typical result beside it', () => {
    expect(cardWith([nvda]).goodCaseTooltip(nvda)).toBe(
      'In tests, 1 in 10 stocks like this gained 85% or more after 6 months. The typical one ended at +2.4%, which would be +$130 here.');
  });

  it('says why a stock that is not marked DIP BUY has no bad or good case', () => {
    const fund = row('SPCX', {marked: false});
    const card = cardWith([fund]);
    expect([card.badCase(fund), card.goodCase(fund)]).toEqual(['—', '—']);
    expect(card.badCaseTooltip(fund)).toBe('Only stocks marked DIP BUY were measured in the tests; this one is not marked now.');
    expect(card.goodCaseTooltip(fund)).toBe('Only stocks marked DIP BUY were measured in the tests; this one is not marked now.');
  });

  it('adds the bad and the good cases up, as if they all came at once, and puts each on top of the loss so far', () => {
    // Together the two cost 7,000 and are down 700; the bad cases take another 2,583, the good ones add 5,355.
    expect(cardWith([nvda, amd]).togetherText).toBe(
      'If the bad case hit both of your stocks marked DIP BUY at once: −$2,583, 6.5% of this portfolio. ' +
      'Added to your loss so far, that is −$3,283 (−46.9%) since bought. ' +
      'If the good case did: +$5,355, which would be +$4,655 (+66.5%) since bought.');
    expect(cardWith([nvda, amd, row('ARM')]).togetherText).toContain('If the bad case hit all 3 of your stocks marked DIP BUY at once: ');
    expect(cardWith([amd]).togetherText).toBe(
      'If the bad case hit your stock marked DIP BUY: −$369, 0.9% of this portfolio. ' +
      'Added to your loss so far, that is −$469 (−46.9%) since bought. ' +
      'If the good case did: +$765, which would be +$665 (+66.5%) since bought.');
    expect(cardWith([row('SPCX', {marked: false})]).togetherText).toBe('');
  });

  it('says what the bad cases would leave of a gain so far, and what the good ones would make it', () => {
    // Bought at 50 and at 90 now: 10 shares cost 500 and are worth 900, so +400 so far; the bad case takes 369 of
    // it, the good case adds 765 to it.
    expect(cardWith([row('AMD', {paid: 50})]).togetherText).toBe(
      'If the bad case hit your stock marked DIP BUY: −$369, 0.9% of this portfolio. ' +
      'Taken from your gain so far, that is +$31 (+6.2%) since bought. ' +
      'If the good case did: +$765, which would be +$1,165 (+233.0%) since bought.');
  });

  it('leaves the totals since bought out while there is no gain or loss so far to add them to', () => {
    expect(cardWith([row('AMD', {paid: 90})]).togetherText).toBe(
      'If the bad case hit your stock marked DIP BUY: −$369, 0.9% of this portfolio. If the good case did: +$765.');
  });

  it('says what the portfolio is worth with its cash', () => {
    // The cash itself is in the field right above, and what the stocks are worth is in the headline of the table.
    expect(cardWith([nvda], {cash: 120.4}).cashText).toBe('With its cash this portfolio is worth $40,000; the cash is 0.3% of it.');
    expect(cardWith([nvda]).cashText).toBe('');
  });

  it('says what is missing for stocks without a purchase date', () => {
    const dated = row('AVGO', {day: '2026-10-15'});
    expect(cardWith([nvda, amd]).undatedText).toBe(
      'These stocks have no purchase date, so the app cannot show how long you have held them or compare them with the market. ' +
      'Click a stock to add its date.');
    expect(cardWith([nvda, dated]).undatedText).toBe(
      'One stock has no purchase date, so the app cannot show how long you have held it or compare it with the market. ' +
      'Click it to add the date.');
    expect(cardWith([nvda, amd, dated]).undatedText).toContain('2 stocks have no purchase date, so the app cannot show how long you have held them');
    expect(cardWith([dated]).undatedText).toBe('');
  });
});

describe('PositionsCardComponent: how long a position has been held', () => {
  const card = new PositionsCardComponent();

  it('counts the weeks against the 6 months the tests followed', () => {
    const young = row('NVDA', {day: '2026-10-15'});
    expect(card.held(young)).toBe('week 6 of 26');
    expect(card.heldNote(young)).withContext('nothing to add').toBe('');
  });

  it('says when a position is older than that: the weeks, and apart from them that the tests stopped earlier', () => {
    const old = row('AMZN', {day: '2025-10-01', marked: false});
    expect(card.held(old)).toBe('59 weeks');
    expect(card.heldNote(old)).toBe('longer than the tests followed');
    expect(card.pastTheTests(old)).withContext('worth a second look: shown in the colour of a warning').toBe(true);
  });

  // The plan keeps a stock that is marked DIP BUY today whenever it was bought: holding it is the same bet as
  // buying it today. A warning about its age beside the word KEEP would contradict the plan.
  it('says that the 6 months count from today for an old position that is marked DIP BUY again, and does not warn', () => {
    const again = row('NVDA', {day: '2025-10-01'});
    expect(card.held(again)).toBe('59 weeks');
    expect(card.heldNote(again)).toBe('DIP BUY today: counts from today');
    expect(card.pastTheTests(again)).toBe(false);
    expect(card.pastTheTests(row('NVDA', {day: '2026-10-15'}))).withContext('a young position').toBe(false);
  });

  it('shows a dash without a purchase date', () => {
    expect(card.held(row('NVDA'))).toBe('—');
    expect(card.heldNote(row('NVDA'))).toBe('');
  });

  // Found by a review of the page: "DIP BUY today: counts from today" stood in the cell with nothing to say what
  // it means. The few words of the note have their sentence where the pointer rests.
  it('says what the note under the weeks means where the pointer rests on it, and nothing for a cell without a note', () => {
    expect(card.heldTip(row('NVDA', {day: '2025-10-01'}))).toBe(
      'Held for longer than the 6 months the tests followed. It is marked DIP BUY today, and holding it is the same bet as ' +
      'buying it today: the plan keeps it and counts its 6 months from today.');
    expect(card.heldTip(row('AMZN', {day: '2025-10-01', marked: false}))).toBe(
      'Held for longer than the 6 months the tests followed. After that the tests disagree, so the plan has no rule for it.');
    expect(card.heldTip(row('NVDA', {day: '2026-10-15'}))).toBe('');
    expect(card.heldTip(row('NVDA'))).toBe('');
  });
});

describe('PositionsCardComponent: what the plan says about each stock', () => {
  const step = (kind: PlanStep['kind'], verb: string, text: string, items: PlanStep['items']): PlanStep => ({kind, verb, text, why: 'Why.', items});
  const nvda = row('NVDA', {shares: 60}), amd = row('AMD'), amzn = row('AMZN', {marked: false});
  const card = cardWith([nvda, amd, amzn]);
  card.plan = [
    step('trim', 'SELL SOME', 'This stock could lose more than your $800 limit. Keep only the amount shown.', [{symbol: 'NVDA', label: 'keep $1,951'}]),
    // The line about buying lists no stock: one that is not owned is a row of "Could add", and what can be added to
    // one that is owned is said in that stock's own row here.
    {
      kind: 'buy', verb: 'BUY', text: '1 stock could be added: see "Could add" for its size.', why: 'Why.', items: [],
      inRows: [{symbol: 'AMD', label: 'add 2.6% ($1,051)'}],
    },
    step('hold', 'KEEP', 'Keep this one for 6 months. In tests, selling early, up or down, paid less.', [{symbol: 'AMD'}]),
    step('outside', 'NO OPINION', 'The plan does not cover this stock.', [{symbol: 'AMZN'}]),
  ];

  it('names the step each holding is under, with its amount when it has one', () => {
    expect([nvda, amd, amzn].map(it => card.planOf(it)?.verb)).toEqual(['SELL SOME', 'KEEP', 'NO OPINION']);
    expect([nvda, amd, amzn].map(it => card.planNote(it))).toEqual(['keep $1,951', 'add 2.6% ($1,051)', '']);
  });

  it('marks the steps that ask for something, as the plan card does', () => {
    expect([nvda, amd, amzn].map(it => card.planAsks(it))).toEqual([true, false, false]);
  });

  // The owner: "some of the info looks to be duplicated in the UI", with the pointer on a row's KEEP: the
  // explanation that opened was, word for word, the line "KEEP ..." standing under the table. Asked which of the
  // two should go: "rather than removing the tooltip remove the line below".
  it('explains each under the pointer with the plan card\'s own sentence, under its verb', () => {
    expect(card.planTooltip(nvda)).toBe('SELL SOME: This stock could lose more than your $800 limit. Keep only the amount shown.');
    expect(card.planTooltip(amd)).toBe(
      'KEEP: Keep this one for 6 months. In tests, selling early, up or down, paid less.\n' +
      'BUY: You own less of this stock than the size the plan gives it. This is how much more you could buy to bring it up to that size.');
    expect(card.planTooltip(amzn)).toBe('NO OPINION: The plan does not cover this stock.');
  });

  it('shows nothing for a stock until the plan is worked out: every price has to load first', () => {
    const waiting = cardWith([amd]);
    expect(waiting.planOf(amd)).toBeUndefined();
    expect(waiting.planNote(amd)).toBe('');
    expect(waiting.planAsks(amd)).toBe(false);
    expect(waiting.planTooltip(amd)).toBe('The plan is worked out once every price has loaded.');
  });

  // SELL SOME and BUY have a line of their own above the table; KEEP and NO OPINION are said in the rows alone.
  // A cell cannot be reached with the keyboard and a heading can, so the heading's explanation carries them too.
  it('says what the "Plan" column is and where its reasons are, with the words that have no line in the plan above', () => {
    expect(card.planColumnTooltip).toBe(
      'What today\'s plan says about this stock. Point at a word for its sentence. The reasons are in ' +
      '"How the plan was tested", at the bottom of the page.\n\n' +
      'KEEP: Keep this one for 6 months. In tests, selling early, up or down, paid less.\n' +
      'NO OPINION: The plan does not cover this stock.');
    expect(cardWith([amd]).planColumnTooltip).withContext('before the plan is worked out').toBe(
      'What today\'s plan says about this stock. Point at a word for its sentence. The reasons are in ' +
      '"How the plan was tested", at the bottom of the page.');
  });
});

/** The box as the page builds it: the plan's lines are handed in and shown between the portfolio's controls and its holdings. */
@Component({
  standalone: true,
  imports: [PositionsCardComponent],
  template: `
    <app-positions-card [book]="book" [portfolio]="card.portfolio" [view]="card.view" [plan]="plan" [toDo]="toDo" [savedIn]="savedIn"
                        [loading]="loading"
                        [allColumns]="allColumns" [names]="names" (allColumnsChange)="asked.push($event)">
      <p class="lines">The plan's lines.</p>
    </app-positions-card>`,
})
class PageWithTheBox {
  book: PortfolioBook = {
    v: 2, active: 'p2',
    portfolios: [{v: 1, id: 'p1', name: 'Brokerage', positions: {}}, {v: 1, id: 'p2', name: 'Retirement', positions: {}}],
  };
  card = cardWith([row('AMD'), row('AMZN', {marked: false})], {cash: 500});
  toDo: Record<string, string[]> = {p1: ['SELL SOME', 'BUY'], p2: ['BUY']};
  /** The first prices are still arriving. */
  loading = false;
  /** Where the portfolios are saved, once that is known. */
  savedIn: 'checking' | 'database' | 'memory' | 'browser' = 'database';
  /** The key columns to start with, as on the page. */
  allColumns = false;
  names: Record<string, string> = {};
  /** What the box asked for with its choice of columns. */
  asked: boolean[] = [];
  plan: PlanStep[] = [
    {kind: 'buy', verb: 'BUY', text: '1 stock could be added: see "Could add" for its size.', why: 'Why.', items: []},
    {kind: 'hold', verb: 'KEEP', text: 'Keep this one for 6 months. In tests, selling early, up or down, paid less.', why: 'Why.', items: [{symbol: 'AMD'}]},
    {kind: 'outside', verb: 'NO OPINION', text: 'The plan does not cover this stock.', why: 'Why.', items: [{symbol: 'AMZN'}]},
  ];
}

describe('PositionsCardComponent, as shown: one box for a portfolio\'s plan and what it holds', () => {
  function shown(change: (page: PageWithTheBox) => void = () => undefined): HTMLElement {
    const fixture = TestBed.createComponent(PageWithTheBox);
    change(fixture.componentInstance);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  const text = (el?: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();
  /** The parts of the box in the order they are read: a heading by its words, the others by their name. */
  const PARTS = ['settings', 'names', 'lines', 'how', 'saved'];
  const order = (el: HTMLElement) => Array.from(el.querySelectorAll('h2, h3, table, ' + PARTS.map(name => `.${name}`).join(', '))).map(part =>
    part.matches('h2, h3') ? text(part) : part.matches('table') ? 'table' : PARTS.find(name => part.classList.contains(name)));

  // Which portfolio comes first: the plan and the numbers belong to the portfolio chosen. Then the plan, as it is
  // seen first; the numbers it works from come after it in the page too.
  it('is one box: which portfolio, the plan\'s lines, its cash and limit, then "What you own" with its table', () => {
    const el = shown();
    expect(el.querySelectorAll('mat-card').length).toBe(1);
    expect(order(el)).toEqual(['Your plan today', 'names', 'lines', 'settings', 'What you own', 'table', 'how', 'saved']);
    expect(el.querySelector('mat-card .lines')).withContext('the lines are inside the box').not.toBeNull();
  });

  it('says on each portfolio\'s button what its plan expects there', () => {
    const names = (el: HTMLElement) => Array.from(el.querySelectorAll('.names .name')).map(text);
    expect(names(shown())).toEqual(['Brokerage · to do: SELL SOME, BUY', 'Retirement · to do: BUY']);
    expect(names(shown(page => page.toDo = {p1: [], p2: ['BUY']}))).toEqual(['Brokerage', 'Retirement · to do: BUY']);
  });

  it('sums the holdings up beside "What you own", not beside the box\'s title', () => {
    const el = shown();
    const own = el.querySelector('h3')?.parentElement;
    expect(text(own?.querySelector('.headline'))).toBe('2 stocks · worth $1,800 · −$200 (−10.0%) since bought');
    expect(el.querySelector('h2')?.parentElement?.querySelector('.headline')).toBeNull();
  });

  describe('an entry in the cash or the limit field', () => {
    /** The box with 500 in cash and no limit of its own, the two fields, and what the box asks the page to save. */
    function fields() {
      const fixture = TestBed.createComponent(PageWithTheBox);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const box = fixture.debugElement.query(By.directive(PositionsCardComponent)).componentInstance as PositionsCardComponent;
      const saved: Array<{ cash?: number, lossBudgetPercent?: number, reservePercent?: number }> = [];
      box.settings.subscribe(it => saved.push(it));
      const enter = (name: 'cash' | 'limit' | 'keep', value: string) => {
        const input = el.querySelector(`input[name="${name}"]`) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        return input;
      };
      return {el, saved, enter, problem: () => text(el.querySelector('.figures .problem'))};
    }

    it('saves an amount of cash, also zero, and a limit that is a share of the portfolio', () => {
      const {saved, enter, problem} = fields();
      enter('cash', '0');
      enter('limit', '12.5');
      expect(saved).toEqual([
        {cash: 0, lossBudgetPercent: undefined, reservePercent: undefined}, {cash: 500, lossBudgetPercent: 12.5, reservePercent: undefined},
      ]);
      expect(problem()).toBeUndefined();
    });

    it('takes an emptied field as "none": no cash, and the limit the plan starts from', () => {
      const {saved, enter, problem} = fields();
      enter('cash', '');
      enter('limit', '');
      expect(saved).toEqual([
        {cash: undefined, lossBudgetPercent: undefined, reservePercent: undefined}, {cash: 500, lossBudgetPercent: undefined, reservePercent: undefined},
      ]);
      expect(problem()).toBeUndefined();
    });

    // It used to wipe the amount that was saved, without a word.
    it('keeps the cash it had when the entry is less than zero, puts it back in the field and says why', () => {
      const {saved, enter, problem} = fields();
      const input = enter('cash', '-200');
      expect(saved).withContext('nothing is saved').toEqual([]);
      expect(input.value).toBe('500');
      expect(problem()).toBe('Cash cannot be less than zero, so it stays as it was.');
    });

    // 150 was taken as "I accept to lose one and a half times this portfolio on one stock".
    it('keeps the limit it had when the entry is not a share of the portfolio: zero, less, or more than 100', () => {
      const {saved, enter, problem} = fields();
      for (const entry of ['0', '-5', '150']) {
        const input = enter('limit', entry);
        expect(input.value).withContext(entry).toBe('');
        expect(problem()).withContext(entry).toBe('The limit is a share of this portfolio: above 0, at most 100. It stays as it was.');
      }
      expect(saved).toEqual([]);
    });

    // The third field: a second limit of the user's own, the share of the portfolio to keep in cash.
    it('has a third field, "Keep outside stocks", in percent, that says what it is for where the pointer rests', () => {
      const {el} = fields();
      const labels = Array.from(el.querySelectorAll('.settings label'));
      expect(labels.map(label => text(label.querySelector('span')))).toEqual(['Cash', 'Most I can lose on one stock', 'Keep outside stocks', 'Take a profit at']);
      const input = el.querySelector('input[name="keep"]') as HTMLInputElement;
      expect(input.value).withContext('empty until the user enters a share').toBe('');
      expect(text(input.closest('.field')!.querySelector('.unit'))).toBe('%');
      const box = TestBed.createComponent(PageWithTheBox).debugElement.query(By.directive(PositionsCardComponent)).componentInstance as PositionsCardComponent;
      expect(box.keepTooltip).toBe(
        'The share of this portfolio you want to keep in cash, whatever the plan offers: cash is the part that cannot fall with your ' +
        'stocks. The plan says when you are under it, and the split in "Could add" leaves that money unspent. Leave it empty to keep ' +
        'nothing back.');
    });

    it('saves a share to keep outside stocks beside the cash and the limit, and takes an emptied field or a zero as "none"', () => {
      const {saved, enter, problem} = fields();
      enter('keep', '20');
      enter('keep', '');
      enter('keep', '0');
      expect(saved).toEqual([
        {cash: 500, lossBudgetPercent: undefined, reservePercent: 20}, {cash: 500, lossBudgetPercent: undefined, reservePercent: undefined},
        {cash: 500, lossBudgetPercent: undefined, reservePercent: undefined},
      ]);
      expect(problem()).toBeUndefined();
    });

    it('keeps the share it had when the entry cannot be a share of the portfolio, and says why', () => {
      const {saved, enter, problem} = fields();
      for (const entry of ['-5', '100', '150']) {
        const input = enter('keep', entry);
        expect(input.value).withContext(entry).toBe('');
        expect(problem()).withContext(entry)
          .toBe('The share to keep outside stocks is a part of this portfolio: from 0 to under 100. It stays as it was.');
      }
      expect(saved).toEqual([]);
    });

    // One more setting of the user's own, there because taking a profit at +15% passed its test (pre-registered #9):
    // the level at which to take a profit. A choice among the levels on offer, not a number to type.
    describe('the level for taking a profit', () => {
      function box(portfolio: Partial<Portfolio> = {}) {
        const fixture = TestBed.createComponent(PageWithTheBox);
        fixture.componentInstance.card.portfolio = {...fixture.componentInstance.card.portfolio, ...portfolio};
        fixture.detectChanges();
        const el: HTMLElement = fixture.nativeElement;
        const card = fixture.debugElement.query(By.directive(PositionsCardComponent)).componentInstance as PositionsCardComponent;
        const saved: PortfolioSettings[] = [];
        card.settings.subscribe(it => saved.push(it));
        const select = () => el.querySelector('select[name="profit"]') as HTMLSelectElement;
        const pick = (value: string) => {
          select().value = value;
          select().dispatchEvent(new Event('change'));
          fixture.detectChanges();
        };
        return {el, card, saved, select, pick, fixture};
      }

      it('is offered beside the three fields, with "no level" chosen until the user picks one', () => {
        const {el, select} = box();
        expect(Array.from(el.querySelectorAll('.settings label > span:first-child')).map(text))
          .toEqual(['Cash', 'Most I can lose on one stock', 'Keep outside stocks', 'Take a profit at']);
        expect(Array.from(select().options).map(it => [it.value, text(it)])).toEqual([['', 'no level'], ['15', '+15%']]);
        expect(select().value).toBe('');
        expect(el.querySelector('p.budget.profit')).withContext('nothing to say about a level that is not picked').toBeNull();
      });

      it('says what it is for where the pointer or the keyboard rests on it', () => {
        expect(box().card.profitTooltip).toBe(
          'A level of your own for taking a profit on a stock you bought as a DIP BUY, in its first 6 months. Once such a stock is up ' +
          'that much on what you paid, the plan says so, and for the others it gives the price of a sell order at that level. In a ' +
          'test, selling there made a loss rarer and gave less on average than keeping, so the plan still says KEEP. Leave it at ' +
          '"no level" to have neither.');
      });

      it('saves the level with the other settings, and "no level" as none', () => {
        const {saved, pick} = box();
        pick('15');
        pick('');
        expect(saved).toEqual([
          {cash: 500, lossBudgetPercent: undefined, reservePercent: undefined, takeProfitPercent: 15},
          {cash: 500, lossBudgetPercent: undefined, reservePercent: undefined},
        ]);
      });

      it('shows the level the portfolio has, and says under the fields what that level did in the test', () => {
        const {el, select, card} = box({takeProfitPercent: 15});
        expect(select().value).toBe('15');
        const said = text(el.querySelector('p.budget.profit'));
        // What the level did in its test, then which stocks it counts for: a portfolio typed in from a broker's list
        // has no purchase days, and the level then names nothing, which the page has to say somewhere.
        expect(said).toBe(textsFor(EVIDENCE).takeProfitBrief(15) +
          ' It counts for the stocks you bought as a DIP BUY, in their first 6 months: a stock needs its purchase day for that.');
        expect(said).toMatch(/^At \+15%, in a test on \d+ stocks: \d+% ended below what was paid with a sell order placed in advance/);
        expect(card.profitText).toBe(said!);
      });

      // Both sides of the level in its test stay in sight with the level, as two figures: how often a stock ended
      // with a loss, and what it made on average, each beside what keeping gave.
      it('shows both sides of that level in the test as figures under the fields, while it is picked', () => {
        const {el, card} = box({takeProfitPercent: 15});
        const figures = Array.from(el.querySelectorAll('.figures dl.facts > div')).map(it => [text(it.querySelector('dt')), text(it.querySelector('dd'))]);
        const level = figures.filter(([label]) => label!.includes('+15%'));
        // Each says by itself what it is (a review found "on average" after a comma, and "kept 42%", hard to read).
        expect(level.map(([label]) => label)).toEqual(['In the test at +15%, ended with a loss', 'In the test at +15%, made on average']);
        expect(level[0][1]).toMatch(/^\d+% to \d+% of stocks, against \d+% when kept$/);
        expect(level[1][1]).toMatch(/^\+[\d.]+% to \+[\d.]+%, against \+[\d.]+% when kept$/);
        expect(card.settingFacts.filter(it => it.label.includes('+15%'))[0].tip).toBe(card.profitText);
        expect(box().card.settingFacts.some(it => it.label.includes('In the test'))).withContext('no level picked').toBeFalse();
      });

      it('keeps the level when another setting is saved', () => {
        const {el, saved, fixture} = box({takeProfitPercent: 15});
        const cash = el.querySelector('input[name="cash"]') as HTMLInputElement;
        cash.value = '600';
        cash.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        expect(saved).toEqual([{cash: 600, lossBudgetPercent: undefined, reservePercent: undefined, takeProfitPercent: 15}]);
      });

      // A level in the file that the tests do not offer (typed by hand, or one that is offered no longer): the plan
      // gives no line for it, and the field does not pretend it is in force.
      it('shows "no level" for a saved level that is not on offer, and says nothing about it', () => {
        const {el, select} = box({takeProfitPercent: 25});
        expect(select().value).toBe('');
        expect(el.querySelector('p.budget.profit')).toBeNull();
      });

      // Such a level is not in force and the page cannot show it. Left in the file it would come to life unpicked
      // if that level were ever offered: the next save of any setting drops it.
      it('does not carry a level that is not on offer into the next save', () => {
        const {el, saved, fixture} = box({takeProfitPercent: 25});
        const cash = el.querySelector('input[name="cash"]') as HTMLInputElement;
        cash.value = '600';
        cash.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        expect(saved).toEqual([{cash: 600, lossBudgetPercent: undefined, reservePercent: undefined}]);
      });
    });

    // A number field hands over an empty text for an entry it cannot read ("2-0", "e", "."), and says so in
    // `validity.badInput`. That is not an emptied field: emptied means "no cash", "the starting limit", "no share".
    it('keeps what was saved when a field holds something that is not a number, and says so', () => {
      const fixture = TestBed.createComponent(PageWithTheBox);
      fixture.detectChanges();
      const box = fixture.debugElement.query(By.directive(PositionsCardComponent)).componentInstance as PositionsCardComponent;
      const unreadable = () => ({value: '', validity: {badInput: true}}) as HTMLInputElement;
      const saved: unknown[] = [];
      box.settings.subscribe(it => saved.push(it));
      const cash = unreadable(), limit = unreadable(), keep = unreadable();
      box.setCash(cash);
      expect(box.problem).toBe('That is not a number, so the cash stays as it was.');
      expect(cash.value).withContext('what was saved is put back').toBe('500');
      box.setBudget(limit);
      expect(box.problem).toBe('That is not a number, so the limit stays as it was.');
      box.setKeep(keep);
      expect(box.problem).toBe('That is not a number, so the share to keep outside stocks stays as it was.');
      expect(saved).withContext('nothing is saved, and nothing that was saved is removed').toEqual([]);
    });

    it('says the problem as an alert, under the two fields, and no longer once an entry is taken', () => {
      const {el, enter, problem} = fields();
      enter('cash', '-200');
      const line = el.querySelector('.figures .problem')!;
      expect(line.getAttribute('role')).toBe('alert');
      expect(line.previousElementSibling?.classList.contains('settings')).withContext('right under the fields').toBeTrue();
      enter('cash', '250');
      expect(problem()).toBeUndefined();
    });
  });

  // What the stocks are worth and the result so far are what the eye looks for in that sentence.
  it('sets the headline\'s two figures stronger than its words, the result in the colour of a gain or a loss', () => {
    const figures = Array.from(shown().querySelectorAll('.headline strong')).map(it => [text(it), it.className]);
    expect(figures).toEqual([['$1,800', ''], ['−$200 (−10.0%)', 'loss']]);
  });

  // On a day no price arrives the holdings are listed from what is recorded. The cash alone must not be called
  // what the portfolio is worth, nor a limit worked out from it.
  it('says nothing of what the portfolio is worth, or of what the limit comes to, when no price arrived', () => {
    const card = cardWith([row('NVDA', {shares: 60})], {cash: 500});
    expect([card.limitText, card.cashText, card.reserveText].every(text => text !== '')).withContext('with prices').toBeTrue();
    card.unvalued = true;
    expect([card.limitText, card.cashText, card.reserveText]).toEqual(['', '', '']);
  });

  // On a wide box the plan stands beside the fields: both are in one block. The plan is first in the page too, as
  // it is first on the screen: the fields used to come before it, so the Tab key went to the far right and back,
  // and a screen reader heard four fields and their sentences before "To do today".
  it('keeps the plan\'s lines and the cash and limit fields together, under the names of the portfolios, the plan first', () => {
    const today = shown().querySelector('.today')!;
    expect(Array.from(today.children).map(part => part.className)).toEqual(['plan-lines', 'figures']);
    expect(today.querySelector('.plan-lines .lines')).withContext('the lines handed in by the page').not.toBeNull();
    expect(Array.from(today.querySelectorAll('.figures dl.facts dt')).map(text)).withContext('what the entries come to stays with the fields, as figures')
      .toEqual(['Worth with cash', 'In cash', 'Limit on one stock']);
    expect(today.querySelector('.figures p.budget')).withContext('and no sentence under the fields').toBeNull();
  });

  it('puts the comparison with the market beside that headline as figures, and its sentences with the explanations', () => {
    const el = shown(page => page.card = cardWith([dated('AMD'), dated('AMZN')]));
    const figures = Array.from(el.querySelectorAll('.own dl.facts > div')).map(it => [text(it.querySelector('dt')), text(it.querySelector('dd'))]);
    expect(figures).toEqual([['Against the market', '$280 behind'], ['Money in for', '14 weeks: too early to mean much']]);
    const lines = Array.from(el.querySelectorAll('p.market'));
    expect(lines.map(text)).toEqual([
      'The same money in the market on the same days: +$80 (+4.0%). Your stocks are $280 behind it.',
      'Too early to mean much: on average this money has been in for 14 weeks. The tests looked at 6 months.',
    ]);
    expect(lines.every(line => !!line.closest('.about-body'))).withContext('the sentences are behind the one control').toBeTrue();
    expect(Array.from(shown().querySelectorAll('.own dl.facts dd')).map(text)).withContext('these two have no purchase date').toEqual(['needs a purchase date']);
  });

  // The owner: "too much text and not much signal". The box had three sentences under its fields, three under the
  // headline, one under the table and up to seven beside it. One is left in sight, the instruction.
  it('keeps one sentence in sight in the whole box, what to do next, and the rest behind one control', () => {
    const el = shown(page => page.card = cardWith([dated('AMD'), row('AMZN'), row('NVDA', {shares: 60})], {cash: 500}));
    // (The plan's own lines are handed in by the page, and where the portfolios are saved is said at the foot.)
    const inSight = Array.from(el.querySelectorAll('mat-card p'))
      .filter(p => !p.closest('[hidden]') && !p.classList.contains('saved') && !p.classList.contains('lines')).map(text);
    expect(inSight).toEqual(['Bought or sold? Click the stock\'s symbol, here or in "Could add", to record it.']);
    const control = el.querySelector<HTMLButtonElement>('button.about-toggle')!;
    expect(text(control)).toBe('How to read this box');
    expect(el.querySelectorAll('button.about-toggle').length).toBe(1);
    expect(el.querySelector('mat-card app-more')).withContext('no "more" a sentence').toBeNull();
    const body = el.querySelector<HTMLElement>('.about-body')!;
    expect(body.hidden).toBeTrue();
    // Nothing is taken away: what the entries come to, the comparison, the two cases and what they add up to.
    expect(body.querySelectorAll('p.budget').length).toBeGreaterThan(1);
    expect(body.querySelectorAll('p.market').length).toBeGreaterThan(0);
    expect(text(body)).toContain('"Bad case" and "good case": in tests, 1 in 10 stocks like these');
    expect(text(body)).toContain('If the bad case hit both of your stocks marked DIP BUY at once');
  });

  it('gives the two cases of the marked stocks at once as a row at the foot of the table', () => {
    const el = shown(page => page.card = cardWith([row('AMD'), row('NVDA', {shares: 60})], {cash: 500}));
    const foot = el.querySelector('table tfoot tr.together')!;
    // The share of the portfolio stands with the row's name: in the cell it made the column, and the table, wider.
    expect(text(foot.querySelector('th'))).toBe('Both marked DIP BUY at once · bad case 6.5% of this portfolio');
    expect(Array.from(foot.querySelectorAll('td')).map(text)).toEqual(['−$2,583', '+$5,355']);
    const columns = el.querySelectorAll('table thead th').length;
    const spanned = Array.from(foot.children).reduce((sum, cell) => sum + Number(cell.getAttribute('colspan') ?? 1), 0);
    expect(spanned).withContext('the row is as wide as the table').toBe(columns);
    expect(shown().querySelector('table tfoot')).withContext('one marked stock: no row for it').toBeNull();
  });

  it('offers, in the row of a stock without a purchase date, to add the date where the weeks would stand', () => {
    const opened: string[] = [];
    const fixture = TestBed.createComponent(PageWithTheBox);
    fixture.componentInstance.card = cardWith([dated('AMD'), row('AMZN')]);
    fixture.detectChanges();
    fixture.debugElement.query(By.directive(PositionsCardComponent)).componentInstance.open.subscribe((symbol: string) => opened.push(symbol));
    const el: HTMLElement = fixture.nativeElement;
    const cells = Array.from(el.querySelectorAll('tbody td.held'));
    expect(cells.map(text)).toEqual(['week 15 of 26', 'add date']);
    const add = cells[1].querySelector('button')!;
    expect(add.getAttribute('aria-label')).toBe('Add the purchase date of AMZN');
    add.click();
    expect(opened).toEqual(['AMZN']);
  });

  it('says in each row what the plan says about the stock, and does not say under the table what the pointer shows', () => {
    const el = shown();
    expect(Array.from(el.querySelectorAll('tbody td.plan .plan-verb')).map(text)).toEqual(['KEEP', 'NO OPINION']);
    expect(el.querySelector('.plan-words')).withContext('the owner had these lines removed: they repeated the explanation of a row').toBeNull();
    expect(el.textContent).not.toContain('Keep this one for 6 months');
  });

  // Found by a review of the page: a browser that had not seen the page showed "Nothing in this portfolio yet" for
  // the second it takes the portfolios to arrive from the file.
  it('says that it is looking, not that there is nothing, until the portfolios have arrived', () => {
    const el = shown(page => {
      page.card = cardWith([]);
      page.savedIn = 'checking';
    });
    expect(text(el.querySelector('.empty'))).toBe('Looking for your portfolios on this computer.');
    expect(el.querySelector('.empty')!.getAttribute('aria-busy')).toBe('true');
  });

  describe('says where the portfolios are saved', () => {
    const note = (state: 'checking' | 'database' | 'memory' | 'browser') => {
      const el = shown(page => page.savedIn = state);
      return {words: text(el.querySelector('.note.saved')), warns: el.querySelector('.note.saved')!.classList.contains('warn')};
    };

    it('in the database, without a warning', () => {
      expect(note('database').words).toContain('Saved in the database on this computer.');
      expect(note('database').warns).toBeFalse();
    });

    it('on the development server, with a warning: what is entered is gone when it stops', () => {
      expect(note('memory').words).toContain('Not saved: this is the development server. What you enter here is gone when it stops.');
      expect(note('memory').warns).toBeTrue();
    });

    it('in the browser only, with a warning and how to start the app', () => {
      expect(note('browser').words).toContain('Saved in this browser only: the database is not answering. Start the app with "docker compose up -d".');
      expect(note('browser').warns).toBeTrue();
    });

    it('while it is still looking, without a warning', () => {
      expect(note('checking').words).toContain('Checking where your portfolios are saved.');
      expect(note('checking').warns).toBeFalse();
    });
  });

  // Found by a review of the page: while the first prices arrived, the box gave a worth, a "% of total" and a bad
  // case worked out from the few stocks priced so far. Nothing is said from half the prices.
  it('says how many stocks it holds and that it is working, and nothing worked out from prices, while they arrive', () => {
    const el = shown(page => page.loading = true);
    expect(text(el.querySelector('.own .headline'))).toBe('2 stocks');
    expect(text(el.querySelector('.empty.working'))).toBe("Working it out from today's prices.");
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('.note.market')).toBeNull();
    expect(el.querySelector('.own .columns')).toBeNull();
  });

  it('keeps the heading and says how to start while the portfolio holds nothing', () => {
    const el = shown(page => page.card = cardWith([]));
    expect(order(el)).toEqual(['Your plan today', 'names', 'lines', 'settings', 'What you own', 'saved']);
    // The lists are on the other view, so the sentence says where: "below" would point at nothing.
    expect(text(el.querySelector('.empty'))).toBe(
      'Nothing in this portfolio yet. Open a stock on the Watchlist and enter what you hold. Each one then gets a row here: ' +
      'how it is doing, how it compares with the market, and what a bad or a good half-year could mean for it.');
  });

  // Once a portfolio holds something, nothing on this view said where a purchase or a sale is recorded.
  it('says, under the table, how to change what is recorded for a stock', () => {
    expect(text(shown().querySelector('p.note.how'))).toBe('Bought or sold? Click the stock\'s symbol, here or in "Could add", to record it.');
    expect(shown().querySelector('.holdings-main p.note.how')).withContext('with the table, not at the foot of the box').not.toBeNull();
    expect(shown(page => page.card = cardWith([])).querySelector('p.note.how')).withContext('the empty portfolio has its own sentence').toBeNull();
  });

  // The long sentence used to make the column, and with it the whole table, too wide for a laptop screen.
  it('says how long a stock has been held in a few words, with what is unusual about it on a line of its own', () => {
    const el = shown(page => page.card = cardWith([row('AMD', {day: '2025-10-01', marked: false}), row('ARM', {day: '2026-10-15'})]));
    const held = Array.from(el.querySelectorAll('tbody td.held')).map(cell =>
      [text(cell.querySelector('.held-weeks')), text(cell.querySelector('.held-note')), cell.classList.contains('past')]);
    expect(held).toEqual([['59 weeks', 'longer than the tests followed', true], ['week 6 of 26', undefined, false]]);
  });

  // "Keep for 6 months" and "week 11 of 26" are one thought: the plan's word, then how far along it is.
  it('puts how long a stock has been held right after what the plan says about it', () => {
    const el = shown(page => page.card = cardWith([row('AMD', {day: '2026-10-15'})]));
    const headings = Array.from(el.querySelectorAll('thead th')).map(text);
    expect(headings.slice(0, 3)).toEqual(['Stock', 'Plan', 'Held']);
  });
});

describe('PositionsCardComponent, as shown: the order of the rows in "What you own"', () => {
  // ARM is worth 5,400, AMD 2,700 and NVDA 900: by size they stand ARM, AMD, NVDA; A to Z they stand AMD, ARM, NVDA.
  const holdings = () => cardWith([row('NVDA'), row('AMD', {shares: 30}), row('ARM', {shares: 60})]);
  const step = (kind: PlanStep['kind'], verb: string, symbols: string[]): PlanStep =>
    ({kind, verb, text: 'What to do.', why: 'Why.', items: symbols.map(symbol => ({symbol}))});

  function table(change: (page: PageWithTheBox) => void = page => page.card = holdings()) {
    const fixture = TestBed.createComponent(PageWithTheBox);
    change(fixture.componentInstance);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const heading = (label: string) => Array.from(el.querySelectorAll('thead th')).find(th => th.textContent?.trim() === label);
    return {
      page: fixture.componentInstance,
      box: fixture.debugElement.query(By.directive(PositionsCardComponent)).componentInstance as PositionsCardComponent,
      /** The stocks from the top row down. */
      symbols: () => Array.from(el.querySelectorAll('tbody th[scope="row"] .symbol')).map(it => it.textContent?.trim()),
      /** The headings that say their column is the one the rows follow, each with which way. */
      sorted: () => Array.from(el.querySelectorAll('thead th[aria-sort]')).map(th => `${th.textContent?.trim()}: ${th.getAttribute('aria-sort')}`),
      /** A click on a column heading, as the user makes it. */
      click: (label: string) => {
        heading(label)?.querySelector('button')?.click();
        fixture.detectChanges();
      },
      refresh: () => fixture.detectChanges(),
    };
  }

  it('lists the biggest holding first, and says on the "% of total" heading that it does', () => {
    const t = table();
    expect(t.symbols()).toEqual(['ARM', 'AMD', 'NVDA']);
    expect(t.sorted()).toEqual(['% of total: descending']);
  });

  it('follows a column when its heading is clicked, and turns around on a second click', () => {
    const t = table();
    t.click('Stock');
    expect(t.symbols()).toEqual(['AMD', 'ARM', 'NVDA']);
    expect(t.sorted()).toEqual(['Stock: ascending']);
    t.click('Stock');
    expect(t.symbols()).toEqual(['NVDA', 'ARM', 'AMD']);
    expect(t.sorted()).toEqual(['Stock: descending']);
  });

  it('orders by the column whose heading was clicked: each heading stands for its own column', () => {
    // One stock has a purchase date, so the three columns that need one are there too; and every column is shown.
    const t = table(page => {
      page.card = cardWith([row('AMD', {day: '2026-10-15'}), row('ARM')]);
      page.allColumns = true;
    });
    const headings: [string, SortColumn][] = [
      ['Stock', 'symbol'], ['Plan', 'plan'], ['Value', 'value'], ['Result', 'result'], ['Market since', 'market'], ['Bad case', 'bad'],
      ['Good case', 'good'], ['Held', 'held'], ['Shares', 'shares'], ['Price paid', 'paid'], ['Price now', 'now'], ['Bought', 'bought'],
      ['% of total', 'weight'],
    ];
    headings.forEach(([label, column]) => {
      t.click(label);
      expect(t.box.sort.column).withContext(label).toBe(column);
      expect(t.sorted().map(it => it.split(':')[0])).withContext(label).toEqual([label]);
    });
  });

  it('keeps the chosen order when the holdings change: new prices or another portfolio do not undo it', () => {
    const t = table();
    t.click('Stock');
    // MU is the bigger of the two, so by size it would stand first.
    t.page.card = cardWith([row('MU', {shares: 60}), row('AVGO')]);
    t.refresh();
    expect(t.symbols()).toEqual(['AVGO', 'MU']);
  });

  it('follows the "Plan" column once the plan is worked out: what asks for something first', () => {
    const t = table(page => {
      page.card = holdings();
      page.plan = [];
    });
    t.click('Plan');
    expect(t.symbols()).withContext('no plan yet: A to Z').toEqual(['AMD', 'ARM', 'NVDA']);
    t.page.plan = [step('trim', 'SELL SOME', ['NVDA']), step('hold', 'KEEP', ['AMD']), step('outside', 'NO OPINION', ['ARM'])];
    t.refresh();
    expect(t.symbols()).toEqual(['NVDA', 'AMD', 'ARM']);
  });
});

describe('PositionsCardComponent, as shown: which columns "What you own" has', () => {
  const text = (el?: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();
  const KEY = ['Stock', 'Plan', 'Held', 'Value', '% of total', 'Result', 'Market since', 'Bad case', 'Good case'];

  function table(change: (page: PageWithTheBox) => void = () => undefined) {
    const fixture = TestBed.createComponent(PageWithTheBox);
    fixture.componentInstance.card = cardWith([row('AMD', {day: '2026-10-15'}), row('ARM', {shares: 60})]);
    change(fixture.componentInstance);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return {
      el, fixture, page: fixture.componentInstance,
      box: fixture.debugElement.query(By.directive(PositionsCardComponent)).componentInstance as PositionsCardComponent,
      headings: () => Array.from(el.querySelectorAll('thead th')).map(text),
      choices: () => Array.from(el.querySelectorAll('.own .columns button')) as HTMLButtonElement[],
    };
  }

  // Thirteen columns of one weight hid the one that answers "do I do anything with this stock?".
  it('starts with the columns a decision rests on: the plan, how the stock stands, what a half-year could do', () => {
    const t = table();
    expect(t.headings()).toEqual(KEY);
    expect(t.el.querySelector('tbody .row-actions')).withContext('no button that removes a holding one click from reading').toBeNull();
    expect(t.el.querySelector('tbody .verdict')).withContext('the mark would stand as "DIP BUY" beside "KEEP"').toBeNull();
  });

  it('shows every column when asked: how the stock was bought, its mark, and the button that removes it', () => {
    const t = table(page => page.allColumns = true);
    expect(t.headings()).toEqual([...KEY, 'Shares', 'Price paid', 'Price now', 'Bought', 'Actions']);
    expect(text(t.el.querySelector('tbody .verdict'))).toBe('DIP BUY');
    expect(Array.from(t.el.querySelector('tbody .verdict')!.classList).sort()).withContext('drawn as the mark is drawn in the lists')
      .toEqual(['dip', 'verdict', 'verdict-pill']);
    expect(t.el.querySelector('tbody .row-actions button')!.getAttribute('aria-label')).toBe('Remove ARM from what you own');
  });

  it('offers the choice beside the heading, in the words of the lists\' own choice, and tells the page what was chosen', () => {
    const t = table();
    expect(t.choices().map(it => [text(it), it.getAttribute('aria-pressed')])).toEqual([['Key columns', 'true'], ['All columns', 'false']]);
    t.choices()[1].click();
    t.fixture.detectChanges();
    expect(t.page.asked).toEqual([true]);
    t.choices()[1].click();
    expect(t.page.asked).withContext('asking for what is shown already asks for nothing').toEqual([true]);
  });

  it('goes back to the biggest holding first when the column the rows followed is no longer shown', () => {
    const t = table(page => page.allColumns = true);
    (Array.from(t.el.querySelectorAll('thead th')).find(th => text(th) === 'Shares')!.querySelector('button') as HTMLButtonElement).click();
    t.fixture.detectChanges();
    expect(t.box.sort.column).toBe('shares');
    t.page.allColumns = false;
    t.fixture.detectChanges();
    expect(t.box.sort).toEqual({column: 'weight', direction: 'desc'});
    expect(Array.from(t.el.querySelectorAll('thead th[aria-sort]')).map(text)).toEqual(['% of total']);
  });

  // A symbol alone says nothing to a reader who does not know it. The name is one pointer movement away and takes
  // no room in the row: the owner asked for it there, and for the rows to stay compact.
  it('names a stock when its symbol is pointed at or reached with the keyboard, where the page knows the name', () => {
    const t = table(page => page.names = {AMD: 'Acme Micro Devices', ARM: 'ARM'});
    const tips = t.fixture.debugElement.queryAll(By.css('tbody th[scope="row"] .symbol')).map(symbol =>
      [text(symbol.nativeElement), symbol.injector.get(MatTooltip).message]);
    expect(tips).toEqual([['ARM', ''], ['AMD', 'Acme Micro Devices']]);
    expect(t.el.querySelector('tbody .company')).withContext('no second line in the row').toBeNull();
  });
});

describe('PositionsCardComponent: which portfolio needs you', () => {
  it('says on each portfolio\'s button what its plan expects, by name, and nothing when it expects nothing', () => {
    const card = cardWith([]);
    card.toDo = {p1: ['BUY'], p2: ['YOUR LIMIT', 'SELL SOME', 'BUY'], p3: []};
    expect(['p1', 'p2', 'p3', 'p4'].map(id => card.toDoText(id))).toEqual(['to do: BUY', 'to do: YOUR LIMIT, SELL SOME, BUY', '', '']);
  });
});

describe('PositionsCardComponent: how many of the stocks the plan covers', () => {
  const step = (kind: PlanStep['kind'], verb: string, symbols: string[]): PlanStep =>
    ({kind, verb, text: 'What to do.', why: 'Why.', items: symbols.map(symbol => ({symbol}))});
  const rows = [row('NVDA', {shares: 60}), row('AMD'), row('ARM'), row('AMZN', {marked: false})];
  const cardWithPlan = (...steps: PlanStep[]) => Object.assign(cardWith(rows), {plan: steps});

  it('says so when the plan covers one or two of them, a stock that is too big included, with what the test found', () => {
    const one = cardWithPlan(step('hold', 'KEEP', ['AMD']), step('outside', 'NO OPINION', ['AMZN']));
    expect(one.spreadText).toMatch(
      /^The plan covers 1 of your stocks\. In tests, three stocks held together had a milder bad half-year than one alone \(1 in 10 lost \d+% or more, against \d+%\)\.$/);
    const two = cardWithPlan(step('trim', 'SELL SOME', ['NVDA']), step('hold', 'KEEP', ['AMD']), step('outside', 'NO OPINION', ['AMZN']));
    expect(two.spreadText).toContain('The plan covers 2 of your stocks.');
  });

  it('says nothing once the plan covers three, when it covers none, or before the plan is worked out', () => {
    expect(cardWithPlan(step('trim', 'SELL SOME', ['NVDA']), step('hold', 'KEEP', ['AMD', 'ARM'])).spreadText).toBe('');
    expect(cardWithPlan(step('outside', 'NO OPINION', ['AMZN'])).spreadText).toBe('');
    expect(cardWith(rows).spreadText).toBe('');
  });

  // A holding that is up to the level the user set for taking a profit keeps the plan's own word (KEEP, or SELL SOME
  // when it is over the limit): the level is said beside it, and its explanation follows the plan's sentence.
  it('says beside the plan\'s word that a stock is at the level for taking a profit, and explains it after the plan\'s sentence', () => {
    const card = cardWithPlan(
      {kind: 'level', verb: 'YOUR LEVEL', text: 'Up 15% or more on what you paid: the level you set. Selling is your call.', why: 'Why.',
        items: [{symbol: 'AMD', label: 'up 18%'}]},
      step('hold', 'KEEP', ['AMD', 'ARM']));
    const [, amd, arm] = rows;
    expect([card.planOf(amd)!.verb, card.levelNote(amd)]).toEqual(['KEEP', 'your level: up 18%']);
    expect([card.planOf(arm)!.verb, card.levelNote(arm)]).toEqual(['KEEP', '']);
    expect(card.planAsks(amd)).withContext('KEEP asks for nothing, and neither does the level').toBeFalse();
    expect(card.planTooltip(amd)).toBe(
      'KEEP: What to do.\nYOUR LEVEL: Up 15% or more on what you paid: the level you set. Selling is your call.');
    expect(card.spreadText).withContext('counted among the stocks the plan covers, as before').toContain('The plan covers 2 of your stocks.');
  });
});

// A whole account's holdings went with one click on a small link beside "Rename", and the way back (Undo in the
// notice) is gone at the next change, which may be a click on another portfolio's name. So this one act is asked
// about once, in place.
describe('PositionsCardComponent: deleting a portfolio', () => {
  function card(positions: Record<string, { symbol: string, shares: number, price: number }>): PositionsCardComponent {
    const it = new PositionsCardComponent();
    it.book = {v: 2, active: 'p1', portfolios: [{id: 'p1', name: 'Savings', v: 1, positions}]} as unknown as PositionsCardComponent['book'];
    it.portfolio = {v: 1, positions};
    return it;
  }
  const two = {ACME: {symbol: 'ACME', shares: 10, price: 50}, ZED: {symbol: 'ZED', shares: 5, price: 20}};

  it('asks first, naming the portfolio and what goes with it', () => {
    expect(card(two).deleteQuestion).toBe('Delete "Savings" with its 2 stocks?');
    expect(card({ACME: two.ACME}).deleteQuestion).toBe('Delete "Savings" with its 1 stock?');
    expect(card({}).deleteQuestion).toBe('Delete "Savings"? It holds no stocks.');
  });

  it('deletes nothing when "Delete" is clicked, and only on the answer "Delete it"', () => {
    const it = card(two);
    let removed = 0;
    it.removePortfolio.subscribe(() => removed++);
    it.naming = 'delete';
    expect(removed).withContext('the question is open, nothing is gone').toBe(0);
    it.confirmDelete();
    expect(removed).toBe(1);
    expect(it.naming as string).withContext('the links are back').toBe('none');
  });
});

describe('PositionsCardComponent: small things a reader with fresh eyes found', () => {
  it('shows an amount of cash with cents with both of them, as the sentence beside it does', () => {
    const card = (cash?: number) => Object.assign(new PositionsCardComponent(), {portfolio: {v: 1, cash, positions: {}}});
    expect(card(40.5).cashValue).toBe('40.50');
    expect(card(10000).cashValue).toBe('10000');
    expect(card(undefined).cashValue).toBe('');
  });

  it('brings the three links back when a name or the delete question is closed without a change', () => {
    const card = new PositionsCardComponent();
    card.naming = 'delete';
    card.closeNaming();
    expect(card.naming as string).toBe('none');
    card.naming = 'rename';
    card.closeNaming();
    expect(card.naming as string).toBe('none');
  });
});

// Found by a review of the page: "keep $3,000" stood in green right after an amber SELL SOME, and read as good news.
describe('PositionsCardComponent: the colour of the note beside a stock\'s verb', () => {
  const nvda = row('NVDA', {shares: 60});
  const planned = (plan: object) => {
    const card = cardWith([nvda]);
    spyOn(card, 'planOf').and.returnValue(plan as ReturnType<PositionsCardComponent['planOf']>);
    return card;
  };

  it('is the green of BUY only for an amount that could be bought', () => {
    expect(planned({kind: 'hold', verb: 'KEEP', text: '', add: {verb: 'BUY', text: '', label: 'add 4.8% ($2,000)'}}).noteIsPurchase(nvda)).toBeTrue();
  });

  it('is plain ink for an amount that belongs to another verb, and for no note at all', () => {
    expect(planned({kind: 'trim', verb: 'SELL SOME', text: '', amount: 'keep $3,000'}).noteIsPurchase(nvda)).toBeFalse();
    expect(planned({kind: 'hold', verb: 'KEEP', text: ''}).noteIsPurchase(nvda)).toBeFalse();
  });
});
