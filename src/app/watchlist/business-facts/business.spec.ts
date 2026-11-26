import {Stock} from "../../api/microsoft-money.service";
import {makeStock} from "../testing/fixtures";
import {BUSINESS_HOW_TO_READ, BUSINESS_NOTE, businessOf, hasBusiness, similarLine} from "./business";

type Figures = { grossMargin?: number, returnOnCapital?: number };
type Related = { symbol?: string, displayName?: string, shortName?: string };

/** A made-up company shaped like the data source's answer, with the fields about the business filled in. */
function company(o: { symbol?: string, own?: Figures, industry?: Figures, related?: Related[], description?: string } = {}): Stock {
  const stock = makeStock({symbol: o.symbol ?? 'ACME'}) as any;
  const metrics = (figures: Figures = {}) => ({
    averageGrossMargin5Year: figures.grossMargin, returnOnCapital5YearAverage: figures.returnOnCapital,
  });
  stock.equity.analysis.companyMetrics = {...stock.equity.analysis.companyMetrics, ...metrics(o.own)};
  stock.equity.analysis.industryMetrics = metrics(o.industry);
  stock.equity.relatedStocks = o.related;
  stock.equity.company.description = o.description;
  return stock as Stock;
}

// Short names: the section stands in a column that can be 380px wide, and a name of 33 letters left the figure
// beside it 130px, so "62% · its industry 48%" broke over two lines. What "keeps" leaves out (after the direct
// costs) is on the pointer and in the sentences.
const KEEPS = 'Keeps of its sales';
const EARNS = 'Earns on money invested';

/**
 * What the data source already sends about the business, as the owner asked to see it ("show the MSN moat info"):
 * two figures beside the industry's, and the companies listed beside this one. None of it was tested.
 */
describe('businessOf: the business as figures, beside its industry', () => {
  it('says what the company keeps of its sales and what it earns on the money in it, each beside its industry', () => {
    const {rows} = businessOf(company({own: {grossMargin: 62.4, returnOnCapital: 18.6}, industry: {grossMargin: 48.1, returnOnCapital: 9.2}}));
    expect(rows.map(row => [row.label, row.value, row.industry])).toEqual([
      [KEEPS, '62%', 'its industry 48%'],
      [EARNS, '19%', 'its industry 9%'],
    ]);
  });

  it("gives the trade's word for each figure once, for the pointer", () => {
    const {rows} = businessOf(company({own: {grossMargin: 62.4, returnOnCapital: 18.6}}));
    expect(rows[0].tip).toContain('Gross margin');
    expect(rows[1].tip).toContain('Return on capital');
    rows.forEach(row => expect(row.tip).withContext(row.label).toContain('average of the last 5 years'));
  });

  it('leaves out a figure the data source does not give, and keeps the other', () => {
    const {rows} = businessOf(company({own: {returnOnCapital: 18.6}, industry: {grossMargin: 48.1, returnOnCapital: 9.2}}));
    expect(rows.map(row => row.label)).toEqual([EARNS]);
  });

  it('shows a figure alone when its industry has none', () => {
    const {rows} = businessOf(company({own: {grossMargin: 62.4}, industry: {}}));
    expect(rows.map(row => [row.value, row.industry])).toEqual([['62%', '']]);
  });

  it('does not show a placeholder of the data source as a figure', () => {
    const {rows} = businessOf(company({own: {grossMargin: -99_999_901, returnOnCapital: NaN}, industry: {grossMargin: 48.1}}));
    expect(rows).toEqual([]);
  });

  it('leaves the industry out of a row when it is a placeholder, and keeps the figure', () => {
    const {rows} = businessOf(company({own: {grossMargin: 62.4}, industry: {grossMargin: -99_999_901}}));
    expect(rows.map(row => [row.value, row.industry])).toEqual([['62%', '']]);
  });

  it('writes a loss with a real minus sign, and a figure that rounds to nothing as 0%', () => {
    const {rows} = businessOf(company({own: {grossMargin: -12.5, returnOnCapital: -0.4}, industry: {grossMargin: -3.6, returnOnCapital: 9.2}}));
    expect(rows.map(row => [row.value, row.industry])).toEqual([
      ['−13%', 'its industry −4%'],
      ['0%', 'its industry 9%'],
    ]);
  });
});

describe('businessOf: the companies the data source lists beside this one', () => {
  it('lists them by symbol with their names, in the order they came', () => {
    const {similar} = businessOf(company({related: [
      {symbol: 'BOLT', displayName: 'Bolt Works Inc'}, {symbol: 'CHIP', displayName: 'Chip Foundry Corp'},
    ]}));
    expect(similar).toEqual([{symbol: 'BOLT', name: 'Bolt Works Inc'}, {symbol: 'CHIP', name: 'Chip Foundry Corp'}]);
  });

  it('leaves out the stock itself, a double and an entry without a symbol', () => {
    const {similar} = businessOf(company({symbol: 'ACME', related: [
      {symbol: 'ACME', displayName: 'Acme Inc'}, {symbol: 'BOLT', displayName: 'Bolt Works Inc'},
      {symbol: 'BOLT', displayName: 'Bolt Works Inc'}, {displayName: 'No Symbol Ltd'},
    ]}));
    expect(similar.map(it => it.symbol)).toEqual(['BOLT']);
  });

  it('falls back on the short name, and on nothing, for the pointer', () => {
    const {similar} = businessOf(company({related: [{symbol: 'BOLT', shortName: 'Bolt'}, {symbol: 'CHIP'}]}));
    expect(similar).toEqual([{symbol: 'BOLT', name: 'Bolt'}, {symbol: 'CHIP', name: ''}]);
  });

  // The data source lists seven companies beside one stock and fourteen beside another: fourteen symbols filled
  // five lines of the column.
  it('keeps to the first eight listed, and says how many more there are', () => {
    const listed = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11'].map(symbol => ({symbol}));
    const {similar, more} = businessOf(company({related: listed}));
    expect(similar.map(it => it.symbol)).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08']);
    expect(more).toBe(3);
  });

  it('counts none more when eight or fewer are listed, the stock itself and doubles not counted', () => {
    const listed = ['ACME', 'B01', 'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08'].map(symbol => ({symbol}));
    const {similar, more} = businessOf(company({symbol: 'ACME', related: listed}));
    expect([similar.length, more]).toEqual([8, 0]);
  });
});

describe('businessOf: what the company does, in the data source\'s words', () => {
  it('keeps the first two sentences of the description', () => {
    const {does} = businessOf(company({description:
      'Acme Inc is a tools company. The Company makes hand tools and sells them to builders. Its Tools segment makes hammers. Its Rental segment lends them out.'}));
    expect(does).toBe('Acme Inc is a tools company. The Company makes hand tools and sells them to builders.');
  });

  it('keeps to the first sentence when two would be a paragraph', () => {
    const second = `The Company ${'makes hand tools and '.repeat(20)}sells them.`;
    const {does} = businessOf(company({description: `Acme Inc is a tools company. ${second} Its Tools segment makes hammers.`}));
    expect(does).toBe('Acme Inc is a tools company.');
  });

  it('gives a description of one sentence whole, and nothing when there is none', () => {
    expect(businessOf(company({description: 'Acme Inc makes hand tools.'})).does).toBe('Acme Inc makes hand tools.');
    expect(businessOf(company({})).does).toBe('');
  });
});

describe('hasBusiness: whether there is anything to show', () => {
  it('is so with a figure, or with a company listed beside it', () => {
    expect(hasBusiness(businessOf(company({own: {grossMargin: 62.4}})))).toBeTrue();
    expect(hasBusiness(businessOf(company({related: [{symbol: 'BOLT'}]})))).toBeTrue();
  });

  it('is not so for a fund, for a stock that did not load, or with a description alone', () => {
    const fund = {...makeStock({symbol: 'FUND'}), equity: undefined} as unknown as Stock;
    expect(hasBusiness(businessOf(fund))).toBeFalse();
    expect(hasBusiness(businessOf(undefined))).toBeFalse();
    expect(hasBusiness(businessOf(company({description: 'Acme Inc makes hand tools.'})))).toBeFalse();
  });
});

describe('similarLine: the listed companies by name, for who reads the details in sentences', () => {
  it('names each company with its symbol, and says whose list it is', () => {
    expect(similarLine([{symbol: 'BOLT', name: 'Bolt Works Inc'}, {symbol: 'CHIP', name: 'Chip Foundry Corp'}]))
      .toBe('Similar companies, as the data source lists them: Bolt Works Inc (BOLT), Chip Foundry Corp (CHIP).');
  });

  it('gives a company without a name by its symbol alone, and no line when none is listed', () => {
    expect(similarLine([{symbol: 'BOLT', name: ''}])).toBe('Similar companies, as the data source lists them: BOLT.');
    expect(similarLine([])).toBe('');
  });

  it('says how many more the data source lists than are shown', () => {
    expect(similarLine([{symbol: 'BOLT', name: 'Bolt Works Inc'}], 3))
      .toBe('Similar companies, as the data source lists them: Bolt Works Inc (BOLT), and 3 more.');
  });
});

describe('the words of the section', () => {
  it("says in the page's own words that this is no part of the mark, that nothing here was tested, and what is not known", () => {
    expect(BUSINESS_NOTE).toBe('context, not part of the mark');
    expect(BUSINESS_HOW_TO_READ).toBe(
      'Both figures are averages of the last 5 years from the data source (MSN): what the company keeps of its sales ' +
      '(gross margin) and what it earns on the money invested in it (return on capital), each beside the average of ' +
      'its industry. Whether a figure above its industry says anything about the price was not tested. ' +
      'The data source does not say how it picks the similar companies, and it gives no market share.');
  });
});
