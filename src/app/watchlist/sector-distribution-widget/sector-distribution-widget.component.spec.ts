import {TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {SectorDistributionWidgetComponent} from "./sector-distribution-widget.component";
import {makeStock} from "../testing/fixtures";
import {Stock} from "../../api/microsoft-money.service";

/** A stock with the price changes the data source reports for it, in %. */
function stock(symbol: string, sector: string, changes: { day?: number, week?: number, year?: number } = {}): Stock {
  const made = makeStock({symbol, sector});
  Object.assign(made.quote, {priceChangePercent: changes.day, return1Week: changes.week, return1Year: changes.year});
  return made;
}

function headerOf(stocks: Stock[]): SectorDistributionWidgetComponent {
  const header = Object.assign(new SectorDistributionWidgetComponent(), {name: 'AI CHIPS', stocks});
  header.ngOnChanges();
  return header;
}

describe('SectorDistributionWidgetComponent (the heading of one list)', () => {
  it('says what the list is made of, largest group first', () => {
    const header = headerOf([stock('NVDA', 'Technology'), stock('AMD', 'Technology'), stock('VST', 'Utilities')]);
    expect(header.sectorSummary).toBe('2 Technology · 1 Utilities');
  });

  it('gives the average price change of its stocks over six periods, each named in words', () => {
    const header = headerOf([stock('NVDA', 'Technology', {day: -4, week: -10, year: 30}), stock('AMD', 'Technology', {day: -2, week: -20, year: 50})]);
    expect(header.changes.map(it => it.label)).toEqual(['1 day', '1 week', '1 month', '3 months', '6 months', '1 year']);
    expect(header.changes.map(it => it.value)).toEqual([-3, -15, null, null, null, 40]);
  });

  // Found by a review of the page: one stock with an extreme year ("+900%") ruled the average of a whole list.
  // The line now gives the middle stock, which the page calls "typical" everywhere else.
  it('gives the middle stock of the list, which one extreme stock does not move', () => {
    const header = headerOf([
      stock('AAA', 'Technology', {year: 10}), stock('BBB', 'Technology', {year: 20}), stock('CCC', 'Technology', {year: 900}),
    ]);
    expect(header.changes[5]).toEqual({label: '1 year', value: 20});
  });

  it('leaves a stock without a figure out of that average, rather than counting it as zero', () => {
    const header = headerOf([stock('NVDA', 'Technology', {day: -4}), stock('NEW', 'Technology')]);
    expect(header.changes[0]).toEqual({label: '1 day', value: -4});
  });
});

describe('SectorDistributionWidgetComponent, as shown', () => {
  function shown(showChanges: boolean): HTMLElement {
    TestBed.configureTestingModule({imports: [SectorDistributionWidgetComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(SectorDistributionWidgetComponent);
    fixture.componentRef.setInput('name', 'AI CHIPS');
    fixture.componentRef.setInput('stocks', [stock('NVDA', 'Technology', {day: -4}), stock('AMD', 'Technology', {day: -2})]);
    fixture.componentRef.setInput('showChanges', showChanges);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  // Six averages a list, forty-two down the page, none of them used by a mark: context for who asks for every column.
  it('is one line (the name and what the list is made of) until every column is asked for', () => {
    const el = shown(false);
    expect(el.querySelector('h3')?.textContent?.trim()).toBe('AI CHIPS');
    expect(el.querySelector('.sectors')?.textContent?.trim()).toBe('2 Technology');
    expect(el.querySelector('.changes')).toBeNull();
  });

  it('adds the list\'s average price changes with every column', () => {
    expect(shown(true).querySelector('.changes')?.textContent).toContain('Typical price change:');
  });
});
