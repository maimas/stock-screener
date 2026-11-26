import {
  ASK_BUTTON, ASKING, cellOf, COMPARING, FACT_LIMITS, factsFor, HELD_NOTE, parseViews, PICK_HELP, pickOf, View, VIEW_HEADING, VIEW_HELP, ViewFacts,
} from "./claude-view";
import {costDistributionFor} from "./market-math";
import {computeSignal} from "./signal";
import {flatCloses, makeStock, NOW, reportedQuarters} from "./testing/fixtures";
import {Stock} from "../api/microsoft-money.service";

// The owner of the page asked for the details of a stock "summarized by AI and added to a column as an AI suggestion
// to act on the stock". One button a list asks Claude Code about every stock of it; this is what the page sends
// about a stock (figures only, nothing about what is owned) and how it shows the answer.
describe("Claude's view of a stock", () => {
  /** A made-up company: sales up 20% on a year ago, the price 20% below its highest, analysts' middle target at 120. */
  const stock = makeStock({
    symbol: 'ACME', price: 80, high52: 100, medianTarget: 120, recommendationRate: 1.77, providerEpsTtm: -0.05,
    quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
  });

  describe('factsFor (what the page sends about a stock)', () => {
    const facts = factsFor(stock, NOW);

    it('sends the mark and what it rests on', () => {
      expect(computeSignal(stock, NOW)?.verdict).toBe('DIP BUY');
      expect(facts.mark).toBe('DIP BUY');
      expect(facts.growing).toBe('yes');
      expect(facts.belowHigh).toBe(20);
      expect(facts.salesGrowth).toBe(20);
    });

    it('sends what analysts say and the profit per share, as the details show them', () => {
      expect(facts.targetPercent).toBe(50);
      expect(facts.rating).toBe(1.77);
      expect(facts.analysts).toBe(10);
      expect(facts.eps).toBe(-0.05);
    });

    it('says how the price swings, and for a marked stock which group that is', () => {
      expect(facts.swings).toBe(0);
      expect(facts.swingGroup).toBe('low');
      expect(facts.fellFurther).toBe(2);
    });

    it('leaves out a figure the stock does not have', () => {
      const bare = factsFor(makeStock({symbol: 'BARE', price: 50, high52: 50}), NOW);
      expect(bare.mark).toBe('none');
      for (const missing of ['growing', 'targetPercent', 'rating', 'analysts', 'swings', 'swingGroup', 'fellFurther', 'from200', 'rising200',
        'ownersInProfit', 'resultsInDays', 'beat', 'bigDropDay', 'bigDropPercent', 'dropAbout', 'pe', 'peLow', 'peHigh', 'eps'] as (keyof ViewFacts)[]) {
        expect(bare[missing]).withContext(missing).toBeUndefined();
      }
    });

    it('never sends a broken number, and never one outside what the server takes', () => {
      const wild = makeStock({symbol: 'WILD', price: 1, high52: 100000, medianTarget: 5000, recommendationRate: 1.2, providerEpsTtm: NaN});
      const sent = factsFor(wild, NOW);
      Object.entries(sent).forEach(([field, value]) => {
        if (typeof value === 'number') {
          expect(Number.isFinite(value)).withContext(field).toBeTrue();
          const [low, high] = FACT_LIMITS[field as keyof typeof FACT_LIMITS];
          expect(value >= low && value <= high).withContext(`${field} ${value}`).toBeTrue();
        }
      });
      expect(sent.targetPercent).withContext('+499900% is no figure the server takes: left out').toBeUndefined();
      expect(sent.eps).toBeUndefined();
    });

    it('sends what kind of news a kept reading of the fall found, and only its kind', () => {
      /** The same company with one bad day: 100 for 200 days, then 80. */
      const fell = makeStock({
        symbol: 'FELL', price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
        closes: [...flatCloses(200, 100), ...flatCloses(50, 80)],
      });
      const sent = factsFor(fell, NOW, 'industry');
      expect(sent.bigDropPercent).toBe(-20);
      expect(sent.bigDropDay).toMatch(/^2026-\d\d-\d\d$/);
      expect(sent.dropAbout).toBe('industry');
      expect(factsFor(fell, NOW).dropAbout).withContext('no reading is kept').toBeUndefined();
      expect(factsFor(stock, NOW, 'industry').dropAbout).withContext('no big one-day fall to be about').toBeUndefined();
    });

    it('sends nothing about what is owned', () => {
      expect(Object.keys(facts).join(' ')).not.toMatch(/held|hold|share|cash|portfolio|amount/i);
    });
  });

  const view = (word: string, day: string): object => ({
    view: word, short: 'Results due next week', why: 'It reports its results next week.',
    sources: [{title: 'A page', url: 'https://news.example.com/a'}], asked: `${day}T15:00:00.000Z`, model: 'm', version: '1',
  });

  describe('parseViews (what the server says)', () => {
    it('shows the newest view of each stock and keeps every day for the record', () => {
      const state = parseViews({views: {ABCD: {'2026-11-01': view('AVOID', '2026-11-01'), '2026-11-20': view('WAIT', '2026-11-20')}}, failed: {}});
      expect(state.views['ABCD'].view).toBe('WAIT');
      expect(state.views['ABCD'].day).toBe('2026-11-20');
      expect(Object.keys(state.history['ABCD'])).toEqual(['2026-11-01', '2026-11-20']);
      expect(state.queue).toBeUndefined();
    });

    it('drops what is not one of the three words with a reason, and what is not a day', () => {
      const state = parseViews({
        views: {
          ABCD: {'2026-11-20': view('STRONG BUY', '2026-11-20'), 'yesterday': view('WAIT', '2026-11-19')},
          EFGH: {'2026-11-20': {view: 'WAIT', short: 42}}, IJKL: 'WAIT', MNOP: {'2026-11-20': view('BUY SOME', '2026-11-20')},
        },
      });
      expect(Object.keys(state.views)).toEqual(['MNOP']);
      expect(Object.keys(state.history)).toEqual(['MNOP']);
    });

    it('says which list is being asked about and which stocks got no answer', () => {
      const state = parseViews({views: {}, queue: {symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {}}, failed: {WXYZ: 'timeout', 7: 9}});
      expect(state.queue).toEqual({symbols: ['ABCD', 'EFGH'], done: ['ABCD'], failed: {}});
      expect(state.failed).toEqual({WXYZ: 'timeout'});
    });

    it('is empty for anything that is not an answer of the server', () => {
      for (const odd of [undefined, null, 'x', 42, [], {views: 'x'}, {queue: {symbols: 'ABCD'}}]) {
        expect(parseViews(odd)).withContext(JSON.stringify(odd)).toEqual({views: {}, history: {}, failed: {}});
      }
    });
  });

  describe('cellOf (what a row shows)', () => {
    const kept = parseViews({views: {ABCD: {'2026-11-14': view('WAIT', '2026-11-14')}}}).views['ABCD'] as View;

    it('shows the word, the short reason, and the sentence with the day asked under the pointer', () => {
      expect(cellOf(kept, '2026-11-20', false)).toEqual({
        word: 'WAIT', short: 'Results due next week', tip: 'It reports its results next week. Asked Nov 14.', stale: false, from: '',
      });
    });

    it('is quieter, with its day, once the view is more than 7 days old', () => {
      expect(cellOf(kept, '2026-11-21', false).stale).withContext('7 days').toBeFalse();
      const old = cellOf(kept, '2026-11-22', false);
      expect(old.stale).withContext('8 days').toBeTrue();
      expect(old.from).toBe('from Nov 14');
    });

    it('says on a stock that is held that Claude was not told so', () => {
      expect(HELD_NOTE).toBe('Claude was not told what you hold; your plan and its limit still apply.');
      expect(cellOf(kept, '2026-11-20', true).tip).toBe(`It reports its results next week. Asked Nov 14. ${HELD_NOTE}`);
    });

    it('says "no answer" with the reason when the last ask failed and nothing is kept', () => {
      const failed = cellOf(undefined, '2026-11-20', false, 'timeout');
      expect(failed.word).toBe('no answer');
      expect(failed.short).toBe('');
      expect(failed.tip).toBe('Claude took too long and was stopped. Ask again.');
    });

    it('keeps showing the earlier view when a new ask failed, and says so under the pointer', () => {
      const still = cellOf(kept, '2026-11-20', false, 'busy');
      expect(still.word).toBe('WAIT');
      expect(still.tip).toBe('It reports its results next week. Asked Nov 14. Asked again since, without an answer: ' +
        'Claude was busy with something else. Ask again.');
    });

    it('shows nothing for a stock that was never asked about', () => {
      expect(cellOf(undefined, '2026-11-20', true)).toEqual({word: '', short: '', tip: '', stale: false, from: ''});
    });
  });

  it('names the column and the button in plain words', () => {
    expect(VIEW_HEADING).toBe('Claude · not tested');
    expect(ASK_BUTTON(5)).toBe('Ask Claude about these 5');
    expect(ASK_BUTTON(1)).toBe('Ask Claude about this one');
    expect(ASKING(2, 5)).toBe('Asking Claude… 2 of 5');
  });
});

// The owner of the page: "claude needs to factor also the same group stocks so compare". After a list, Claude is asked
// once about each group of stocks that move together, and names the one it would take first.
describe("Claude's pick among stocks that move together", () => {
  const view = (word: string, day: string): object => ({
    view: word, short: 'Results due next week', why: 'It reports its results next week.', sources: [], asked: `${day}T15:00:00.000Z`,
  });
  const pick = (first: string, members: string[]) => ({first, why: 'It makes a profit and swings less.', members, asked: 'x', model: 'm', version: '1'});

  describe('parseViews', () => {
    it('reads the comparisons that are kept, the oldest first, each with its day and its letter', () => {
      const state = parseViews({
        views: {}, picks: {'2026-11-20': {A: pick('EFGH', ['ABCD', 'EFGH'])}, '2026-11-14': {B: pick('MNOP', ['MNOP', 'QRST', 'UVWX'])}},
      });
      expect(state.picks).toEqual([
        {day: '2026-11-14', letter: 'B', first: 'MNOP', why: 'It makes a profit and swings less.', members: ['MNOP', 'QRST', 'UVWX']},
        {day: '2026-11-20', letter: 'A', first: 'EFGH', why: 'It makes a profit and swings less.', members: ['ABCD', 'EFGH']},
      ]);
    });

    it('drops a comparison that names no stock of its own, has one stock, no sentence, or no letter', () => {
      const state = parseViews({picks: {
        '2026-11-20': {A: pick('WXYZ', ['ABCD', 'EFGH']), B: pick('ABCD', ['ABCD']), C: {...pick('ABCD', ['ABCD', 'EFGH']), why: ' '}, c1: pick('ABCD', ['ABCD', 'EFGH'])},
        'yesterday': {A: pick('ABCD', ['ABCD', 'EFGH'])}, '2026-11-21': 'A',
      }});
      expect(state.picks).toBeUndefined();
      expect(state).toEqual({views: {}, history: {}, failed: {}});
    });

    it('says which groups are still to be compared', () => {
      const state = parseViews({views: {}, queue: {symbols: ['ABCD'], done: ['ABCD'], failed: {}, comparing: ['A', 'B']}});
      expect(state.queue).toEqual({symbols: ['ABCD'], done: ['ABCD'], failed: {}, comparing: ['A', 'B']});
      expect(parseViews({queue: {symbols: ['ABCD'], done: [], failed: {}}}).queue).toEqual({symbols: ['ABCD'], done: [], failed: {}});
    });
  });

  describe('pickOf (the comparison a stock was part of)', () => {
    const picks = parseViews({picks: {
      '2026-11-10': {A: pick('ABCD', ['ABCD', 'EFGH'])},
      '2026-11-18': {A: pick('EFGH', ['ABCD', 'EFGH', 'IJKL'])},
      '2026-11-19': {B: pick('MNOP', ['MNOP', 'QRST'])},
    }}).picks;

    it('is the newest one of the past week that the stock was in', () => {
      expect(pickOf('ABCD', picks, '2026-11-20')).toEqual(jasmine.objectContaining({day: '2026-11-18', first: 'EFGH', mine: false}));
      expect(pickOf('EFGH', picks, '2026-11-20')).toEqual(jasmine.objectContaining({day: '2026-11-18', letter: 'A', mine: true}));
      expect(pickOf('QRST', picks, '2026-11-20')!.first).toBe('MNOP');
    });

    it('is nothing for a stock that was never compared, or longer ago than a week', () => {
      expect(pickOf('WXYZ', picks, '2026-11-20')).toBeUndefined();
      expect(pickOf('ABCD', picks, '2026-11-25')).withContext('7 days on: still shown').toBeDefined();
      expect(pickOf('ABCD', picks, '2026-11-26')).withContext('8 days on').toBeUndefined();
      expect(pickOf('ABCD', undefined, '2026-11-20')).toBeUndefined();
    });
  });

  describe('cellOf', () => {
    const state = parseViews({
      views: {ABCD: {'2026-11-18': view('WAIT', '2026-11-18')}, EFGH: {'2026-11-18': view('BUY SOME', '2026-11-18')}},
      picks: {'2026-11-18': {A: pick('EFGH', ['ABCD', 'EFGH', 'IJKL'])}},
    });
    const TODAY = '2026-11-20';

    it('marks the stock Claude would take first of its group, and says under the pointer among which and why', () => {
      const cell = cellOf(state.views['EFGH'], TODAY, false, undefined, pickOf('EFGH', state.picks, TODAY));
      expect(cell.first).toBe('first of A');
      expect(cell.word).toBe('BUY SOME');
      expect(cell.tip).toBe('It reports its results next week. Asked Nov 18. Of the 3 stocks of group A that Claude compared ' +
        '(ABCD, EFGH, IJKL), it would take this one first: It makes a profit and swings less. Compared Nov 18.');
    });

    it('says on the others of the group which one Claude would take first, and does not mark them', () => {
      const cell = cellOf(state.views['ABCD'], TODAY, true, undefined, pickOf('ABCD', state.picks, TODAY));
      expect(cell.first).toBeUndefined();
      expect(cell.tip).toBe('It reports its results next week. Asked Nov 18. Of the 3 stocks of group A that Claude compared ' +
        `(ABCD, EFGH, IJKL), it would take EFGH first: It makes a profit and swings less. Compared Nov 18. ${HELD_NOTE}`);
    });

    it('shows a stock that was not compared as before', () => {
      expect(cellOf(state.views['ABCD'], TODAY, false)).toEqual({
        word: 'WAIT', short: 'Results due next week', tip: 'It reports its results next week. Asked Nov 18.', stale: false, from: '',
      });
    });

    it('marks nothing on a stock with no view, whatever was compared', () => {
      expect(cellOf(undefined, TODAY, false, undefined, pickOf('EFGH', state.picks, TODAY)).first).toBeUndefined();
    });
  });

  it('explains the star in the page\'s own words for a group, and says it is not tested and that the marks rank nothing', () => {
    expect(PICK_HELP).toContain('moved closely together over the past year');
    expect(PICK_HELP).toContain('not tested');
    expect(PICK_HELP).toContain('the page\'s marks rank no stock');
    expect(COMPARING('A')).toBe('Comparing group A…');
    expect(VIEW_HELP.endsWith(PICK_HELP)).withContext('the heading of the column says it').toBeTrue();
  });
});

// The owner of the page, with a stock's details open: "is claude considering this info when analizyng". What the page
// sends now follows the details: the business beside its industry, the profit expected, both dates of results, what
// the average owner paid, and the P/E that the details show beside its range.
describe("factsFor: every figure a stock's details show", () => {
  const details = (): Stock => {
    const stock = makeStock({
      symbol: 'ACME', price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
      providerForwardEps: 8,
    });
    const loose = stock as any;
    loose.quote.peRatio = 14.6;
    loose.equity.analysis.companyMetrics = {
      ...loose.equity.analysis.companyMetrics, pE5YearLowRatio: 18.9, pE5YearHighRatio: 29, averageGrossMargin5Year: 58.2, returnOnCapital5YearAverage: 27.4,
    };
    loose.equity.analysis.industryMetrics = {averageGrossMargin5Year: 51.1, returnOnCapital5YearAverage: 12.3};
    loose.forecast.ExpectedReportDate = new Date(NOW.getTime() + 68 * 86_400_000).toISOString();
    loose.forecast.LastActual = {EarningReleaseDate: new Date(NOW.getTime() - 28 * 86_400_000).toISOString(), EpsSurprisePercent: 3.14};
    return stock;
  };

  it('sends the P/E the details show beside its range of five years: the price for the yearly profit, not for the profit expected', () => {
    const facts = factsFor(details(), NOW);
    expect(facts.pe).withContext('80 for an expected profit of 8 would be 10').toBe(14.6);
    expect([facts.peLow, facts.peHigh]).toEqual([18.9, 29]);
  });

  it('sends when the next results are due, however far off, and when the last ones came, as two figures', () => {
    const facts = factsFor(details(), NOW);
    expect(facts.resultsInDays).toBe(68);
    expect(facts.reportedDaysAgo).toBe(28);
    expect(facts.beat).toBe(3.1);
  });

  it('sends what the business keeps of its sales and earns on the money invested, each beside its industry', () => {
    const facts = factsFor(details(), NOW);
    expect([facts.keepsOfSales, facts.industryKeepsOfSales]).toEqual([58.2, 51.1]);
    expect([facts.earnsOnMoney, facts.industryEarnsOnMoney]).toEqual([27.4, 12.3]);
  });

  it('sends no industry figure without the company\'s own: there is nothing to set it beside', () => {
    const stock = details();
    (stock as any).equity.analysis.companyMetrics.averageGrossMargin5Year = undefined;
    const facts = factsFor(stock, NOW);
    expect(facts.keepsOfSales).toBeUndefined();
    expect(facts.industryKeepsOfSales).toBeUndefined();
    expect(facts.industryEarnsOnMoney).toBe(12.3);
  });

  it('sends the profit expected against the past year', () => {
    expect(factsFor(details(), NOW).profitGrowth).withContext('four quarters of 1 expected after four of 1').toBe(0);
  });

  it('sends what the average owner paid against today\'s price, as the details say it', () => {
    /** Half a year at 100, half a year at 80, and the price at 80: the average owner paid more than today's price. */
    const stock = makeStock({symbol: 'FELL', price: 80, high52: 100, closes: [...flatCloses(125, 100), ...flatCloses(125, 80)]});
    (stock as any).equity.analysis.shareStatistics = {sharesOutstanding: 1_000_000_000};
    const cost = costDistributionFor(stock)!;
    expect(cost).withContext('the made-up year of trading gives a cost').toBeTruthy();
    const facts = factsFor(stock, NOW);
    expect(facts.ownersPaid).toBeGreaterThan(0);
    expect(facts.ownersPaid).toBeCloseTo((cost.averageCost / 80 - 1) * 100, 1);
    expect(facts.ownersInProfit).toBeCloseTo(cost.profitRatio, 1);
  });

  it('leaves each of them out for a stock that has none of it', () => {
    const bare = factsFor(makeStock({symbol: 'BARE', price: 50, high52: 50}), NOW);
    for (const missing of ['profitGrowth', 'pe', 'ownersPaid', 'resultsInDays', 'reportedDaysAgo', 'keepsOfSales', 'industryKeepsOfSales',
      'earnsOnMoney', 'industryEarnsOnMoney'] as (keyof ViewFacts)[]) {
      expect(bare[missing]).withContext(missing).toBeUndefined();
    }
  });
});
