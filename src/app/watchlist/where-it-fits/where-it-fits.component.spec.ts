import {ComponentFixture, TestBed} from "@angular/core/testing";
import {WhereItFitsComponent} from "./where-it-fits.component";

function create(lines: string[], marked: boolean): HTMLElement {
  const fixture: ComponentFixture<WhereItFitsComponent> = TestBed.createComponent(WhereItFitsComponent);
  fixture.componentRef.setInput('lines', lines);
  fixture.componentRef.setInput('marked', marked);
  fixture.detectChanges();
  return fixture.nativeElement;
}

const say = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('WhereItFitsComponent ("Where it fits", in a stock\'s details)', () => {
  beforeEach(() => TestBed.configureTestingModule({imports: [WhereItFitsComponent]}));

  it('lists the stock\'s size in each portfolio, a line each, and says where the same is listed', () => {
    const el = create(['Brokerage: 20.1% ($2,013)', 'Retirement: you own it; add 8.4% ($840)'], true);
    // Found by a review: "Brokerage: 20.1% ($2,013)" did not say of what. The heading says it now.
    expect(say(el.querySelector('h4'))).toBe('Where it fits · its size, as a share of each portfolio');
    expect(Array.from(el.querySelectorAll('li')).map(say)).toEqual(['Brokerage: 20.1% ($2,013)', 'Retirement: you own it; add 8.4% ($840)']);
    expect(say(el.querySelector('p.hint'))).toBe(
      'Its size in each of your portfolios, as a share of what that portfolio is worth. The Portfolio view lists it under "Could add".');
    // The owner: "too much text and not much signal". The lines are the signal; what a size is, is one "more" away.
    expect((el.querySelector('p.hint') as HTMLElement).hidden).withContext('it opens with the other sentences of the details').toBeTrue();
    expect(el.querySelector('app-more')).withContext('no control of its own: the details have one for all their sentences').toBeNull();
  });

  // Found by a review: the size stood without what it could lose or make, which was on the other view only.
  it('says what the size in the portfolio being shown could lose or make, the bad case first', () => {
    const fixture: ComponentFixture<WhereItFitsComponent> = TestBed.createComponent(WhereItFitsComponent);
    fixture.componentRef.setInput('lines', ['Brokerage: 20.1% ($2,013)']);
    fixture.componentRef.setInput('marked', true);
    fixture.componentRef.setInput('cases', {portfolio: 'Brokerage', bad: '−$825', typical: '+$48', good: '+$1,711'});
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(say(el.querySelector('.cases .at-size'))).toBe('At that size in Brokerage, after 6 months');
    expect(Array.from(el.querySelectorAll('.cases dl.facts > div')).map(it => [say(it.querySelector('dt')), say(it.querySelector('dd'))])).toEqual(
      [['Bad case', '−$825'], ['Typical', '+$48'], ['Good case', '+$1,711']]);
  });

  it('shows no such figures for a stock without a size there', () => {
    expect(create(['Brokerage: you own it; add 8.4% ($840)'], true).querySelector('.cases')).toBeNull();
  });

  it('works out no amount for a stock that is not marked DIP BUY, and says why', () => {
    const el = create([], false);
    expect(el.querySelector('ul')).toBeNull();
    expect(say(el.querySelector('p.hint.short'))).withContext('the fact, in a few words').toBe('No size: it is not marked DIP BUY.');
    const why = el.querySelector('p.hint:not(.short)') as HTMLElement;
    expect(say(why)).toBe(
      'Only a stock marked DIP BUY gets a size: the tests measured no others, so the app works out no amount for this one.');
    expect(why.hidden).withContext('why it is so opens with the other sentences of the details').toBeTrue();
    expect(el.querySelector('app-more')).toBeNull();
  });

  it('says how to get a size while no portfolio is worth anything', () => {
    const el = create([], true);
    expect(el.querySelector('ul')).toBeNull();
    expect(say(el.querySelector('p.hint'))).toBe(
      'None of your portfolios is worth anything yet. Enter the cash of one on the Portfolio view to see a size.');
  });
});
