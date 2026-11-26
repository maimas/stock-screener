import {TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {PositionPanelComponent} from "./position-panel.component";
import {PositionRow} from "../portfolio-view";
import {viewOf} from "../positions";
import {riskOf, TestedCases} from "../sizing";
import {makeStock} from "../testing/fixtures";

const TODAY = '2026-11-21';
const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
/** A 40,000 portfolio and a 2% limit: 800 on one stock. */
const PORTFOLIO = 40_000, LIMIT = 800;

/** The panel for NVDA at 90 a share: held (bought at 100) when `shares` is given, marked DIP BUY unless told otherwise. */
function panel(o: { shares?: number, day?: string, marked?: boolean, limit?: number | null } = {}): PositionPanelComponent {
  const cases = o.marked === false ? undefined : VOLATILE;
  const limit = o.limit === null ? undefined : LIMIT;
  let row: PositionRow | undefined;
  if (o.shares) {
    const position = {symbol: 'NVDA', shares: o.shares, price: 100, ...(o.day ? {day: o.day} : {})};
    const view = viewOf(position, {price: 90, portfolioValue: PORTFOLIO, today: TODAY});
    row = {symbol: 'NVDA', view, verdict: cases ? 'DIP BUY' : 'PASS', cases, risk: riskOf(view, cases, limit, PORTFOLIO)};
  }
  return Object.assign(new PositionPanelComponent(), {stock: makeStock({symbol: 'NVDA', price: 90}), row, cases, budget: limit, today: TODAY});
}

describe('PositionPanelComponent: how long the position has been held', () => {
  it('counts the weeks against the 6 months the tests followed', () => {
    expect(panel({shares: 10, day: '2026-10-12'}).timeText).toBe('Week 6 of the 26 the tests followed.');
  });

  it('says when the position is older than that', () => {
    expect(panel({shares: 10, day: '2025-10-01', marked: false}).timeText).toBe(
      'Held 59 weeks: longer than the 6 months the tests followed, and after that they disagree.');
  });

  // The plan keeps a stock that is marked DIP BUY today whenever it was bought, so it must not read as overdue.
  it('says that the 6 months count from today when an older position is marked DIP BUY again', () => {
    expect(panel({shares: 10, day: '2025-10-01'}).timeText).toBe(
      'Held 59 weeks. It is marked DIP BUY today, so the plan counts its 6 months from today.');
  });

  it('asks for the purchase date when there is none', () => {
    expect(panel({shares: 10}).timeText).toBe(
      'No purchase date recorded. Add it with Edit to compare with the market since then and to count the weeks the tests followed.');
  });
});

describe('PositionPanelComponent, in everyday words', () => {
  it('says how the holding is doing', () => {
    expect(panel({shares: 60}).resultText).toBe('Now worth $5,400: −$600 (−10.0%).');
    expect(panel({shares: 60}).weightText).toBe('13.5% of your portfolio.');
  });

  it('says what a bad half-year would cost and how that stands against the limit', () => {
    expect(panel({shares: 60}).riskText).toBe(
      'A bad half-year (−41%, as bad as 1 in 10 in tests) would cost −$2,214, 5.5% of your portfolio. ' +
      'That is over your limit of $800: up to $1,951 of this stock fits it.');
    expect(panel({shares: 10}).riskText).toBe(
      'A bad half-year (−41%, as bad as 1 in 10 in tests) would cost −$369, 0.9% of your portfolio, within your limit of $800.');
    expect(panel({shares: 10, limit: null}).riskText).toBe(
      'A bad half-year (−41%, as bad as 1 in 10 in tests) would cost −$369, 0.9% of your portfolio.');
    expect(panel({shares: 10, marked: false}).riskText).toBe('');
  });

  // Found by a review: "What you own of it" was five sentences and a paragraph (134 words). The same figures stand
  // as rows now, a name and a figure each; the sentences are one "more" away.
  it('gives the holding as figures with their names, the bad half-year before the typical and the good one', () => {
    expect(panel({shares: 60}).ownFacts.map(it => [it.label, it.value, !!it.over])).toEqual([
      ['Holding', '60 shares at an average price of 100.00', false],
      ['Value', '$5,400 · −$600 (−10.0%)', false],
      ['Held', 'no purchase date recorded', false],
      ['% of total', '13.5% of your portfolio', false],
      ['Bad case', '−$2,214 (−41%) · 5.5% of your portfolio · over your limit of $800', true],
      ['Typical', '+$130 (+2.4%)', false],
      ['Good case', '+$4,590 (+85%)', false],
    ]);
    expect(panel({shares: 10, marked: false}).ownFacts.map(it => it.label)).withContext('no tested cases for a stock without the mark').toEqual(
      ['Holding', 'Value', 'Held', '% of total']);
  });

  it('gives the typical and the good half-year beside it', () => {
    expect(panel({shares: 60}).rangeText).toBe(
      'A typical half-year in the same tests (+2.4%) would mean +$130, and a good one (+85%) +$4,590.');
  });

  // How big a stock that is not held could be in each portfolio is said beside this panel ("Where it fits"), so the
  // panel itself no longer works a size out from the limit.
  it('names a holding the way the page does, without the trade\'s word for it', () => {
    expect(panel().heading).toBe('What you own of it');
    expect(panel({shares: 10}).saveLabel).toBe('Save');
    // One act, one name: the first entry of a stock is recorded under the words of every other purchase form.
    expect(panel().saveLabel).toBe('Record this purchase');
    expect([panel().heading, panel().saveLabel].join(' ')).not.toMatch(/position/i);
  });

  // The panel is on the watchlist's view; which portfolio it reads and writes was chosen on the other view and
  // stood nowhere here. With several accounts, a holding typed into the wrong one is an error nobody sees.
  it('says which portfolio it is about when there is more than one, and on what it adds to', () => {
    const one = panel();
    expect(one.heading).withContext('one portfolio needs no name').toBe('What you own of it');
    const named = Object.assign(panel(), {portfolio: 'Retirement'});
    expect(named.heading).toBe('What you own of it in Retirement');
    expect(named.saveLabel).withContext('the heading names the portfolio; the button says what is done').toBe('Record this purchase');
    expect(Object.assign(panel({shares: 10}), {portfolio: 'Retirement'}).saveLabel).withContext('a holding that is there is only saved').toBe('Save');
  });
});

// The plan's two requests are to buy and to sell some. Recording either meant "Edit": type the new number of
// shares and the new average price over the old ones. The panel now takes the purchase or the sale itself.
describe('PositionPanelComponent: a purchase or a sale of a stock that is held', () => {
  /** 10 shares of NVDA bought at 100 on Oct 1. */
  const held = () => panel({shares: 10, day: '2026-10-01'});

  it('says what the holding would be after the purchase being entered, before anything is saved', () => {
    const p = held();
    p.startRecording('bought');
    expect(p.purchaseResult).withContext('nothing entered yet').toBe('');
    Object.assign(p, {boughtShares: 30, boughtPrice: 60, boughtDay: '2026-10-01'});
    expect(p.purchaseResult).toBe('That is $1,800. You would then hold 40 shares at an average price of 70.00.');
  });

  it('adds the purchase to the holding: shares added up, the price averaged, one day for the whole', () => {
    // Made-up days, a Saturday and a Sunday among them: 10 shares on Oct 3, 30 more twenty days later, so Oct 18.
    const p = panel({shares: 10, day: '2026-10-03'});
    const saved: unknown[] = [];
    p.trade.subscribe(trade => saved.push(trade));
    p.startRecording('bought');
    Object.assign(p, {boughtShares: 30, boughtPrice: 100, boughtDay: '2026-10-23'});
    p.submitPurchase();
    expect(saved).toEqual([{
      symbol: 'NVDA', holding: {symbol: 'NVDA', shares: 40, price: 100, day: '2026-10-18'}, cashChange: 0,
      text: 'Bought 30 more shares of NVDA at 100.00.',
    }]);
    expect(p.recording).withContext('the form closes').toBeUndefined();
  });

  it('starts the purchase from today\'s price and date, and asks for what is missing only after a try to save', () => {
    const p = held();
    p.startRecording('bought');
    expect([p.boughtShares, p.boughtPrice, p.boughtDay]).toEqual([null, 90, TODAY]);
    expect(p.purchaseProblem).toBe('Enter how many shares you bought.');
    expect(p.attempted).toBeFalse();
    const saved: unknown[] = [];
    p.save.subscribe(position => saved.push(position));
    p.submitPurchase();
    expect(p.attempted).toBeTrue();
    expect(saved).toEqual([]);
  });

  it('says what would be left after the sale being entered, and that all of it is the whole holding', () => {
    const p = held();
    p.startRecording('sold');
    expect(p.saleResult).toBe('');
    p.soldShares = 4;
    expect(p.saleResult).toBe('You would then hold 6 shares, at the same price paid.');
    p.soldShares = 10;
    expect(p.saleResult).toBe('That is all you hold of it: NVDA would be taken out of what you own.');
    p.soldShares = 12;
    expect(p.saleResult).toBe('');
    expect(p.saleProblem).toBe('You hold 10 shares: enter that many or fewer.');
  });

  it('records a sale of some shares as a smaller holding, and a sale of all of them as a removal', () => {
    const p = held();
    const saved: unknown[] = [];
    p.trade.subscribe(trade => saved.push(trade));
    p.startRecording('sold');
    p.soldShares = 4;
    p.submitSale();
    p.startRecording('sold');
    p.soldShares = 10;
    p.submitSale();
    expect(saved).toEqual([
      {symbol: 'NVDA', holding: {symbol: 'NVDA', shares: 6, price: 100, day: '2026-10-01'}, cashChange: 0, text: 'Sold 4 shares of NVDA.'},
      // No holding is left: the page takes the stock out of what is owned.
      {symbol: 'NVDA', holding: undefined, cashChange: 0, text: 'Sold all you held of NVDA.'},
    ]);
  });

  it('gives up the entry on Cancel, and when another stock is shown', () => {
    const p = held();
    p.startRecording('sold');
    p.stopRecording();
    expect(p.recording).toBeUndefined();
    p.startRecording('bought');
    p.stock = makeStock({symbol: 'AMD', price: 50});
    p.ngOnChanges();
    expect(p.recording).toBeUndefined();
  });
});

// A purchase recorded without its money leaving the cash counts that money twice: as the stock and as cash. The
// portfolio then looks larger than it is and every size the plan gives is too large. So the form settles a trade
// against the cash in the same step, says so before saving, and lets the reader leave the cash alone.
describe('PositionPanelComponent: a purchase or a sale and the cash of the portfolio', () => {
  /** 10 shares of NVDA bought at 100 on Oct 1 (now 90 a share), in a portfolio with this much cash recorded. */
  const heldWith = (cash: number | undefined) => Object.assign(panel({shares: 10, day: '2026-10-01'}), {cash});

  it('takes a purchase out of the cash unless told not to, and says what the cash would then be', () => {
    const p = heldWith(5000);
    const saved: Array<{ cashChange: number }> = [];
    p.trade.subscribe(trade => saved.push(trade));
    p.startRecording('bought');
    expect(p.viaCash).toBeTrue();
    Object.assign(p, {boughtShares: 30, boughtPrice: 60, boughtDay: '2026-10-01'});
    expect(p.purchaseResult).toBe('That is $1,800. You would then hold 40 shares at an average price of 70.00. Cash would go from $5,000 to $3,200.');
    p.submitPurchase();
    expect(saved.map(trade => trade.cashChange)).toEqual([-1800]);

    p.startRecording('bought');
    Object.assign(p, {boughtShares: 30, boughtPrice: 60, viaCash: false});
    expect(p.purchaseResult).toBe('That is $1,800. You would then hold 40 shares at an average price of 70.00.');
    p.submitPurchase();
    expect(saved.map(trade => trade.cashChange)).toEqual([-1800, 0]);
  });

  it('refuses a purchase that cost more than the cash recorded, and says the two ways on', () => {
    const p = heldWith(1000);
    const saved: unknown[] = [];
    p.trade.subscribe(trade => saved.push(trade));
    p.startRecording('bought');
    Object.assign(p, {boughtShares: 30, boughtPrice: 60});
    expect(p.purchaseProblem).toBe(
      'That is $1,800, more than the $1,000 of cash recorded. Untick the box to leave your cash as it is, or correct "Cash" first.');
    expect(p.purchaseResult).toBe('');
    p.submitPurchase();
    expect(saved).toEqual([]);
    p.viaCash = false;
    expect(p.purchaseProblem).toBeUndefined();
  });

  it('leaves the cash alone where none is recorded or it is zero', () => {
    const none = heldWith(undefined), zero = heldWith(0);
    none.startRecording('bought');
    zero.startRecording('bought');
    expect([none.viaCash, zero.viaCash]).toEqual([false, false]);
  });

  it('adds what a sale brought to the cash, at the price it was sold at', () => {
    const p = heldWith(5000);
    const saved: unknown[] = [];
    p.trade.subscribe(trade => saved.push(trade));
    p.startRecording('sold');
    expect([p.viaCash, p.soldPrice]).withContext('starts from today\'s price').toEqual([true, 90]);
    p.soldShares = 4;
    expect(p.saleResult).toBe('You would then hold 6 shares, at the same price paid. Cash would go from $5,000 to $5,360.');
    p.soldPrice = null;
    expect(p.saleProblem).toBe('Enter the price you sold at, or untick the box to leave your cash as it is.');
    p.soldPrice = 95;
    p.submitSale();
    expect(saved).toEqual([{
      symbol: 'NVDA', holding: {symbol: 'NVDA', shares: 6, price: 100, day: '2026-10-01'}, cashChange: 380, text: 'Sold 4 shares of NVDA at 95.00.',
    }]);
  });

  it('settles the first entry of a stock the same way, and never a correction', () => {
    const fresh = Object.assign(panel({}), {cash: 5000});
    fresh.ngOnChanges();
    const saved: unknown[] = [];
    fresh.trade.subscribe(trade => saved.push(trade));
    Object.assign(fresh, {shares: 10, price: 90, day: TODAY});
    expect(fresh.firstResult).toBe('That is $900. Cash would go from $5,000 to $4,100.');
    fresh.submit();
    expect(saved).toEqual([{
      symbol: 'NVDA', holding: {symbol: 'NVDA', shares: 10, price: 90, day: TODAY}, cashChange: -900, text: 'Added 10 shares of NVDA at 90.00.',
    }]);

    const owned = heldWith(5000);
    owned.ngOnChanges();
    const corrected: unknown[] = [], traded: unknown[] = [];
    owned.save.subscribe(position => corrected.push(position));
    owned.trade.subscribe(trade => traded.push(trade));
    owned.startEdit();
    owned.shares = 12;
    owned.submit();
    expect(corrected).toEqual([{symbol: 'NVDA', shares: 12, price: 100, day: '2026-10-01'}]);
    expect(traded).withContext('"Edit" corrects the record: no trade, no cash').toEqual([]);
  });
});

describe('PositionPanelComponent, as shown: what can be done with a holding', () => {
  function shown(o: Parameters<typeof panel>[0]) {
    TestBed.configureTestingModule({imports: [PositionPanelComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(PositionPanelComponent);
    const from = panel(o);
    Object.assign(fixture.componentInstance, {stock: from.stock, row: from.row, cases: from.cases, budget: from.budget, today: TODAY});
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // What can be done with the holding: not the "more" at the end of a sentence, which opens the rest of that sentence.
    const buttons = () => Array.from(el.querySelectorAll('button:not(.toggle)')).map(it => it.textContent?.trim());
    const press = (label: string) => {
      (Array.from(el.querySelectorAll('button')).find(it => it.textContent?.trim() === label) as HTMLButtonElement).click();
      fixture.detectChanges();
    };
    return {el, buttons, press};
  }

  afterEach(() => TestBed.resetTestingModule());

  it('offers, for a stock that is held: a purchase, a sale, a correction and taking it out, in that order', () => {
    expect(shown({shares: 10}).buttons()).toEqual(['Bought more', 'Sold some', 'Edit', 'Remove']);
  });

  it('asks for this purchase only, in fields that say so, and says what the page will do with it', () => {
    const {el, buttons, press} = shown({shares: 10});
    press('Bought more');
    expect(Array.from(el.querySelectorAll('label > span')).map(it => it.textContent?.trim())).toEqual(['Shares bought', 'Price paid', 'Bought on (optional)']);
    expect(el.querySelector('.intro')?.textContent?.trim()).toBe(
      'Enter this purchase only. The page adds it to what you hold and works out the new average price.');
    expect(buttons()).toEqual(['Record this purchase', 'Cancel']);
    expect(document.activeElement).withContext('ready to type the shares').toBe(el.querySelector('input[name="boughtShares"]'));
  });

  it('asks for the shares sold, and nothing else', () => {
    const {el, buttons, press} = shown({shares: 10});
    press('Sold some');
    expect(Array.from(el.querySelectorAll('label > span')).map(it => it.textContent?.trim())).toEqual(['Shares sold']);
    // The line the purchase forms have over their fields: what to enter and what the page does with it.
    expect(el.querySelector('.intro')?.textContent?.trim()).toBe(
      'Enter this sale only. The page takes the shares from what you hold; the price you paid for the rest stays as it is.');
    expect(buttons()).toEqual(['Record this sale', 'Cancel']);
  });

  // Found by a review of the page: under every stock that is not held stood an open form with a quantity, a price,
  // a date and a filled button, with no Cancel and without the line that nothing is bought. It opens on a button
  // now, as "Bought more" does.
  it('offers one button for a stock that is not held, and opens the form on it: nothing like an order stands open', () => {
    const {el, buttons, press} = shown({});
    expect(buttons()).toEqual(['Enter what you hold']);
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('.intro')?.textContent).toContain('Not in this portfolio.');
    press('Enter what you hold');
    expect(buttons()).toEqual(['Record this purchase', 'Cancel']);
    expect(el.querySelector('form .what')?.textContent?.trim()).toBe('This records a purchase you have made. Nothing is bought here.');
    press('Cancel');
    expect(buttons()).withContext('Cancel puts the one button back').toEqual(['Enter what you hold']);
  });
});

// The first thing a hand on the keyboard tries to get out of a form is Esc. It did nothing anywhere on the page.
describe('PositionPanelComponent: the Esc key', () => {
  const key = () => jasmine.createSpyObj<Event>('event', ['stopPropagation']);

  it('cancels the purchase or the sale being entered, and keeps the key from closing the details around it', () => {
    const p = panel({shares: 10});
    p.startRecording('sold');
    const event = key();
    p.escape(event);
    expect(p.recording).toBeUndefined();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('cancels a correction being typed', () => {
    const p = panel({shares: 10});
    p.startEdit();
    p.shares = 99;
    const event = key();
    p.escape(event);
    expect([p.editing, p.shares]).toEqual([false, 10]);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('lets the key through where there is nothing to cancel: the details then close', () => {
    const event = key();
    panel({}).escape(event);
    panel({shares: 10}).escape(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

// A problem with what is being typed used to be said only after the button. Once a field was changed it is said
// while typing, where it can be put right at once.
describe('PositionPanelComponent: when a problem is said', () => {
  it('is not before a field was changed or saving was tried, and is from then on', () => {
    const p = panel({shares: 10});
    p.startRecording('bought');
    expect(p.telling).toBeFalse();
    p.touched = true;
    expect(p.telling).toBeTrue();
  });

  it('starts quiet again in every form that is opened', () => {
    const p = panel({shares: 10});
    p.startRecording('bought');
    p.touched = true;
    p.startRecording('sold');
    expect(p.telling).withContext('another form').toBeFalse();
    p.touched = true;
    p.stopRecording();
    p.startEdit();
    expect(p.telling).withContext('the correction').toBeFalse();
  });
});

// Found by a review of the page: the purchase forms did not agree. In a stock's details the cash box arrived ticked
// and the form turned red as soon as three shares were typed with little cash recorded; in "Could add" it arrived
// unticked. One rule now, in every form: ticked while the cash covers what is entered, until the reader sets it.
describe('PositionPanelComponent: the cash box follows the numbers, as in every purchase form', () => {
  const withCash = (cash: number, o: Parameters<typeof panel>[0] = {shares: 10}) => Object.assign(panel(o), {cash});

  it('unticks itself when the purchase typed is more than the cash, and says why instead of refusing', () => {
    const p = withCash(40);
    p.startRecording('bought');
    expect(p.viaCash).withContext('nothing typed yet').toBeTrue();
    Object.assign(p, {boughtShares: 3, boughtPrice: 200});
    p.changed();
    expect(p.viaCash).toBeFalse();
    expect(p.purchaseProblem).withContext('nothing was done wrong').toBeUndefined();
    expect(p.purchaseResult).toContain('It is more than the $40 of cash recorded, so the cash is left as it is.');
  });

  it('ticks itself again when the numbers come back under the cash', () => {
    const p = withCash(1000);
    p.startRecording('bought');
    Object.assign(p, {boughtShares: 30, boughtPrice: 60});
    p.changed();
    expect(p.viaCash).toBeFalse();
    p.boughtShares = 3;
    p.changed();
    expect(p.viaCash).toBeTrue();
    expect(p.purchaseResult).toContain('Cash would go from $1,000 to $820.');
  });

  it('stops following once the reader set the box, and then refuses a purchase paid from more cash than there is', () => {
    const p = withCash(1000);
    p.startRecording('bought');
    p.cashChosen = true;
    p.viaCash = true;
    Object.assign(p, {boughtShares: 30, boughtPrice: 60});
    p.changed();
    expect(p.viaCash).toBeTrue();
    expect(p.purchaseProblem).toContain('more than the $1,000 of cash recorded');
  });

  it('does the same for a stock that is not held yet', () => {
    const p = withCash(40, {});
    p.ngOnChanges();
    Object.assign(p, {shares: 3, price: 200});
    p.changed();
    expect(p.viaCash).toBeFalse();
    expect(p.firstResult).toBe('That is $600. It is more than the $40 of cash recorded, so the cash is left as it is.');
  });

  it('leaves the box of a sale alone: what a sale brings goes to the cash whatever its size', () => {
    const p = withCash(40);
    p.startRecording('sold');
    Object.assign(p, {soldShares: 5, soldPrice: 500});
    p.changed();
    expect(p.viaCash).toBeTrue();
  });
});

// The forms of "Could add" say when a purchase paid from the cash takes the cash under the share kept outside
// stocks. A purchase recorded in a stock's details said nothing.
describe('PositionPanelComponent: a purchase and the share kept outside stocks', () => {
  it('says when the purchase would take the cash under what is kept, and nothing when it does not', () => {
    const p = Object.assign(panel({shares: 10}), {cash: 5000, keep: 4500});
    p.startRecording('bought');
    Object.assign(p, {boughtShares: 10, boughtPrice: 80});
    p.changed();
    expect(p.keptNote).toBe('After this purchase your cash would be $4,200: $300 under the $4,500 you keep outside stocks.');
    p.boughtShares = 5;
    p.changed();
    expect(p.keptNote).toBe('');
  });

  it('says nothing for a sale, or when no share is kept', () => {
    const p = Object.assign(panel({shares: 10}), {cash: 5000});
    p.startRecording('bought');
    Object.assign(p, {boughtShares: 10, boughtPrice: 80});
    expect(p.keptNote).toBe('');
    Object.assign(p, {keep: 4500});
    p.startRecording('sold');
    expect(p.keptNote).toBe('');
  });
});

// Found by a review of the page: the forms in a stock's details did not say what the forms in "Could add" say. No
// "That is $X", and ten times today's price passed without a word.
describe('PositionPanelComponent: a slip in a purchase is pointed out here too', () => {
  it('says the sum first, and questions a price far from today\'s without refusing it', () => {
    const p = panel({shares: 10});
    p.startRecording('bought');
    Object.assign(p, {boughtShares: 3, boughtPrice: 900, boughtDay: TODAY});
    expect(p.purchaseResult).toMatch(/^That is \$2,700\. You would then hold 13 shares /);
    expect(p.slipNote).toBe("The price paid is 900% above today's price of 90.00. Check the numbers before you record it.");
    expect(p.purchaseProblem).toBeUndefined();
    p.boughtPrice = 91;
    expect(p.slipNote).toBe('');
  });

  it('does so for a stock that is not held yet, and never for a sale or a correction', () => {
    const fresh = panel({});
    fresh.ngOnChanges();
    Object.assign(fresh, {shares: 3, price: 9});
    expect(fresh.slipNote).toContain("90% below today's price of 90.00");
    const held = panel({shares: 10});
    held.startRecording('sold');
    expect(held.slipNote).toBe('');
    held.stopRecording();
    held.startEdit();
    Object.assign(held, {price: 9});
    expect(held.slipNote).withContext('a correction may be of a purchase made long ago').toBe('');
  });
});

// Found by the same review: the plan says SELL SOME and what to keep in dollars; how many shares that is was left
// to the reader, and "Sold some" opened empty, while the buy side does the sum.
describe('PositionPanelComponent: "Sold some" for a stock that is over the limit', () => {
  it('arrives filled in with the shares that bring it down to what fits, and says so', () => {
    // 60 shares at 90 are worth 5,400. A bad half-year of 41% may cost 800 at most: 1,951.22 fits, so 3,448.78
    // has to go, which is 38.3198 shares at 90 (rounded up, so that what is left is not a cent over).
    const p = panel({shares: 60});
    p.startRecording('sold');
    expect(p.soldShares).toBe(38.3198);
    expect(p.saleIntro).toBe(
      "Filled in from your limit: selling 38.3198 shares at today's price leaves $1,951 of it, the most that fits. Change it to what you sold.");
  });

  it('opens empty, without that line, for a stock that fits the limit or has none', () => {
    const fits = panel({shares: 10});
    fits.startRecording('sold');
    expect([fits.soldShares, fits.saleIntro]).toEqual([null, '']);
    const noLimit = panel({shares: 60, limit: null});
    noLimit.startRecording('sold');
    expect([noLimit.soldShares, noLimit.saleIntro]).toEqual([null, '']);
  });
});
