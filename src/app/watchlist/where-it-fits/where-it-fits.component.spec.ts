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
    expect(say(el.querySelector('h4'))).toBe('Where it fits');
    expect(Array.from(el.querySelectorAll('li')).map(say)).toEqual(['Brokerage: 20.1% ($2,013)', 'Retirement: you own it; add 8.4% ($840)']);
    expect(say(el.querySelector('p.hint'))).toBe(
      'Its size in each of your portfolios, as a share of what that portfolio is worth. The Portfolio view lists it under "Could add".');
  });

  it('works out no amount for a stock that is not marked DIP BUY, and says why', () => {
    const el = create([], false);
    expect(el.querySelector('ul')).toBeNull();
    expect(say(el.querySelector('p.hint'))).toBe(
      'Only a stock marked DIP BUY gets a size: the tests measured no others, so the app works out no amount for this one.');
  });

  it('says how to get a size while no portfolio is worth anything', () => {
    const el = create([], true);
    expect(el.querySelector('ul')).toBeNull();
    expect(say(el.querySelector('p.hint'))).toBe(
      'None of your portfolios is worth anything yet. Enter the cash of one on the Portfolio view to see a size.');
  });
});
