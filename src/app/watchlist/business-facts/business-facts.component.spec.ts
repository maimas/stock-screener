import {TestBed} from "@angular/core/testing";
import {By} from "@angular/platform-browser";
import {MatTooltip} from "@angular/material/tooltip";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {Stock} from "../../api/microsoft-money.service";
import {MORE_STORAGE_KEY, MoreService} from "../more/more.service";
import {makeStock} from "../testing/fixtures";
import {BusinessFactsComponent} from "./business-facts.component";

/** A made-up company with everything the section shows, shaped like the data source's answer. */
function acme(): Stock {
  const stock = makeStock({symbol: 'ACME'}) as any;
  stock.equity.analysis.companyMetrics = {...stock.equity.analysis.companyMetrics, averageGrossMargin5Year: 62.4, returnOnCapital5YearAverage: 18.6};
  stock.equity.analysis.industryMetrics = {averageGrossMargin5Year: 48.1, returnOnCapital5YearAverage: 9.2};
  stock.equity.relatedStocks = [{symbol: 'BOLT', displayName: 'Bolt Works Inc'}, {symbol: 'CHIP', displayName: 'Chip Foundry Corp'}];
  stock.equity.company.description = 'Acme Inc is a tools company. The Company makes hand tools and sells them to builders. Its Tools segment makes hammers.';
  return stock as Stock;
}

/** The words of an element as a reader meets them: one space where the markup breaks a line. */
const words = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * "The business" in a stock's details: what the data source already sends, as the owner asked to see it. Figures
 * with their names in sight, the sentences behind the details' own control, and nothing that reads as a verdict.
 */
describe('BusinessFactsComponent: the business, in a stock\'s details', () => {
  beforeEach(() => localStorage.removeItem(MORE_STORAGE_KEY));
  afterEach(() => {
    localStorage.removeItem(MORE_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  function shown(stock: Stock | undefined) {
    TestBed.configureTestingModule({imports: [BusinessFactsComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(BusinessFactsComponent);
    fixture.componentRef.setInput('stock', stock);
    fixture.detectChanges();
    return {fixture, el: fixture.nativeElement as HTMLElement};
  }

  // The page has one name for what no test used: "Context, not part of the mark", the heading of the section after
  // this one. The same words here, not a second phrase for the same thing.
  it('says at its title, in the words the page already has for it, that this is no part of the mark', () => {
    const {el} = shown(acme());
    expect(words(el.querySelector('h4'))).toBe('The business · context, not part of the mark');
  });

  // The owner, shown the section with a row of similar companies and told that the data source's list is loose:
  // "add the similar companies in the expando details". In sight are the two figures; the companies are in what
  // the details' control opens.
  it('shows a row a figure: its name, the figure and the industry\'s, and no row of similar companies', () => {
    const {el} = shown(acme());
    const rows = Array.from(el.querySelectorAll('dl.fact-rows > div')).map(row => [words(row.querySelector('dt')), words(row.querySelector('dd'))]);
    expect(rows).toEqual([
      ['Keeps of its sales', '62% · its industry 48%'],
      ['Earns on money invested', '19% · its industry 9%'],
    ]);
    expect(words(el.querySelector('dl.fact-rows'))).not.toContain('BOLT');
  });

  it("gives the trade's word for a figure on its name, for the pointer", () => {
    const {fixture} = shown(acme());
    const tips = fixture.debugElement.queryAll(By.directive(MatTooltip))
      .map(it => [words(it.nativeElement), it.injector.get(MatTooltip).message.split(',')[0].split(':')[0]]);
    expect(tips).toEqual([
      ['Keeps of its sales', 'Gross margin'],
      ['Earns on money invested', 'Return on capital'],
    ]);
  });

  it('names the similar companies in what the control opens: eight at most, and how many more there are', () => {
    const stock = acme() as any;
    stock.equity.relatedStocks = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11'].map(symbol => ({symbol}));
    const {fixture, el} = shown(stock);
    const line = () => (Array.from(el.querySelectorAll('p')) as HTMLElement[]).find(p => words(p).startsWith('Similar companies'));
    expect(line()?.hidden).withContext('not in sight until asked for').toBeTrue();
    TestBed.inject(MoreService).toggle('details.words');
    fixture.detectChanges();
    expect(line()?.hidden).toBeFalse();
    expect(words(line() ?? null)).toBe('Similar companies, as the data source lists them: B01, B02, B03, B04, B05, B06, B07, B08, and 3 more.');
  });

  it('calls no figure good or bad: no tick, no sign, no colour of a gain or a loss', () => {
    const {el} = shown(acme());
    expect(el.querySelectorAll('.met, .unmet, .plus, .minus, .gain, .loss, .positive, .negative').length).toBe(0);
  });

  it("keeps the sentences behind the details' own control, where a reader of sentences finds the names too", () => {
    const {fixture, el} = shown(acme());
    const sentences = () => Array.from(el.querySelectorAll('p')) as HTMLElement[];
    expect(sentences().map(p => p.hidden)).withContext('out of the way until asked for').toEqual([true, true, true]);
    TestBed.inject(MoreService).toggle('details.words');
    fixture.detectChanges();
    expect(sentences().map(p => p.hidden)).toEqual([false, false, false]);
    expect(sentences().map(p => words(p).slice(0, 49))).toEqual([
      'Acme Inc is a tools company. The Company makes ha',
      'Similar companies, as the data source lists them:',
      'Both figures are averages of the last 5 years fro',
    ]);
    expect(words(sentences()[1])).toContain('Bolt Works Inc (BOLT), Chip Foundry Corp (CHIP).');
  });

  it('has no sentence about similar companies when none is listed', () => {
    const stock = acme() as any;
    stock.equity.relatedStocks = [];
    const {el} = shown(stock);
    expect(Array.from(el.querySelectorAll('dt')).map(words)).toEqual(['Keeps of its sales', 'Earns on money invested']);
    expect(el.querySelectorAll('p').length).toBe(2);
  });

  it('is not there at all for a fund, or for a company the data source says nothing about', () => {
    const fund = {...makeStock({symbol: 'FUND'}), equity: undefined} as unknown as Stock;
    expect(shown(fund).el.children.length).toBe(0);
    TestBed.resetTestingModule();
    expect(shown(makeStock({symbol: 'BARE'})).el.children.length).toBe(0);
  });

  it('is not there for a company with listed companies and no figure: nothing of it would be in sight', () => {
    const stock = makeStock({symbol: 'BARE'}) as any;
    stock.equity.relatedStocks = [{symbol: 'BOLT', displayName: 'Bolt Works Inc'}];
    expect(shown(stock as Stock).el.children.length).toBe(0);
  });

  it('follows the stock it is given', () => {
    const {fixture, el} = shown(acme());
    const other = acme() as any;
    other.equity.analysis.companyMetrics.averageGrossMargin5Year = 30.2;
    fixture.componentRef.setInput('stock', other);
    fixture.detectChanges();
    expect(words(el.querySelector('dd'))).toBe('30% · its industry 48%');
  });
});
