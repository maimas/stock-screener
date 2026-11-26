import {ComponentFixture, TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {Trade} from "../position-panel/position-panel.component";
import {Position} from "../positions";
import {PurchaseFormComponent} from "./purchase-form.component";

// The owner of the page asked to add a stock straight from "Could add", "default position values are the
// recommended ones": the form arrives filled in with the amount of the row at today's price.
describe('PurchaseFormComponent (a purchase recorded in a row of "Could add")', () => {
  type Inputs = Partial<Pick<PurchaseFormComponent, 'symbol' | 'held' | 'price' | 'dollars' | 'today' | 'cash' | 'keep'>>;

  /** A made-up row: ACME at 50.00 today, sized $2,013 for a portfolio with $5,000 of cash. */
  function create(inputs: Inputs = {}): ComponentFixture<PurchaseFormComponent> {
    const fixture = TestBed.createComponent(PurchaseFormComponent);
    Object.entries({symbol: 'ACME', price: 50, dollars: 2013, today: '2026-11-21', cash: 5000, ...inputs})
      .forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    return fixture;
  }

  const say = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const part = (fixture: ComponentFixture<PurchaseFormComponent>, selector: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(selector);

  function submitted(fixture: ComponentFixture<PurchaseFormComponent>): Trade[] {
    const trades: Trade[] = [];
    fixture.componentInstance.trade.subscribe(trade => trades.push(trade));
    fixture.componentInstance.submit();
    fixture.detectChanges();
    return trades;
  }

  beforeEach(() => TestBed.configureTestingModule({imports: [PurchaseFormComponent, NoopAnimationsModule]}));

  // Found by a review of the page: with several portfolios, one of which may be pretend money, the form said "this
  // portfolio" while the portfolio's name could be scrolled out of sight.
  it('names the portfolio it records into, in its first line and in the box about the cash', () => {
    const fixture = create();
    fixture.componentRef.setInput('portfolio', 'Savings');
    fixture.detectChanges();
    expect(say(part(fixture, '.what'))).toBe('This records a purchase you have made in Savings. Nothing is bought here.');
    expect(say(part(fixture, 'label.check'))).toBe('Paid from the cash of Savings ($5,000)');
    expect(say(part(create(), 'label.check'))).withContext('not told which').toBe("Paid from this portfolio's cash ($5,000)");
  });

  it('arrives filled in: the amount of the row at today\'s price as shares, that price, and today', () => {
    const form = create().componentInstance;
    expect([form.shares, form.paid, form.day]).toEqual([40.26, 50, '2026-11-21']);
  });

  // A form with a quantity, a price, today's date and a total looks like an order ticket, and in this box "add"
  // is the word for buying. So the first thing the form says is what it is: a record of something done, not an order.
  it('says first that it records a purchase already made and buys nothing, then where its numbers come from', () => {
    expect(say(part(create(), '.what'))).toBe('This records a purchase you have made. Nothing is bought here.');
    expect(say(part(create(), '.intro'))).toBe("Filled in from this row: $2,013 at today's price of 50.00. Change it to what you bought.");
    expect(say(part(create({dollars: undefined}), '.intro'))).withContext('a row without a size').toBe('Enter what you bought.');
  });

  it('names its fields as a purchase, and its buttons by what they do: one records, as the sale form\'s does', () => {
    const fixture = create();
    const labels = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.fields label span')).map(say);
    expect(labels).toEqual(['Shares bought', 'Price paid', 'Bought on (optional)']);
    expect(Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map(say)).toEqual(['Record this purchase', 'Cancel']);
  });

  it('takes the purchase out of the cash when cash is recorded, and says before saving what both come to', () => {
    const fixture = create();
    expect(fixture.componentInstance.viaCash).toBeTrue();
    expect(say(part(fixture, 'label.check'))).toBe("Paid from this portfolio's cash ($5,000)");
    expect(say(part(fixture, '.result'))).toBe('That is $2,013. Cash would go from $5,000 to $2,987.');
  });

  it('hands the page a new holding, what it does to the cash and the sentence that says it', () => {
    const [trade] = submitted(create());
    expect(trade.symbol).toBe('ACME');
    expect(trade.holding).toEqual({symbol: 'ACME', shares: 40.26, price: 50, day: '2026-11-21'});
    expect(trade.cashChange).toBeCloseTo(-2013, 6);
    expect(trade.text).toBe('Added 40.26 shares of ACME at 50.00.');
  });

  it('leaves the cash as it is when the box is unticked', () => {
    const fixture = create();
    fixture.componentInstance.viaCash = false;
    fixture.detectChanges();
    expect(say(part(fixture, '.result'))).toBe('That is $2,013.');
    expect(submitted(fixture)[0].cashChange).toBe(0);
  });

  // The one rule of the box in every purchase form: it follows the numbers until the reader sets it.
  it('unticks its cash box when the numbers typed go above the cash, and says why instead of refusing', () => {
    const fixture = create();
    fixture.componentInstance.shares = 200;
    fixture.componentInstance.changed();
    fixture.detectChanges();
    expect(fixture.componentInstance.viaCash).toBeFalse();
    expect(part(fixture, '.problem')).toBeNull();
    expect(say(part(fixture, '.result'))).toBe('That is $10,000. It is more than the $5,000 of cash recorded, so the cash is left as it is.');
    fixture.componentInstance.shares = 20;
    fixture.componentInstance.changed();
    expect(fixture.componentInstance.viaCash).withContext('back under the cash').toBeTrue();
  });

  it('has no box about cash for a portfolio with no record of cash', () => {
    const fixture = create({cash: undefined});
    expect(part(fixture, 'label.check')).toBeNull();
    expect(submitted(fixture)[0].cashChange).toBe(0);
  });

  it('adds the purchase to a stock that is held: the shares added up and the price paid averaged', () => {
    const held: Position = {symbol: 'ACME', shares: 30, price: 60, day: '2026-11-01'};
    const fixture = create({held, dollars: 500});
    expect(say(part(fixture, '.result'))).toBe('You would then hold 40 shares at an average price of 57.50. Cash would go from $5,000 to $4,500.');
    const [trade] = submitted(fixture);
    expect(trade.text).toBe('Bought 10 more shares of ACME at 50.00.');
    expect([trade.holding!.shares, trade.holding!.price, trade.cashChange]).toEqual([40, 57.5, -500]);
  });

  it('refuses a purchase paid from more cash than is recorded, and says the two ways on', () => {
    const fixture = create({cash: 1000});
    // The filled-in amount is more than the cash, so the form arrives with the box unticked and can be saved as
    // it is: a form that refuses its own starting values would be a dead end.
    expect(fixture.componentInstance.viaCash).withContext('unticked to begin with').toBeFalse();
    expect(say(part(fixture, '.result'))).toBe('That is $2,013. It is more than the $1,000 of cash recorded, so the cash is left as it is.');
    fixture.componentInstance.viaCash = true;
    fixture.detectChanges();
    expect(submitted(fixture)).toEqual([]);
    expect(say(part(fixture, '.problem'))).toBe(
      'That is $2,013, more than the $1,000 of cash recorded. Untick the box to leave your cash as it is, or correct "Cash" first.');
    expect(say(part(fixture, '.result'))).withContext('no result beside a problem').toBe('');
  });

  it('points a problem out only after an attempt to save', () => {
    const fixture = create({dollars: undefined});
    expect(part(fixture, '.problem')).toBeNull();
    expect(submitted(fixture)).toEqual([]);
    expect(say(part(fixture, '.problem'))).toBe('Enter how many shares you bought.');
  });

  // A problem used to be said only after "Record this purchase": the reader learned of an empty field or of too
  // little cash one step late. Once a field was changed it is said while typing, where it can be put right.
  it('says a problem while typing once a field was changed, and not before', () => {
    const fixture = create();
    fixture.componentInstance.shares = null;
    fixture.detectChanges();
    expect(part(fixture, '.problem')).withContext('nothing was changed by the reader yet').toBeNull();
    part(fixture, 'input[name="shares"]')!.dispatchEvent(new Event('input', {bubbles: true}));
    fixture.componentInstance.shares = null;
    fixture.detectChanges();
    expect(say(part(fixture, '.problem'))).toBe('Enter how many shares you bought.');
    // The field it is in is marked and tied to the sentence; the price, which is right, is not.
    expect(part(fixture, 'input[name="shares"]')!.getAttribute('aria-invalid')).toBe('true');
    expect(part(fixture, 'input[name="shares"]')!.getAttribute('aria-describedby')).toBe('purchase-problem');
    expect(part(fixture, 'input[name="paid"]')!.getAttribute('aria-invalid')).toBeNull();
  });

  // A digit too many: 50.00 typed as 500. The form says so while it is typed, and still lets it be recorded.
  it('points out a price far from today\'s and an amount far above the row\'s, without refusing them', () => {
    const fixture = create();
    expect(say(part(fixture, '.caution'))).withContext('as it arrives').toBe('');
    fixture.componentInstance.paid = 500;
    fixture.componentInstance.viaCash = false;
    fixture.detectChanges();
    expect(say(part(fixture, '.caution'))).toBe(
      "The price paid is 900% above today's price of 50.00. That is $20,130, 10 times the amount in its row ($2,013). " +
      'Check the numbers before you record it.');
    expect(part(fixture, '.caution')!.getAttribute('role')).toBe('status');
    expect(submitted(fixture).length).withContext('it is a question, not a refusal').toBe(1);
  });

  it('keeps what is being typed when today\'s prices arrive again', () => {
    const fixture = create();
    fixture.componentInstance.shares = 12;
    fixture.componentRef.setInput('price', 51);
    fixture.detectChanges();
    expect(fixture.componentInstance.shares).toBe(12);
  });

  // The user may keep a share of the portfolio outside stocks. A purchase paid from the cash that takes the cash
  // under it is said before it is saved; it is their number, so nothing is refused.
  it('says when the purchase would take the cash under what is kept outside stocks, and still records it', () => {
    const fixture = create({keep: 4000});
    expect(say(part(fixture, '.caution.kept'))).toBe(
      'After this purchase your cash would be $2,987: $1,013 under the $4,000 you keep outside stocks.');
    expect(submitted(fixture).length).toBe(1);
  });

  it('says nothing about it when the cash left covers what is kept, or when the purchase is not paid from the cash', () => {
    expect(say(part(create({keep: 2000}), '.caution.kept'))).toBe('');
    const other = create({keep: 4000});
    other.componentInstance.viaCash = false;
    other.detectChanges();
    expect(say(part(other, '.caution.kept'))).toBe('');
  });

  it('takes Esc for Cancel', () => {
    const fixture = create();
    let cancelled = 0;
    fixture.componentInstance.cancel.subscribe(() => cancelled++);
    part(fixture, 'input[name="shares"]')!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(cancelled).toBe(1);
  });

  // The form can be saved as it arrives, and the suggested number of shares (to four decimals) is rarely what was
  // bought. So that number arrives selected: the first key typed replaces it.
  it('arrives with the number of shares selected, so that typing replaces the suggestion', async () => {
    const selected = spyOn(HTMLInputElement.prototype, 'select');
    const fixture = create();
    await fixture.whenStable();
    expect(selected).toHaveBeenCalledTimes(1);
    expect(selected.calls.mostRecent().object).toBe(part(fixture, 'input[name="shares"]') as HTMLInputElement);
  });
});
