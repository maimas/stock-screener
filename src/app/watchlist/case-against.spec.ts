import {Stock} from "../api/microsoft-money.service";
import {againstCell, CASE_COLUMNS, CASE_HELP, caseOf, COMPARE_NOTE, FactCell, FactKey, sideBySide, StockCase} from "./case-against";
import {EVIDENCE, inTen, VOLATILITY_COLUMN_NOTE, VOLATILITY_GROUPS_NOTE, volatilityNote} from "./evidence";
import {signedPercent, signedWholePercent} from "./format";
import {trendFor} from "./market-math";
import {computeSignal, TESTED_DEPTH_P95, TESTED_VOL_P95} from "./signal";
import {resultsSoonLine} from "./results-soon";
import {SnapshotLog} from "./snapshot-log";
import {COLUMNS} from "./recommendations";
import {FACT_COLUMNS, FACT_HELP, factsOf} from "./stock-facts";
import {flatCloses, makeStock, NOW, reportedQuarters, StockSpec, weeklyPattern} from "./testing/fixtures";

// The owner of the page, of "Could add": "I need the risk analysis to be surfaced so that I can pick the risky
// one. Also there should be some sort of way of comparing them against each other". A stock's risk stood only in
// its details on the Watchlist. Here it is worked out for a row of the table (how much the price swings; what
// speaks against the stock) and for a block that sets the ticked stocks side by side, a row a fact.

const SWINGS_69 = [0.10, -1 / 11];        // about 68.8% a year: volatile
const SWINGS_40 = [0.057, -0.0539];       // about 40.0% a year: between calm and volatile

/** Weekly returns that swing a little more than `percent` a year (the tests' 95th percentile moves when they are re-run). */
function swingsOver(percent: number): number[] {
  let up = 0.01;
  while ((up + up / (1 + up)) / 2 * Math.sqrt(52) * 100 < percent + 3) {
    up += 0.005;
  }
  return [up, -up / (1 + up)];
}

/** A made-up company marked DIP BUY: sales up 20% on a year ago, the price `below` % under its highest of the past year. */
function marked(o: { below?: number, swings?: number[] } & StockSpec = {}): Stock {
  const {below = 20, swings, ...rest} = o;
  return makeStock({
    symbol: 'ACME', price: 100 - below, high52: 100,
    quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
    closes: swings ? weeklyPattern(250, swings) : flatCloses(250, 100 - below),
    ...rest,
  });
}

function caseAt(stock: Stock, o: { log?: SnapshotLog, today?: string } = {}): StockCase {
  return caseOf(stock, {signal: computeSignal(stock, NOW), now: NOW, ...o})!;
}

function tags(stock: Stock): string[] {
  return caseAt(stock).against.map(it => it.tag);
}

/** A report that is `days` days after the fixed "today" of these tests. */
function reportsIn(stock: Stock, days: number): Stock {
  Object.assign(stock.forecast!, {ExpectedReportDate: new Date(NOW.getTime() + days * 86_400_000).toISOString()});
  return stock;
}

describe('caseOf (a stock\'s risk, for a row of "Could add")', () => {
  describe('how much the price swings', () => {
    it('is a whole percent, with the group it puts a stock marked DIP BUY in', () => {
      const volatile = caseAt(marked({swings: SWINGS_69}));
      expect(volatile.swings).toBe('69%');
      expect(volatile.group).toBe('volatile');
      expect(volatile.volatility).toBeCloseTo(68.8, 0);
      expect(caseAt(marked()).group).toBe('calm');
      const between = caseAt(marked({swings: SWINGS_40}));
      expect([between.swings, between.group]).toEqual(['40%', 'middle']);
    });

    it('says under the pointer what the tests found for stocks that swing like it', () => {
      const stock = marked({swings: SWINGS_69});
      expect(caseAt(stock).swingsTip).toBe(volatilityNote('high', computeSignal(stock, NOW)!.volatility!));
      expect(caseAt(marked({swings: SWINGS_40})).swingsTip)
        .toBe(`Swings of about 40% a year (from weekly returns over the past year). ${VOLATILITY_GROUPS_NOTE}`);
    });

    it('marks a stock that dropped further than 19 in 20 of the tested ones, with the reason under the pointer', () => {
      const deep = marked({below: TESTED_DEPTH_P95 + 3, swings: SWINGS_69});
      const signal = computeSignal(deep, NOW)!;
      expect(caseAt(deep).beyondTests).toBeTrue();
      expect(caseAt(deep).swingsTip).toBe(`${volatilityNote('high', signal.volatility!)}\n${signal.rareInTests}`);
      expect(caseAt(marked({swings: SWINGS_69})).beyondTests).toBeFalse();
    });

    it('has no group for a stock that is not marked DIP BUY: only those were measured', () => {
      const watch = caseAt(marked({below: 5, swings: SWINGS_69}));
      expect([watch.swings, watch.group, watch.beyondTests]).toEqual(['69%', undefined, false]);
    });
  });

  describe('what speaks against it (facts no test could use, or that made no difference)', () => {
    it('is nothing when none of its context is marked against it', () => {
      const plain = caseAt(marked());
      expect(plain.against).toEqual([]);
      expect(plain.againstTip).toBe('');
    });

    it('tags a company that makes no profit, with the sentence its details use', () => {
      expect(caseAt(marked({providerEpsTtm: -1.25})).against).toEqual([
        {tag: 'no profit', text: 'Not profitable: profit per share over the past year -1.25 (made no difference in tests).'},
      ]);
    });

    it('tags high debt and a price that is high for the profit', () => {
      const stock = marked();
      Object.assign(stock.quote!, {peRatio: 40});
      Object.assign(stock.equity!.analysis!.companyMetrics!, {pE5YearLowRatio: 10, pE5YearHighRatio: 30, debtEquityRatio: 3});
      expect(tags(stock)).toEqual(['high debt', 'high P/E']);
    });

    it('tags a weak rating by analysts and a target under today\'s price', () => {
      expect(tags(marked({recommendationRate: 3.2}))).toEqual(['weak rating']);
      expect(tags(marked({medianTarget: 70}))).toEqual(['low target']);
      expect(tags(marked({recommendationRate: 1.4, medianTarget: 120}))).withContext('a strong rating, a target above').toEqual([]);
    });

    it('tags results that are due within two weeks, in the words of the details', () => {
      expect(caseAt(reportsIn(marked(), 5)).against).toEqual([{tag: 'results in 5d', text: resultsSoonLine(5)}]);
      expect(tags(reportsIn(marked(), 0))).toEqual(['results today']);
      expect(tags(reportsIn(marked(), 1))).toEqual(['results tomorrow']);
      expect(tags(reportsIn(marked(), 30))).withContext('a month away').toEqual([]);
    });

    it('tags a target that analysts cut since the daily log\'s reading of three weeks ago', () => {
      const log: SnapshotLog = {v: 1, days: {'2026-10-30': {s: {ACME: {p: 80, v: 'D', t: 120}}}}};
      const when = new Date('2026-10-30T12:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
      const cut = caseAt(marked({medianTarget: 96}), {log, today: '2026-11-21'});
      expect(cut.against).toEqual([{tag: 'target cut', text: `Analysts cut their middle price target by 20% since ${when}.`}]);
      expect(caseAt(marked({medianTarget: 132}), {log, today: '2026-11-21'}).against).withContext('raised').toEqual([]);
      expect(caseAt(marked({medianTarget: 96}), {log, today: '2026-11-05'}).against).withContext('a reading of last week').toEqual([]);
    });

    it('tags a line it has no word for with that line\'s own first words, so that none is dropped', () => {
      const stock = marked();
      const signal = {...computeSignal(stock, NOW)!, factors: [
        {points: -1, reason: 'Shrinking sales: down for three quarters (made no difference in tests)'},
        {points: 1, reason: 'Something that speaks for it'},
      ]};
      expect(caseOf(stock, {signal, now: NOW})!.against).toEqual([
        {tag: 'shrinking sales', text: 'Shrinking sales: down for three quarters (made no difference in tests).'},
      ]);
    });

    it('puts the company first, then the analysts, then the calendar, and says every sentence under the pointer', () => {
      const stock = reportsIn(marked({providerEpsTtm: -2, recommendationRate: 3.2, medianTarget: 70}), 5);
      Object.assign(stock.equity!.analysis!.companyMetrics!, {debtEquityRatio: 3});
      const all = caseAt(stock);
      expect(all.against.map(it => it.tag)).toEqual(['no profit', 'high debt', 'weak rating', 'low target', 'results in 5d']);
      expect(all.againstTip).toBe(all.against.map(it => it.text).join('\n'));
    });
  });

  it('has nothing to say about a stock the page cannot judge', () => {
    const young = makeStock({quarters: reportedQuarters(1), closes: flatCloses(2)});
    expect(caseOf(young, {signal: computeSignal(young, NOW), now: NOW})).toBeUndefined();
    expect(caseOf(undefined)).toBeUndefined();
  });

  it('names the two columns, and says of each what it is', () => {
    expect(CASE_COLUMNS).toEqual({swings: 'Swings', against: 'Against'});
    expect(CASE_HELP.swings).toContain(VOLATILITY_COLUMN_NOTE);
    expect(CASE_HELP.swings).toContain('19 in 20');
    expect(CASE_HELP.against).toContain('not a tested reason');
  });
});

describe('againstCell (what the "Against" cell of a row prints)', () => {
  const three = [{tag: 'no profit', text: 'a'}, {tag: 'high debt', text: 'b'}, {tag: 'results in 5d', text: 'c'}];

  it('prints two tags at most and counts the rest', () => {
    expect(againstCell(three)).toEqual({tags: ['no profit', 'high debt'], more: 1});
    expect(againstCell(three.slice(0, 2))).toEqual({tags: ['no profit', 'high debt'], more: 0});
    expect(againstCell([])).toEqual({tags: [], more: 0});
  });

  it('can be told to print fewer, for a table with less room', () => {
    expect(againstCell(three, 1)).toEqual({tags: ['no profit'], more: 2});
  });
});

describe('the facts of a stock, for the block that sets stocks side by side', () => {
  it('says what was tested: the mark\'s two facts, the swing, and what stocks that swing like it did', () => {
    const stock = marked({swings: SWINGS_69});
    const facts = caseAt(stock).facts, known = factsOf(stock, computeSignal(stock, NOW))!, tested = EVIDENCE.cases.volatile;
    expect(facts.dropped).toEqual({value: known.dropped, tip: known.droppedTip});
    expect(facts.growing).toEqual({value: 'sales +20%', tip: known.growingTip});
    expect(facts.swings?.value).toBe('69% a year · volatile');
    expect(facts.fell?.value).toBe(inTen(EVIDENCE.fresh.fellPercent.volatile));
    expect(facts.bad?.value).toBe(signedWholePercent(-tested.bad));
    expect(facts.typical?.value).toBe(signedPercent(tested.typical));
    expect(facts.good?.value).toBe(signedWholePercent(tested.good));
    expect(facts.beyond).toBeUndefined();
  });

  it('has no "fell further" figure for a stock between calm and volatile: the tests have none', () => {
    const facts = caseAt(marked({swings: SWINGS_40})).facts;
    expect(facts.swings?.value).toBe('40% a year · between');
    expect(facts.fell).toBeUndefined();
    expect(facts.bad?.value).toBe(signedWholePercent(-EVIDENCE.cases.middle.bad));
    expect(caseAt(marked()).facts.fell?.value).withContext('a calm one').toBe(inTen(EVIDENCE.fresh.fellPercent.calm));
  });

  it('says in what a stock is beyond what the tests saw', () => {
    const deep = marked({below: TESTED_DEPTH_P95 + 3});
    expect(caseAt(deep).facts.beyond).toEqual({value: 'dropped this far', tip: computeSignal(deep, NOW)!.rareInTests});
    expect(caseAt(marked({swings: swingsOver(TESTED_VOL_P95)})).facts.beyond?.value).toBe('swings this much');
    expect(caseAt(marked({below: TESTED_DEPTH_P95 + 3, swings: swingsOver(TESTED_VOL_P95)})).facts.beyond?.value)
      .toBe('dropped this far, swings this much');
  });

  it('says what no test could use: profit, debt, the price for the profit, the analysts', () => {
    const stock = marked({providerEpsTtm: -2, recommendationRate: 3.2, medianTarget: 120});
    Object.assign(stock.quote!, {peRatio: 40});
    Object.assign(stock.equity!.analysis!.companyMetrics!, {pE5YearLowRatio: 10, pE5YearHighRatio: 30, debtEquityRatio: 3});
    const facts = caseAt(stock).facts, known = factsOf(stock, computeSignal(stock, NOW))!;
    expect(facts.profit?.value).toBe('no');
    expect(facts.debt?.value).toBe('3.0 times · high');
    expect(facts.pe?.value).toBe('40 · above its range');
    expect(facts.target).toEqual({value: '+50%', tip: known.targetTip, n: 50});
    expect(facts.rating?.value).toBe('3.20');
  });

  it('says them for a company in good shape too, without a word against it', () => {
    const stock = marked({providerEpsTtm: 4, recommendationRate: 1.4});
    Object.assign(stock.quote!, {peRatio: 20});
    Object.assign(stock.equity!.analysis!.companyMetrics!, {pE5YearLowRatio: 10, pE5YearHighRatio: 30, debtEquityRatio: 0.44});
    const facts = caseAt(stock).facts;
    expect([facts.profit?.value, facts.debt?.value, facts.pe?.value, facts.rating?.value])
      .toEqual(['yes', '0.4 times', '20 · within its range', '1.40']);
  });

  // The owner, of what stands in "Against": "I want that in red so that we know it's a "no no"". The block sets the
  // same facts in red, so each cell says whether it is one of them: the ones a tag names, no others.
  it('flags the cells that speak against the stock: the facts its tags name', () => {
    const stock = reportsIn(marked({providerEpsTtm: -2, recommendationRate: 3.2, medianTarget: 70}), 5);
    Object.assign(stock.quote!, {peRatio: 40});
    Object.assign(stock.equity!.analysis!.companyMetrics!, {pE5YearLowRatio: 10, pE5YearHighRatio: 30, debtEquityRatio: 3});
    const found = caseAt(stock);
    expect(found.against.map(it => it.tag)).toEqual(['no profit', 'high debt', 'high P/E', 'weak rating', 'low target', 'results in 5d']);
    const flagged = (Object.keys(found.facts) as FactKey[]).filter(key => found.facts[key]!.against);
    expect(flagged.sort()).toEqual(['debt', 'pe', 'profit', 'rating', 'results', 'target']);
  });

  it('flags a target that analysts cut, and not one they raised', () => {
    const log: SnapshotLog = {v: 1, days: {'2026-10-30': {s: {ACME: {p: 80, v: 'D', t: 120}}}}};
    expect(caseAt(marked({medianTarget: 96}), {log, today: '2026-11-21'}).facts.targetChange?.against).toBeTrue();
    expect(caseAt(marked({medianTarget: 132}), {log, today: '2026-11-21'}).facts.targetChange?.against).toBeUndefined();
  });

  it('flags nothing of a company in good shape, and nothing of what was tested', () => {
    const stock = reportsIn(marked({below: TESTED_DEPTH_P95 + 3, providerEpsTtm: 4, recommendationRate: 1.4, medianTarget: 120}), 30);
    Object.assign(stock.quote!, {peRatio: 20});
    Object.assign(stock.equity!.analysis!.companyMetrics!, {pE5YearLowRatio: 10, pE5YearHighRatio: 30, debtEquityRatio: 0.44});
    const facts = caseAt(stock).facts;
    expect(facts.beyond?.value).withContext('beyond the tests: tested, so it has the warning sign of "Swings", not this red').toBe('dropped this far');
    expect((Object.keys(facts) as FactKey[]).filter(key => facts[key]!.against)).toEqual([]);
  });

  it('gives the figures that can be the best of several stocks as numbers, as they are printed', () => {
    const stock = marked({swings: SWINGS_69, recommendationRate: 1.4, medianTarget: 120});
    Object.assign(stock.equity!.analysis!.companyMetrics!, {debtEquityRatio: 0.44});
    const facts = caseAt(stock).facts, tested = EVIDENCE.cases.volatile;
    expect([facts.swings?.n, facts.fell?.n, facts.bad?.n, facts.typical?.n, facts.good?.n])
      .toEqual([69, Math.round(EVIDENCE.fresh.fellPercent.volatile / 10), tested.bad, tested.typical, tested.good]);
    expect([facts.debt?.n, facts.target?.n, facts.rating?.n]).toEqual([0.4, 50, 1.4]);
    expect([facts.dropped?.n, facts.growing?.n, facts.trend?.n]).withContext('no best value in these rows').toEqual([undefined, undefined, undefined]);
  });

  it('leaves out what the page does not know', () => {
    const facts = caseAt(marked()).facts;
    const unknown: FactKey[] = ['profit', 'debt', 'pe', 'target', 'rating', 'targetChange', 'owners', 'results'];
    unknown.forEach(key => expect(facts[key]).withContext(key).toBeUndefined());
  });

  it('says how many of its owners are in profit, as "Could add" does', () => {
    const traded = marked({closes: [...flatCloses(200, 100), ...flatCloses(50, 80)]});
    Object.assign(traded.equity!.analysis!.shareStatistics!, {sharesOutstanding: 50_000_000});
    const known = factsOf(traded, computeSignal(traded, NOW))!;
    expect(known.holders).not.toBe('');
    expect(caseAt(traded).facts.owners).toEqual({value: known.holders, tip: known.holdersTip});
  });

  it('says where the price stands against its average of the past 200 days, and which way that goes', () => {
    const falling = marked({closes: [...flatCloses(200, 100), ...flatCloses(50, 80)]});
    const trend = trendFor(falling)!;
    expect(trend.ma200SlopePercent).toBeLessThan(0);
    expect(caseAt(falling).facts.trend?.value).toBe(`${signedWholePercent(trend.vs200Percent)} · average falling`);
    expect(caseAt(marked()).facts.trend?.value).toBe('0% · average rising');
  });

  it('says how analysts\' target moved since the log\'s reading of three weeks ago', () => {
    const log: SnapshotLog = {v: 1, days: {'2026-10-30': {s: {ACME: {p: 80, v: 'D', t: 120}}}}};
    const when = new Date('2026-10-30T12:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    expect(caseAt(marked({medianTarget: 96}), {log, today: '2026-11-21'}).facts.targetChange?.value).toBe(`cut −20% since ${when}`);
    expect(caseAt(marked({medianTarget: 132}), {log, today: '2026-11-21'}).facts.targetChange?.value).toBe(`raised +10% since ${when}`);
    expect(caseAt(marked({medianTarget: 120}), {log, today: '2026-11-21'}).facts.targetChange).withContext('unchanged').toBeUndefined();
  });

  it('says when the next results are due, near or far', () => {
    expect(caseAt(reportsIn(marked(), 5)).facts.results).toEqual({value: 'in 5 days', tip: resultsSoonLine(5), against: true});
    expect(caseAt(reportsIn(marked(), 0)).facts.results?.value).toBe('today');
    expect(caseAt(reportsIn(marked(), 1)).facts.results?.value).toBe('tomorrow');
    expect(caseAt(reportsIn(marked(), 30)).facts.results).withContext('a month away: no word against it').toEqual({value: 'in 30 days'});
  });

  it('says the biggest one-day fall since the high, or that the price slid', () => {
    const closes = [...flatCloses(200, 100), ...flatCloses(50, 88)];
    const fell = marked({closes});
    const when = new Date(fell.chart!.timeStamps[200]).toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'});
    expect(caseAt(fell).facts.bigDay?.value).toBe(`−12.0% on ${when}`);
    expect(caseAt(marked()).facts.bigDay?.value).toBe('none: a slide');
  });
});

describe('sideBySide (the ticked stocks of "Could add", a row a fact)', () => {
  /** A case that says only these facts: a word, or a whole cell (its figure, a word against it). */
  function saying(facts: Partial<Record<FactKey, string | FactCell>>): StockCase {
    return {
      swings: '', beyondTests: false, swingsTip: '', against: [], againstTip: '',
      facts: Object.fromEntries(Object.entries(facts).map(([key, said]) => [key, typeof said === 'string' ? {value: said} : said!])),
    };
  }

  /** What each stock says for one fact, as figures, set side by side: which of them are marked as the best. */
  function bestOf(key: FactKey, ...figures: (number | FactCell | undefined)[]): boolean[] {
    const cell = (it: number | FactCell | undefined) => typeof it === 'number' ? {value: String(it), n: it} : it;
    const shown = sideBySide(figures.map((it, i) => ({symbol: `S${i}`, case: saying(cell(it) ? {[key]: cell(it)} : {})})))!;
    return shown.parts.flatMap(part => part.rows).find(row => row.key === key)!.cells.map(it => !!it.best);
  }

  const one = saying({dropped: '−38%', swings: '47% a year · volatile', profit: 'yes', bigDay: '−10.9% on Mar 20'});
  const other = saying({dropped: '−48%', swings: '60% a year · volatile', profit: 'no', debt: '3.0 times · high', bigDay: 'none: a slide'});

  it('is nothing while no stock is ticked', () => {
    expect(sideBySide([])).toBeUndefined();
  });

  it('is nothing while the page knows no fact of the ticked stocks: a title over an empty table says nothing', () => {
    expect(sideBySide([{symbol: 'AAA', case: undefined}, {symbol: 'BBB', case: saying({})}])).toBeUndefined();
  });

  it('has a column a stock, in the order given, under a title that counts them', () => {
    const two = sideBySide([{symbol: 'AAA', case: one}, {symbol: 'BBB', case: other}])!;
    expect(two.symbols).toEqual(['AAA', 'BBB']);
    expect(two.title).toBe('2 ticked stocks, side by side');
    expect(sideBySide([{symbol: 'AAA', case: one}])!.title).toBe('AAA, fact by fact');
  });

  it('keeps what was tested apart from what was not, and from why the price dropped', () => {
    const parts = sideBySide([{symbol: 'AAA', case: one}, {symbol: 'BBB', case: other}])!.parts;
    // "Context", as a stock's details call it, not "Not tested": some of it was tested and made no difference.
    expect(parts.map(part => part.title)).toEqual(['Tested', 'Context', 'Why it dropped']);
    expect(parts.map(part => part.rows.map(row => row.key))).toEqual([['dropped', 'swings'], ['profit', 'debt'], ['bigDay']]);
    expect(parts[1].note).toBe('not part of the mark: no test could use it, or it made no difference');
  });

  it('prints each stock\'s value in its column, and a dash where the page does not know it', () => {
    const rows = sideBySide([{symbol: 'AAA', case: one}, {symbol: 'BBB', case: other}])!.parts.flatMap(part => part.rows);
    expect(rows.find(row => row.key === 'dropped')!.cells.map(cell => cell.value)).toEqual(['−38%', '−48%']);
    expect(rows.find(row => row.key === 'debt')!.cells.map(cell => cell.value)).toEqual(['—', '3.0 times · high']);
  });

  it('names each row and says what it is, in the words "Could add" uses for the same fact', () => {
    const rows = sideBySide([{symbol: 'AAA', case: saying({dropped: '−38%', target: '+47%', owners: '1%'})}])!.parts.flatMap(part => part.rows);
    expect(rows.map(row => [row.label, row.help])).toEqual([
      [FACT_COLUMNS.dropped, FACT_HELP.dropped], [FACT_COLUMNS.target, FACT_HELP.target], [FACT_COLUMNS.holders, FACT_HELP.holders],
    ]);
    // One name a fact on the page: the swing and the three cases are named as the columns of the table above the block.
    const cases = sideBySide([{symbol: 'AAA', case: saying({swings: '47% a year', bad: '−41%', typical: '+2.4%', good: '+85%'})}])!;
    expect(cases.parts[0].rows.map(row => row.label)).toEqual([CASE_COLUMNS.swings, COLUMNS.bad, COLUMNS.typical, COLUMNS.good]);
    expect(cases.parts[0].rows.map(row => row.label)).toEqual(['Swings', 'Bad case', 'Typical', 'Good case']);
  });

  it('leaves out a row no stock has a value for, and a part without rows', () => {
    const only = sideBySide([{symbol: 'AAA', case: saying({dropped: '−38%'})}, {symbol: 'BBB', case: undefined}])!;
    expect(only.parts.map(part => part.title)).withContext('no row of context, none about the fall').toEqual(['Tested']);
    expect(only.parts[0].rows.map(row => row.cells.map(cell => cell.value))).toEqual([['−38%', '—']]);
  });

  // The owner, of the block: "highlight the winers so that it's easy to pick". Asked which rows, with what the tests
  // found for each, they chose: the rows where the tests say which way is better, and the rows where the reading is
  // plain though untested (debt, analysts' target and rating); no others, and no count of wins a stock.
  describe('the best of the ticked stocks in a row', () => {
    it('is the lowest swing, the fewest that fell further and the mildest bad case: the tests say lower is better', () => {
      expect(bestOf('swings', 69, 88, 47)).toEqual([false, false, true]);
      expect(bestOf('fell', 4, 2, 4)).toEqual([false, true, false]);
      expect(bestOf('bad', 41, 23, 31)).toEqual([false, true, false]);
    });

    it('is the highest typical result and the highest good case', () => {
      expect(bestOf('typical', 2.4, 4.1, -0.1)).toEqual([false, true, false]);
      expect(bestOf('good', 85, 41, 56)).toEqual([true, false, false]);
    });

    it('is, in the context, the least debt, the highest target and the strongest rating (the lowest figure)', () => {
      expect(bestOf('debt', 0.1, 0.6, 1.1)).toEqual([true, false, false]);
      expect(bestOf('target', 60, 175, 74)).toEqual([false, true, false]);
      expect(bestOf('rating', 1.33, 1.93, 1.28)).toEqual([false, false, true]);
    });

    it('is every stock that shares the best figure, as printed', () => {
      expect(bestOf('debt', 0, 0.6, 0)).toEqual([true, false, true]);
    });

    it('is none where all say the same, and none for one stock alone: there is nothing to be better than', () => {
      expect(bestOf('swings', 47, 47, 47)).toEqual([false, false, false]);
      expect(bestOf('swings', 47)).toEqual([false]);
    });

    it('is none in a row the tests gave no direction: a cheaper price for the profit did worse in them', () => {
      expect(bestOf('pe', 8, 89, 38)).toEqual([false, false, false]);
      expect(bestOf('dropped', 38, 64, 72)).toEqual([false, false, false]);
      expect(bestOf('owners', 11, 3, 18)).toEqual([false, false, false]);
    });

    it('is never a figure that speaks against the stock, and an unknown one neither wins nor is won against', () => {
      expect(bestOf('target', {value: '−5%', n: -5, against: true}, {value: '−12%', n: -12, against: true})).toEqual([false, false]);
      expect(bestOf('debt', 0.3, undefined)).withContext('one known figure').toEqual([false, false]);
      expect(bestOf('debt', 0.3, undefined, 0.8)).toEqual([true, false, false]);
    });

    it('is worked out for the block and not written into the stock\'s own facts', () => {
      const calm = saying({swings: {value: '33%', n: 33}}), wild = saying({swings: {value: '88%', n: 88}});
      const shown = sideBySide([{symbol: 'AAA', case: calm}, {symbol: 'BBB', case: wild}])!;
      expect(shown.parts[0].rows[0].cells.map(it => it.best)).toEqual([true, undefined]);
      expect(calm.facts.swings!.best).withContext('alone, or beside a calmer one, it is not the best').toBeUndefined();
    });

    it('says on the row\'s name what is in green, and for the context that no test backs it', () => {
      const rows = sideBySide([
        {symbol: 'AAA', case: saying({swings: {value: '33%', n: 33}, debt: {value: '0.1 times', n: 0.1}, pe: '20'})},
        {symbol: 'BBB', case: saying({swings: {value: '88%', n: 88}, debt: {value: '0.6 times', n: 0.6}, pe: '40'})},
      ])!.parts.flatMap(part => part.rows);
      expect(rows[0].help).toBe(`${VOLATILITY_COLUMN_NOTE} In green: the lowest of the ticked stocks.`);
      expect(rows[1].help.endsWith(' In green: the least of the ticked stocks; no test says that it is a reason to pick one.')).toBeTrue();
      expect(rows[2].help).withContext('a row without a best value says nothing of green').not.toContain('green');
    });
  });

  it('has one sentence for the box\'s explanations that says what green and red are, and that neither is counted', () => {
    expect(COMPARE_NOTE).toBe(
      'Where ticked stocks stand side by side, a figure in green is the best of them in its row: in the rows where the tests say ' +
      'which way is better ("Swings", "Fell a further 20%", the three cases) and in three rows of context where the reading is ' +
      'plain though no test backs it ("Debt", "Analyst target", "Analyst rating"). A figure in red speaks against the stock. ' +
      'The page counts neither and names no pick.');
  });

  it('marks a row in which every stock says the same, so that what differs stands out', () => {
    const alike = saying({dropped: '−38%', swings: '60% a year · volatile', profit: 'no'});
    const rows = sideBySide([{symbol: 'AAA', case: alike}, {symbol: 'BBB', case: other}])!.parts.flatMap(part => part.rows);
    expect(rows.filter(row => row.same).map(row => row.key)).toEqual(['swings', 'profit']);
    const alone = sideBySide([{symbol: 'AAA', case: alike}])!.parts.flatMap(part => part.rows);
    expect(alone.some(row => row.same)).withContext('one stock: nothing to be the same as').toBeFalse();
  });
});
