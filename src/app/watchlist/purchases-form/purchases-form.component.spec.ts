import {ComponentFixture, TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {Trade} from "../position-panel/position-panel.component";
import {PurchaseLine, PurchasesFormComponent} from "./purchases-form.component";

// The reader ticks the stocks they are thinking of buying, the box splits the cash, they buy at their broker: and
// then each purchase had to be recorded in a form of its own. One form takes them all.
describe('PurchasesFormComponent (the ticked stocks of "Could add", recorded in one step)', () => {
  /** Two made-up stocks ticked in a portfolio with $5,000 of cash: ACME is new, ZED is held. */
  const LINES: PurchaseLine[] = [
    {symbol: 'ACME', price: 50, dollars: 2000},
    {symbol: 'ZED', price: 20, dollars: 1000, held: {symbol: 'ZED', shares: 50, price: 30}},
  ];
  type Inputs = Partial<Pick<PurchasesFormComponent, 'lines' | 'today' | 'cash' | 'keep'>>;

  function create(inputs: Inputs = {}): ComponentFixture<PurchasesFormComponent> {
    const fixture = TestBed.createComponent(PurchasesFormComponent);
    Object.entries({lines: LINES, today: '2026-11-21', cash: 5000, ...inputs})
      .forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    return fixture;
  }

  const say = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const el = (fixture: ComponentFixture<PurchasesFormComponent>) => fixture.nativeElement as HTMLElement;

  function submitted(fixture: ComponentFixture<PurchasesFormComponent>): Trade[][] {
    const sent: Trade[][] = [];
    fixture.componentInstance.trades.subscribe(trades => sent.push(trades));
    fixture.componentInstance.submit();
    fixture.detectChanges();
    return sent;
  }

  beforeEach(() => TestBed.configureTestingModule({imports: [PurchasesFormComponent, NoopAnimationsModule]}));

  it('says first that it records purchases already made, then where its numbers come from and how to leave a stock out', () => {
    const fixture = create();
    expect(say(el(fixture).querySelector('.what'))).toBe('This records purchases you have made. Nothing is bought here.');
    expect(say(el(fixture).querySelector('.intro'))).toBe(
      "Filled in from the rows you ticked, at today's prices. Change each to what you bought; empty the shares of a stock to leave it out.");
  });

  it('names the portfolio it records into, in its first line and in the box about the cash', () => {
    const fixture = create();
    fixture.componentRef.setInput('portfolio', 'Savings');
    fixture.detectChanges();
    expect(say(el(fixture).querySelector('.what'))).toBe('This records purchases you have made in Savings. Nothing is bought here.');
    expect(say(el(fixture).querySelector('label.check'))).toBe('Paid from the cash of Savings ($5,000)');
  });

  // Found by a review of the page: unticking a row while this form was open emptied it of everything typed.
  it('keeps what was typed in the lines that stay when a row is unticked, and fills a row that is ticked from its amount', () => {
    const fixture = create(), form = fixture.componentInstance;
    form.rows[0].shares = 7;
    form.changed();
    fixture.componentRef.setInput('lines', [LINES[0]]);
    fixture.detectChanges();
    expect(form.rows.map(row => [row.symbol, row.shares])).withContext('ZED unticked').toEqual([['ACME', 7]]);
    fixture.componentRef.setInput('lines', LINES);
    fixture.detectChanges();
    expect(form.rows.map(row => [row.symbol, row.shares])).withContext('ZED ticked again').toEqual([['ACME', 7], ['ZED', 50]]);
  });

  it('starts again from the rows when they change before anything was typed', () => {
    const fixture = create(), form = fixture.componentInstance;
    fixture.componentRef.setInput('lines', [{symbol: 'ACME', price: 50, dollars: 1000}]);
    fixture.detectChanges();
    expect(form.rows.map(row => [row.symbol, row.shares])).toEqual([['ACME', 20]]);
  });

  it('has a line a stock, filled in with its amount at today\'s price, and says what each line comes to', () => {
    const fixture = create();
    expect(Array.from(el(fixture).querySelectorAll('.lines thead th')).map(say)).toEqual(['Stock', 'Shares bought', 'Price paid', 'That is']);
    expect(fixture.componentInstance.rows.map(row => [row.symbol, row.shares, row.paid])).toEqual([['ACME', 40, 50], ['ZED', 50, 20]]);
    expect(Array.from(el(fixture).querySelectorAll('.lines tbody tr')).map(row => [say(row.querySelector('th')), say(row.querySelector('.cost'))]))
      .toEqual([['ACME', '$2,000'], ['ZED', '$1,000']]);
    expect(fixture.componentInstance.day).toBe('2026-11-21');
  });

  it('names every field for a screen reader by its stock', () => {
    const labels = Array.from(el(create()).querySelectorAll('.lines input')).map(input => input.getAttribute('aria-label'));
    expect(labels).toEqual(['Shares bought of ACME', 'Price paid for ACME', 'Shares bought of ZED', 'Price paid for ZED']);
  });

  it('says what it all comes to and what that does to the cash, before anything is saved', () => {
    const fixture = create();
    expect(fixture.componentInstance.viaCash).withContext('the cash covers it').toBeTrue();
    expect(say(el(fixture).querySelector('.result'))).toBe('That is $3,000 for 2 stocks. Cash would go from $5,000 to $2,000.');
    expect(Array.from(el(fixture).querySelectorAll('button')).map(say)).toEqual(['Record these purchases', 'Cancel']);
  });

  it('hands the page a trade a stock: a new holding, and a purchase added to what is held', () => {
    const [trades] = submitted(create());
    expect(trades.map(trade => trade.text)).toEqual(['Added 40 shares of ACME at 50.00.', 'Bought 50 more shares of ZED at 20.00.']);
    expect(trades[0].holding).toEqual({symbol: 'ACME', shares: 40, price: 50, day: '2026-11-21'});
    expect([trades[1].holding!.shares, trades[1].holding!.price]).toEqual([100, 25]);
    expect(trades.map(trade => trade.cashChange)).toEqual([-2000, -1000]);
  });

  it('leaves a stock out when its shares are emptied', () => {
    const fixture = create();
    fixture.componentInstance.rows[0].shares = null;
    fixture.detectChanges();
    expect(say(el(fixture).querySelector('.result'))).toBe('That is $1,000 for 1 stock. Cash would go from $5,000 to $4,000. ACME is left out.');
    expect(submitted(fixture)[0].map(trade => trade.symbol)).toEqual(['ZED']);
  });

  it('arrives with the cash box unticked when the cash does not cover it all, and refuses it once ticked', () => {
    const fixture = create({cash: 1500});
    expect(fixture.componentInstance.viaCash).toBeFalse();
    expect(say(el(fixture).querySelector('.result'))).toBe(
      'That is $3,000 for 2 stocks. It is more than the $1,500 of cash recorded, so the cash is left as it is.');
    fixture.componentInstance.viaCash = true;
    expect(submitted(fixture)).toEqual([]);
    expect(say(el(fixture).querySelector('.problem'))).toBe(
      'That is $3,000, more than the $1,500 of cash recorded. Untick the box to leave your cash as it is, or correct "Cash" first.');
  });

  it('says which stock a problem is in, while typing once a field was changed', () => {
    const fixture = create();
    fixture.componentInstance.rows[1].paid = null;
    fixture.detectChanges();
    expect(el(fixture).querySelector('.problem')).withContext('nothing was changed by the reader yet').toBeNull();
    fixture.componentInstance.touched = true;
    fixture.detectChanges();
    expect(say(el(fixture).querySelector('.problem'))).toMatch(/^ZED: /);
    // The field it is in is marked, and tied to the sentence; the fields that are right are not.
    const fields = Array.from(el(fixture).querySelectorAll<HTMLInputElement>('.lines input'));
    expect(fields.map(field => field.getAttribute('aria-invalid'))).toEqual([null, null, null, 'true']);
    expect(fields[3].getAttribute('aria-describedby')).toBe('purchases-problem');
    expect(el(fixture).querySelector('.problem')!.id).toBe('purchases-problem');
  });

  it('refuses a form in which every stock was left out', () => {
    const fixture = create();
    fixture.componentInstance.rows.forEach(row => row.shares = null);
    expect(submitted(fixture)).toEqual([]);
    expect(say(el(fixture).querySelector('.problem'))).toBe('Enter the shares of at least one stock.');
  });

  it('points out, by its stock, a price far from today\'s, without refusing it', () => {
    const fixture = create();
    fixture.componentInstance.rows[0].paid = 5;
    fixture.detectChanges();
    expect(say(el(fixture).querySelector('.caution'))).toBe(
      "ACME: The price paid is 90% below today's price of 50.00. Check the numbers before you record it.");
    expect(submitted(fixture).length).toBe(1);
  });

  it('says when the purchases together would take the cash under what is kept outside stocks', () => {
    const fixture = create({keep: 2500});
    expect(say(el(fixture).querySelector('.caution.kept'))).toBe(
      'After these purchases your cash would be $2,000: $500 under the $2,500 you keep outside stocks.');
    expect(say(el(create({keep: 2000})).querySelector('.caution.kept'))).withContext('the cash left covers it').toBe('');
  });

  // Found by a review of the page: the form for one purchase took the keyboard when it opened, this one did not.
  it('takes the keyboard when it opens: into the first number of shares, selected', async () => {
    const selected = spyOn(HTMLInputElement.prototype, 'select');
    const fixture = create();
    await fixture.whenStable();
    const first = el(fixture).querySelector('.lines input') as HTMLInputElement;
    expect(document.activeElement).toBe(first);
    expect(selected.calls.mostRecent().object).toBe(first);
  });

  // Found by the same review: with two rows ticked the form came to 2 cents more than the cash it was filled in
  // from, and its box for the cash arrived unticked.
  it('never comes to more than the cash it was filled in from, so its cash box arrives ticked', () => {
    const lines: PurchaseLine[] = [
      {symbol: 'ACME', price: 7.774, dollars: 333.33}, {symbol: 'ZED', price: 13.136, dollars: 333.33}, {symbol: 'TOOL', price: 101.015, dollars: 333.34},
    ];
    const fixture = create({lines, cash: 1000});
    expect(fixture.componentInstance.viaCash).toBeTrue();
    expect(say(el(fixture).querySelector('.result'))).toMatch(/^That is \$1,000 for 3 stocks\. Cash would go from \$1,000 to \$0(\.0\d)?\.$/);
  });

  it('takes Esc for Cancel', () => {
    const fixture = create();
    let cancelled = 0;
    fixture.componentInstance.cancel.subscribe(() => cancelled++);
    el(fixture).querySelector('.lines input')!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(cancelled).toBe(1);
  });

  it('keeps what is being typed when today\'s prices arrive again for the same stocks', () => {
    const fixture = create();
    fixture.componentInstance.rows[0].shares = 12;
    fixture.componentRef.setInput('lines', LINES.map(line => ({...line, price: (line.price ?? 0) + 1})));
    fixture.detectChanges();
    expect(fixture.componentInstance.rows[0].shares).toBe(12);
  });
});
