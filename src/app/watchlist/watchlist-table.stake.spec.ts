import {ComponentFixture, TestBed} from "@angular/core/testing";
import {HttpClientTestingModule} from "@angular/common/http/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {WatchlistTableComponent} from "./watchlist-table.component";
import {ClaudeViewService} from "./claude-view.service";
import {ReadingService} from "./reading.service";
import {FakeClaudeViews} from "./testing/fake-claude-views";
import {FakeReadings} from "./testing/fake-readings";
import {flatCloses, makeStock, reportedQuarters} from "./testing/fixtures";

// The owner, with a picture of the third column of a stock's details ("Where it fits: No size: it is not marked
// DIP BUY.", "What you own of it: Not in this portfolio." and a button "Enter what you hold"): "remove that - I
// don't need it there". Asked how much of it, they chose: only when it is empty. A part of the reader's stake is in
// the details when it has something to say, and not otherwise.
describe("WatchlistTableComponent: the reader's stake in a stock's details", () => {
  let fixture: ComponentFixture<WatchlistTableComponent>;

  const quarters = reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120});
  /** A growing company 20% below its highest price of the past year: marked DIP BUY. */
  const marked = (symbol: string) => makeStock({symbol, price: 80, high52: 100, quarters, closes: flatCloses(250, 80)});
  /** The same company 1% below it: no mark. */
  const unmarked = (symbol: string) => makeStock({symbol, price: 99, high52: 100, quarters, closes: flatCloses(250, 99)});

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [WatchlistTableComponent, HttpClientTestingModule, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: new FakeClaudeViews()}, {provide: ReadingService, useValue: new FakeReadings()}],
    });
    fixture = TestBed.createComponent(WatchlistTableComponent);
    fixture.componentRef.setInput('shows', 'watchlist');
    fixture.detectChanges();
    // The first of the reader's lists with two stocks loaded: one with the mark, one without.
    const first = page().watchLists[0];
    first.dataSource.data = [marked('ABCD'), unmarked('WXYZ')];
    first.state = 'ready';
    fixture.detectChanges();
  });

  const page = () => fixture.componentInstance;
  const el = (): HTMLElement => fixture.nativeElement;
  const say = (it: Element | null) => (it?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rowOf = (symbol: string) => page().watchLists[0].dataSource.data.find(it => it.quote?.symbol === symbol)!;

  /** Opens a stock's details the way a hand does, by the button at the end of its row, and gives the stake's group. */
  function stakeOf(symbol: string): HTMLElement {
    const details = () => el().querySelector<HTMLElement>(`tr.detail-row[data-detail="${symbol}"] app-signal-detail`);
    if (!details()) {
      el().querySelector<HTMLButtonElement>(`button.toggle[aria-label="Show details for ${symbol}"]`)!.click();
    }
    fixture.detectChanges();
    return details()!.querySelector<HTMLElement>('.your-stake')!;
  }

  const headings = (stake: HTMLElement) => Array.from(stake.querySelectorAll('h4')).map(say);
  const buttons = (stake: HTMLElement) => Array.from(stake.querySelectorAll('button')).map(say);

  it('says nothing about a stock that has no mark and is not held: no heading, no sentence, no button', () => {
    expect(page().isMarked(rowOf('WXYZ'))).withContext('the stock of this test has no mark').toBeFalse();
    const stake = stakeOf('WXYZ');
    expect(stake.children.length).withContext('nothing is handed in').toBe(0);
    expect(say(stake)).toBe('');
    expect(getComputedStyle(stake).display).withContext('and the group takes no room').toBe('none');
    const details = say(el().querySelector('tr.detail-row[data-detail="WXYZ"]'));
    ['Where it fits', 'No size', 'What you own of it', 'Not in this portfolio', 'Enter what you hold'].forEach(gone =>
      expect(details).not.toContain(gone));
  });

  // The owner, later, with a picture of "Where it fits · its size, as a share of each portfolio" under a marked stock:
  // "remove the where it fits from the app - it should not be in the watchlist". The Watchlist is about the stock;
  // what a stock's size would be in a portfolio is not said there, whatever the stock.
  it('says nothing of a size in a portfolio under a marked stock: "Where it fits" is not in the Watchlist', () => {
    expect(page().isMarked(rowOf('ABCD'))).withContext('the stock of this test has the mark').toBeTrue();
    const stake = stakeOf('ABCD');
    expect(stake.querySelector('app-where-it-fits')).toBeNull();
    expect(headings(stake)).toEqual([]);
    expect(stake.children.length).withContext('a marked stock that is not held has no stake to show').toBe(0);
    expect(say(el().querySelector('tr.detail-row[data-detail="ABCD"]'))).not.toContain('Where it fits');
    expect(stake.querySelector('app-position-panel')).toBeNull();
    expect(buttons(stake)).withContext('no form to enter a holding').toEqual([]);
  });

  it('says nothing of a size in a portfolio under a marked stock that is held either: only what is owned of it', () => {
    page().savePosition({symbol: 'ABCD', shares: 2, price: 50});
    const stake = stakeOf('ABCD');
    expect(stake.querySelector('app-where-it-fits')).toBeNull();
    expect(headings(stake)).toEqual(['What you own of it']);
  });

  it('shows a holding with what can be done with it, also for a stock without the mark', () => {
    page().savePosition({symbol: 'WXYZ', shares: 2, price: 50});
    const stake = stakeOf('WXYZ');
    expect(headings(stake)).toEqual(['What you own of it']);
    expect(buttons(stake)).toEqual(['Bought more', 'Sold some', 'Edit', 'Remove']);
    expect(stake.querySelector('app-where-it-fits')).withContext('no size without the mark, and no line saying so').toBeNull();
  });

  it('takes the holding out of the details again when the stock is removed from what is owned', () => {
    page().savePosition({symbol: 'WXYZ', shares: 2, price: 50});
    expect(headings(stakeOf('WXYZ'))).toEqual(['What you own of it']);
    page().removePosition('WXYZ');
    expect(stakeOf('WXYZ').children.length).toBe(0);
  });

  describe('with more than one portfolio', () => {
    beforeEach(() => {
      // "Portfolio" holds WXYZ; then "Savings" is added, which shows it: a portfolio that holds nothing.
      page().savePosition({symbol: 'WXYZ', shares: 2, price: 50});
      page().addPortfolio('Savings');
      fixture.detectChanges();
    });

    const chooser = (stake: HTMLElement) => stake.querySelector<HTMLElement>('.record-in');
    const names = (stake: HTMLElement) => Array.from(chooser(stake)!.querySelectorAll('button.name')).map(say);

    it('offers no choice of portfolio under a stock that none of them holds', () => {
      const stake = stakeOf('ABCD');
      expect(chooser(stake)).toBeNull();
      expect(headings(stake)).toEqual([]);
    });

    it('says in which portfolio a stock is held when the one being shown has none of it, and shows it on a click', () => {
      const stake = stakeOf('WXYZ');
      expect(stake.querySelector('app-position-panel')).withContext('Savings holds none of it').toBeNull();
      expect(say(chooser(stake)!.querySelector('.record-in-label'))).toBe('You hold this in Portfolio.');
      expect(chooser(stake)!.getAttribute('aria-label')).toBe('Portfolio whose holding is shown');
      expect(names(stake)).toEqual(['Portfolio', 'Savings']);
      chooser(stake)!.querySelector<HTMLButtonElement>('button.name')!.click();
      fixture.detectChanges();
      const shown = stakeOf('WXYZ');
      expect(headings(shown)).toEqual(['What you own of it in Portfolio']);
      expect(say(chooser(shown)!.querySelector('.record-in-label'))).toBe('Record in');
      expect(chooser(shown)!.getAttribute('aria-label')).toBe('Portfolio that what you record goes into');
    });
  });
});
