import {EvidenceBlock, Figures, TakeProfitTested, takeProfitOffer, textsFor} from "./evidence";
import {FIGURES_2026_11_21, FIGURES_WITH_TAKE_PROFIT, TAKE_PROFIT_MADE_UP} from "./testing/figures";

/** The made-up test with each rule changed by `change` ("seen" and "order", at each level). */
function tested(change: (rule: TakeProfitTested, way: 'seen' | 'order', level: number) => Partial<TakeProfitTested>): Figures {
  const made = TAKE_PROFIT_MADE_UP;
  if (!made.decided) {
    throw new Error('the made-up test is a decided one');
  }
  const changed = (way: 'seen' | 'order') => Object.fromEntries(
    Object.keys(made[way]).map(level => [level, {...made[way][Number(level)], ...change(made[way][Number(level)], way, Number(level))}]));
  return {...FIGURES_2026_11_21, eighth: {...made, seen: changed('seen'), order: changed('order')}};
}

/** The paragraphs of an account, and its tables, each in the order they stand in. */
const texts = (blocks: readonly EvidenceBlock[]) => blocks.flatMap(block => block.text === undefined ? [] : [block.text]);
const tables = (blocks: readonly EvidenceBlock[]) => blocks.flatMap(block => block.table === undefined ? [] : [block.table]);

const LEAVES_OUT =
  'What the test leaves out: it used weekly prices, filled a sell order at exactly its price and any other sale at the closing ' +
  'price of that week, and left the money idle afterwards, so "a loss is rarer" is about that one stock and not about what the ' +
  'money does next.';
const LOOKING_LESS_OFTEN =
  ' Selling at 15% up but looking only every second week, 36% ended below what was paid; every fourth week, 37% (every week: 34%).';

/**
 * Taking a profit, pre-registered #9: tested two ways at two levels on the last list of stocks never used. What
 * passed is offered as a level of the user's own; the account says both sides whatever passed.
 *
 * The account is words and two small tables. A review of the page found it a wall of numbers (a paragraph with a
 * dozen figures "in the same order for the other three"): each figure of the test now stands once, in a table,
 * and the words say what was found and what the plan does with it.
 */
describe('what the app says about taking a profit', () => {
  const t = textsFor(FIGURES_WITH_TAKE_PROFIT);

  it('offers nothing and adds nothing to the account while that test has not been recorded', () => {
    const before = textsFor(FIGURES_2026_11_21);
    expect(takeProfitOffer(FIGURES_2026_11_21)).toEqual([]);
    expect(before.takeProfitBlocks).toEqual([]);
    expect(before.planParts.length).toBe(6);
    expect(before.takeProfitWhy(15, 'order')).toBe('');
    expect(before.takeProfitBrief(15)).toBe('');
  });

  it('offers the levels that passed one way or the other, lowest first, each with the ways it passed by', () => {
    expect(takeProfitOffer(FIGURES_WITH_TAKE_PROFIT)).toEqual([
      {level: 15, seen: true, order: true},
      {level: 25, seen: false, order: true},
    ]);
  });

  it('leaves a level out when neither way passed at it', () => {
    expect(takeProfitOffer(tested((rule, way, level) => level === 25 ? {passed: false} : {}))).toEqual([{level: 15, seen: true, order: true}]);
    expect(takeProfitOffer(tested(() => ({passed: false})))).toEqual([]);
  });

  it('says in one sentence what selling early did, both sides, and leaves the figures to the table', () => {
    expect(texts(t.takeProfitBlocks)[0]).toBe(
      'Selling early: on 200 more stocks never used before (bought from mid-2022 to May 2026), taking a profit made a loss rarer ' +
      'and gave less on average than keeping for 6 months: a sale gives up what the winners go on to make.');
  });

  it('sets what each way did in a small table, keeping first, and the ways the plan does not offer apart', () => {
    expect(tables(t.takeProfitBlocks)[0]).toEqual({
      caption: 'Stocks marked DIP BUY: kept for 6 months, or sold early',
      columns: ['What was done', 'Ended below what was paid', '1 in 10 lost at least', 'On average', 'Sold early'],
      rows: [
        {label: 'Kept for 6 months', cells: ['44%', '30.5%', '+9.1%', '']},
        {label: 'Sell order at +15%', cells: ['28%', '26.0%', '+4.1%', '66%']},
        {label: 'Sold once a week closed 15% up', cells: ['34%', '28.7%', '+4.4%', '56%']},
        {label: 'Sell order at +25%', cells: ['37%', '27.0%', '+5.5%', '45%']},
      ],
      apart: {
        title: 'Not offered: under the marks written down before the test, the first time it was run',
        rows: [{label: 'Sold once a week closed 25% up', cells: ['41%', '29.4%', '+5.3%', '36%']}],
      },
    });
  });

  it('sets nothing apart when every way is offered, and every way apart when none is', () => {
    const all = tables(textsFor(tested(() => ({passed: true}))).takeProfitBlocks)[0];
    expect(all.apart).toBeUndefined();
    expect(all.rows.map(row => row.label)).toEqual([
      'Kept for 6 months', 'Sell order at +15%', 'Sold once a week closed 15% up', 'Sell order at +25%', 'Sold once a week closed 25% up',
    ]);
    const none = tables(textsFor(tested(() => ({passed: false}))).takeProfitBlocks);
    expect(none[0].rows.map(row => row.label)).toEqual(['Kept for 6 months']);
    expect(none[0].apart?.rows.map(row => row.label)).toEqual([
      'Sell order at +15%', 'Sold once a week closed 15% up', 'Sell order at +25%', 'Sold once a week closed 25% up',
    ]);
    expect(none.length).toBe(2);
    expect(none[1].rows).withContext('what became of the stocks sold: nothing is offered, so every way stands apart there too').toEqual([]);
    expect(none[1].apart?.rows.map(row => row.label)).toEqual(none[0].apart?.rows.map(row => row.label));
    expect(tables(textsFor(tested(() => ({passed: true}))).takeProfitBlocks)[1].apart).toBeUndefined();
  });

  it('says what the plan offers from it, by which way at each level', () => {
    expect(texts(t.takeProfitBlocks)[1]).toBe(
      'The plan still says to keep for 6 months, because on average keeping paid more. What made enough of a difference in this test ' +
      'is offered as a level you can set for yourself, beside your cash and your limit: ' +
      '+15% (by a sell order, or by selling once you see it) and +25% (by a sell order).');
  });

  it('names the one way when a level passed only by selling once it is seen', () => {
    const only = textsFor(tested((rule, way, level) => level === 25 ? {passed: way === 'seen'} : {passed: false})).takeProfitBlocks;
    expect(texts(only)[1]).toContain('beside your cash and your limit: +25% (by selling once you see it).');
    expect(tables(only)[1].rows).toEqual([{label: 'Sold once a week closed 25% up', cells: ['10%', '+42.1%', '+31.1%']}]);
  });

  it('says that the plan offers no level when nothing passed', () => {
    expect(texts(textsFor(tested(() => ({passed: false}))).takeProfitBlocks)[1]).toBe(
      'The plan still says to keep for 6 months, because on average keeping paid more. By the marks written down before this test, ' +
      'none of it made enough of a difference, so the plan offers no level for taking a profit.');
  });

  // What a reader faces when a rule applies: of the stocks it sold, how many still ended below what was paid when
  // kept, and what they made kept and sold. Written down before the test as something to quote with every verdict.
  it('sets in a second table what became of the stocks a sale took out early, for every way, as in the first', () => {
    expect(tables(t.takeProfitBlocks)[1]).toEqual({
      caption: 'The stocks that were sold early, had they been kept instead',
      columns: ['What was done', 'Kept: ended below what was paid', 'Kept: on average', 'Sold: on average'],
      rows: [
        {label: 'Sell order at +15%', cells: ['24%', '+22.8%', '+15.0%']},
        {label: 'Sold once a week closed 15% up', cells: ['18%', '+29.0%', '+20.1%']},
        {label: 'Sell order at +25%', cells: ['16%', '+33.6%', '+25.0%']},
      ],
      // The verdict of a way that is not offered is quoted too, so what a reader would have faced stands with it.
      apart: {
        title: 'Not offered: under the marks written down before the test, the first time it was run',
        rows: [{label: 'Sold once a week closed 25% up', cells: ['10%', '+42.1%', '+31.1%']}],
      },
    });
  });

  it('says what the test leaves out, and what looking less often gave', () => {
    expect(texts(t.takeProfitBlocks)[2]).toBe(LEAVES_OUT + LOOKING_LESS_OFTEN);
    expect(texts(textsFor(tested(() => ({passed: false}))).takeProfitBlocks)[2]).withContext('also when nothing passed').toBe(LEAVES_OUT + LOOKING_LESS_OFTEN);
  });

  it('keeps the figures of the test out of its sentences: they stand once, in the tables', () => {
    const [found, does] = texts(t.takeProfitBlocks);
    expect(found + does).not.toMatch(/\d\.\d%/);
    expect(t.takeProfitBlocks.map(block => block.table ? 'table' : 'text')).toEqual(['text', 'table', 'text', 'table', 'text']);
  });

  // The page said three times that the market was rising. In this box it is said once, in the last paragraph, with
  // this test's own figure beside it.
  it('says that the market rose once, in the last paragraph of the account, with this test\'s own share', () => {
    expect(t.planParts[t.planParts.length - 1]).toBe(
      '"The market" is the S&P 500, an index of 500 large US companies. Apart from the test of how many, all of this is from ' +
      '2023–2026, when the market was rising (for 87% of the purchases in the test of selling early it rose over the same 6 months). ' +
      'Not advice, and nothing is guaranteed.');
    expect(texts(t.takeProfitBlocks).join(' ')).not.toContain('the market rose');
  });

  it('leaves out what a run did not record, rather than print a nought', () => {
    const made = TAKE_PROFIT_MADE_UP;
    if (!made.decided) {
      throw new Error('the made-up test is a decided one');
    }
    const bare = textsFor({...FIGURES_2026_11_21, eighth: {...made, marketRosePercent: null, lessOften: {}}});
    expect(texts(bare.takeProfitBlocks)[2]).toBe(LEAVES_OUT);
    expect(bare.planParts[bare.planParts.length - 1]).toBe(textsFor(FIGURES_2026_11_21).planParts[5]);
  });

  it('puts the account of selling early into the account of the plan, before what to keep in mind', () => {
    expect(t.planBlocks.length).toBe(12);
    expect(t.planBlocks.slice(6, 11)).toEqual([...t.takeProfitBlocks]);
    expect(t.planParts.length).toBe(9);
    expect(t.planNote).toBe(t.planParts.join(' '));
  });

  it('says only that the test could not decide when its list was too thin', () => {
    const undecided = textsFor({...FIGURES_2026_11_21, eighth: {stocks: 200, decided: false}});
    expect(undecided.takeProfitBlocks).toEqual([{
      text: 'Selling early for a gain was to be tested on 200 more stocks never used before, but too few of them were marked DIP BUY ' +
        'to say anything. The plan offers no level for taking a profit.',
    }]);
    expect(takeProfitOffer({...FIGURES_2026_11_21, eighth: {stocks: 200, decided: false}})).toEqual([]);
    expect(undecided.takeProfitWhy(15, 'order')).toBe('');
    expect(undecided.takeProfitBrief(15)).toBe('');
  });

  // Written down before the test: each line of the plan says both sides in this test's numbers, and wherever a
  // verdict is quoted so is how many were sold early and what a reader faces when the rule applies (of the stocks
  // that got that far, how many still ended below what was paid when kept, and what they made kept and sold). A
  // first cut of this reason left the last to the tables, which stand behind THE PLAN's "more": a review put it back.
  it('gives a plan line its reason for a sell order: both sides, and what became of the stocks that reached the price', () => {
    expect(t.takeProfitWhy(15, 'order')).toBe(
      'In the test of selling early, a sell order placed in advance at 15% above the purchase price made a loss rarer: ' +
      '28% ended below what was paid, against 44% when kept, and the bad case was milder by 4.5 points. ' +
      'It also gave less on average: +4.1% against +9.1%. ' +
      '66% of the stocks reached that price: kept, 24% of those still ended below what was paid, and they made +22.8% on ' +
      'average against +15.0% sold. ' +
      'The tables under THE PLAN, behind its "more", have the whole test.');
  });

  it('gives the reason for selling once the level is seen, and calls a bad case under the mark "about as bad"', () => {
    expect(t.takeProfitWhy(15, 'seen')).toBe(
      'In the test of selling early, selling after a week closed 15% or more above the purchase price made a loss rarer: ' +
      '34% ended below what was paid, against 44% when kept, and the bad case was about as bad. ' +
      'It also gave less on average: +4.4% against +9.1%. ' +
      '56% of the stocks got that far: kept, 18% of those still ended below what was paid, and they made +29.0% on ' +
      'average against +20.1% sold. ' +
      'The tables under THE PLAN, behind its "more", have the whole test.');
  });

  it('has no reason to give for a way that did not pass, or for a level that was not tested', () => {
    expect(t.takeProfitWhy(25, 'seen')).toBe('');
    expect(t.takeProfitWhy(20, 'order')).toBe('');
  });

  it('says under the field what the picked level did in the test, by each way it is offered', () => {
    expect(t.takeProfitBrief(15)).toBe(
      'At +15%, in a test on 200 stocks: 28% ended below what was paid with a sell order placed in advance and 34% when sold after a ' +
      'week closed that high, against 44% when kept. The average was +4.1% and +4.4%, against +9.1%.');
    expect(t.takeProfitBrief(25)).toBe(
      'At +25%, in a test on 200 stocks: 37% ended below what was paid with a sell order placed in advance, against 44% when kept. ' +
      'The average was +5.5%, against +9.1%.');
  });

  it('says it for a level offered only by selling once it is seen', () => {
    expect(textsFor(tested((rule, way) => ({passed: way === 'seen'}))).takeProfitBrief(25)).toBe(
      'At +25%, in a test on 200 stocks: 41% ended below what was paid when sold after a week closed that high, against 44% when kept. ' +
      'The average was +5.3%, against +9.1%.');
  });

  it('says nothing under the field for a level that is not offered', () => {
    expect(textsFor(tested(() => ({passed: false}))).takeProfitBrief(15)).toBe('');
    expect(t.takeProfitBrief(20)).toBe('');
  });
});
