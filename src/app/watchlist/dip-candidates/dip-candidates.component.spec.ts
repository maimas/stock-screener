import {TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {By} from "@angular/platform-browser";
import {MatTooltip} from "@angular/material/tooltip";
import {DipCandidate, DipCandidatesComponent} from "./dip-candidates.component";

/** A stock marked DIP BUY as the box is given it: 20% below its high and marked on its profit, unless told otherwise. */
const candidate = (symbol: string, o: Partial<DipCandidate> = {}): DipCandidate => ({
  symbol, belowHigh: 20, growthText: 'profit +12%', isNew: false, earningsSoon: false, held: false,
  headline: `${symbol}: a growing company.`, ...o,
});

describe('DipCandidatesComponent: the stocks marked DIP BUY, one to a row', () => {
  function shown(inputs: Partial<DipCandidatesComponent> = {}) {
    TestBed.configureTestingModule({imports: [DipCandidatesComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(DipCandidatesComponent);
    Object.assign(fixture.componentInstance, {loaded: true, ...inputs});
    fixture.detectChanges();
    return {fixture, card: fixture.componentInstance, el: fixture.nativeElement as HTMLElement};
  }

  const text = (el?: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const headings = (el: HTMLElement) => Array.from(el.querySelectorAll('thead th')).map(text);
  /** The table as it is read: a row a stock, a cell a column. */
  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('tbody tr')).map(tr => Array.from(tr.children).map(text));
  const rowOf = (el: HTMLElement, symbol: string) =>
    Array.from(el.querySelectorAll('tbody tr')).find(tr => text(tr.querySelector('button')) === symbol) as HTMLElement;

  it('says under plain headings how far each stock dropped and the growth figure it is marked on', () => {
    const {el} = shown({candidates: [
      candidate('AMD', {belowHigh: 37.2, growthText: 'profit +21%'}),
      candidate('ARM', {belowHigh: 63.6, growthText: 'sales +27%'}),
    ]});
    expect(headings(el)).toEqual(['Stock', 'Dropped', 'Growing']);
    expect(rows(el)).toEqual([['AMD', '−37%', 'profit +21%'], ['ARM', '−64%', 'sales +27%']]);
  });

  // A symbol alone says nothing to who does not know it. The name is one pointer movement away, and takes no
  // room in the row: the owner asked for the rows to stay compact.
  it('names a stock when its symbol is pointed at: the company\'s name, then why it is marked', () => {
    const {card, el} = shown({candidates: [candidate('ACME', {name: 'Acme Robotics'}), candidate('ZED'), candidate('QRS', {name: 'QRS'})]});
    expect(card.candidates.map(it => card.tipOf(it))).toEqual([
      'Acme Robotics\nACME: a growing company.', 'ZED: a growing company.', 'QRS: a growing company.',
    ]);
    expect(rows(el).map(row => row[0])).withContext('the row itself shows the symbol only').toEqual(['ACME', 'ZED', 'QRS']);
  });

  // In a laptop window the box is as wide as the window and twenty stocks in one table ran off the first screen.
  it('sets the stocks in two tables side by side where the box is wide: half in each, read down then across', () => {
    const symbols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
    const {fixture, card, el} = shown({candidates: symbols.map(symbol => candidate(symbol))});
    const tables = () => Array.from(el.querySelectorAll('table')).map(table => Array.from(table.querySelectorAll('tbody tr button')).map(text));
    expect(tables()).withContext('one table in a narrow box (the pane beside the lists)').toEqual([symbols]);

    card.wide = true;
    fixture.detectChanges();
    expect(tables()).toEqual([['A', 'B', 'C', 'D', 'E', 'F'], ['G', 'H', 'I', 'J', 'K']]);
    expect(Array.from(el.querySelectorAll('table')).map(table => Array.from(table.querySelectorAll('thead th')).map(text)))
      .withContext('each with its own headings').toEqual([['Stock', 'Dropped', 'Growing'], ['Stock', 'Dropped', 'Growing']]);
    expect(Array.from(el.querySelectorAll('caption')).map(text)).toEqual(['The stocks marked DIP BUY', 'The stocks marked DIP BUY, continued']);
  });

  // The owner asked for less scrolling on the Watchlist: "some smart way of folding left side to the min info".
  it('can be folded to the least of it, and says which way the button goes', () => {
    const {fixture, card, el} = shown({candidates: [candidate('AMD'), candidate('ARM')]});
    const fold = el.querySelector('.head button.fold') as HTMLButtonElement;
    // The button says what folding gives: "Show less" alone did not, and who never tried it never found the
    // layout with every list on one screen.
    expect([text(fold), fold.getAttribute('aria-expanded')]).toEqual(['Show less: more room for the lists', 'true']);
    expect(el.querySelector('mat-card')!.classList.contains('folded')).toBeFalse();

    const asked: boolean[] = [];
    card.foldedChange.subscribe(folded => asked.push(folded));
    fold.click();
    expect(asked).withContext('the page keeps the choice and hands it back').toEqual([true]);

    card.folded = true;
    fixture.detectChanges();
    expect([text(fold), fold.getAttribute('aria-expanded')]).toEqual(['Show more', 'false']);
    expect(el.querySelector('mat-card')!.classList.contains('folded')).toBeTrue();
    fold.click();
    expect(asked).toEqual([true, false]);
  });

  it('keeps everything in the page while folded, so that nothing is worked out again on "Show more"', () => {
    const {el} = shown({folded: true, candidates: [candidate('AMD'), candidate('ARM')]});
    expect(rows(el).map(row => row[0])).toEqual(['AMD', 'ARM']);
    expect(el.querySelectorAll('.legend .mark').length).toBe(3);
  });

  it('is one table while folded, also where the box is wide', () => {
    const symbols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
    const {fixture, card, el} = shown({folded: true, candidates: symbols.map(symbol => candidate(symbol))});
    card.wide = true;
    fixture.detectChanges();
    expect(el.querySelectorAll('table').length).toBe(1);
  });

  it('keeps a short list in one table also where the box is wide', () => {
    const {fixture, card, el} = shown({candidates: [candidate('AMD'), candidate('ARM'), candidate('MU')]});
    card.wide = true;
    fixture.detectChanges();
    expect(el.querySelectorAll('table').length).toBe(1);
  });

  it('opens a stock\'s details from its name, and from anywhere else on its row', () => {
    const {card, el} = shown({candidates: [candidate('AMD'), candidate('ARM')]});
    const opened: string[] = [];
    card.open.subscribe(symbol => opened.push(symbol));
    rowOf(el, 'ARM').querySelector('button')!.click();
    expect(opened).withContext('one click on the name opens it once').toEqual(['ARM']);
    (rowOf(el, 'AMD').querySelector('td') as HTMLElement).click();
    expect(opened).toEqual(['ARM', 'AMD']);
  });

  it('names what the button on a row does, for someone who cannot see the table around it', () => {
    const {el} = shown({candidates: [candidate('AMD')]});
    expect(rowOf(el, 'AMD').querySelector('button')!.getAttribute('aria-label')).toBe('Open details for AMD');
  });

  it('marks a stock that is held and one that became a DIP BUY today, and no other', () => {
    const {el} = shown({candidates: [candidate('AMD'), candidate('MU', {isNew: true}), candidate('NVDA', {held: true})]});
    const marks = (symbol: string) => Array.from(rowOf(el, symbol).querySelectorAll('.held, .new-mark')).map(text);
    expect(marks('AMD')).toEqual([]);
    expect(marks('MU')).toEqual(['new']);
    expect(marks('NVDA')).toEqual(['held']);
  });

  it('adds a column for the next results only when a stock reports within 2 weeks, and says so in words', () => {
    const {el} = shown({candidates: [candidate('AMD'), candidate('MRVL', {belowHigh: 60, growthText: 'profit +10%', earningsSoon: true})]});
    expect(headings(el)).toEqual(['Stock', 'Dropped', 'Growing', 'Next results']);
    expect(rows(el)).toEqual([['AMD', '−20%', 'profit +12%', ''], ['MRVL', '−60%', 'profit +10%', 'within 2 weeks']]);
  });

  it('says in a sentence that nothing is marked, in place of an empty table', () => {
    const {el} = shown({candidates: []});
    expect(el.querySelector('table')).toBeNull();
    expect(text(el.querySelector('.empty'))).toBe(
      'Nothing is marked DIP BUY right now: no growing company in your lists has dropped 15% or more from its highest price of the past year.');
  });

  it('shows that prices are still arriving until the first are in: no table and no counts yet', () => {
    const {el} = shown({loaded: false, candidates: []});
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('.legend')).toBeNull();
    expect(el.querySelector('.empty')).withContext('not known yet').toBeNull();
  });

  it('explains the three marks, each as it looks in the lists, with how many stocks carry it', () => {
    const {el} = shown({candidates: [candidate('AMD')], marks: {dipBuy: 18, watch: 2, pass: 4, none: 6}});
    const legend = Array.from(el.querySelectorAll('.legend .mark')).map(mark =>
      [text(mark.querySelector('.verdict-pill')), text(mark.querySelector('.mark-count')), text(mark.querySelector('dd'))]);
    expect(legend).toEqual([
      ['DIP BUY', '18', 'The price dropped 15% or more from its highest of the past year while the business keeps growing.'],
      ['WATCH', '2', 'Growing, but no such drop yet.'],
      ['PASS', '4', 'Not growing enough.'],
    ]);
    expect(text(el.querySelector('.unmarked'))).toBe('6 more have no mark: funds, and companies with too little history to judge.');
  });

  // Folded, the box keeps the three marks with their counts and leaves their sentences out. What a mark means is
  // then one pointer's rest (or one Tab) away, on the mark itself.
  describe('what a mark means while the box is folded', () => {
    const tips = (folded: boolean) => {
      const {fixture} = shown({folded, candidates: [candidate('AMD')], marks: {dipBuy: 18, watch: 2, pass: 4, none: 6}});
      return fixture.debugElement.queryAll(By.css('.legend dt')).map(it => it.injector.get(MatTooltip).message);
    };

    it('is said on the mark itself, where the pointer rests or the Tab key lands', () => {
      expect(tips(true)).toEqual([
        'The price dropped 15% or more from its highest of the past year while the business keeps growing.',
        'Growing, but no such drop yet.',
        'Not growing enough.',
      ]);
    });

    it('is not said twice while the box is open: the sentence stands beside the mark', () => {
      expect(tips(false)).toEqual(['', '', '']);
    });
  });

  it('counts one stock without a mark as one, and says nothing when every stock has a mark', () => {
    expect(text(shown({marks: {dipBuy: 1, watch: 0, pass: 0, none: 1}}).el.querySelector('.unmarked')))
      .toBe('1 more has no mark: funds, and companies with too little history to judge.');
    TestBed.resetTestingModule();
    expect(shown({marks: {dipBuy: 1, watch: 0, pass: 0, none: 0}}).el.querySelector('.unmarked')).toBeNull();
  });

  it('says where the market stands, and what a fearful market has meant for stocks that dropped', () => {
    const {el} = shown({
      indexLine: 'The market (S&P 500) is 8.1% below its highest of the past year',
      fear: {vix: 26.4, high: true, label: 'Market fear high (VIX 26.4)', text: 'What the VIX is.'},
    });
    const lines = Array.from(el.querySelectorAll('.market')).map(text);
    expect(lines[0]).toBe('The market (S&P 500) is 8.1% below its highest of the past year.');
    expect(lines[1]).toMatch(/^Market fear high \(VIX 26\.4\): in the past a better time to buy stocks that dropped .+, but fear can get worse first\.$/);
  });

  it('only names the level of fear while the market is calm: there is nothing to act on', () => {
    const {el} = shown({fear: {vix: 14.2, high: false, label: 'Market fear low (VIX 14.2)', text: 'What the VIX is.'}});
    expect(Array.from(el.querySelectorAll('.market')).map(text)).toEqual(['Market fear low (VIX 14.2)']);
  });

  it('says how much the candidates are one bet, and how stocks like them did in tests, once there are some', () => {
    const oneBet = '11 of these 18 stocks are in Technology.';
    const withSome = shown({candidates: [candidate('AMD')], oneBet});
    expect(text(withSome.el.querySelector('.one-bet'))).toBe(oneBet);
    expect(text(withSome.el.querySelector('.tested'))).toMatch(/^In tests on \d+ stocks/);
    // How the table is used is said under the table, not as the opening of that paragraph about tests.
    expect(text(withSome.el.querySelector('.stocks .how'))).toBe('Click a stock for its details.');
    TestBed.resetTestingModule();
    const withNone = shown({candidates: [], oneBet});
    expect(withNone.el.querySelector('.one-bet')).toBeNull();
    expect(withNone.el.querySelector('.tested')).toBeNull();
    expect(withNone.el.querySelector('.how')).toBeNull();
  });

  it('gives the live record with a way to save the daily log as a file', () => {
    const {card, el} = shown({trackText: 'Since Nov 21, 2026 this page has flagged 19 DIP BUYs.', recorderText: 'Also recorded automatically.'});
    let saved = 0;
    card.exportLog.subscribe(() => saved++);
    expect(text(el.querySelector('.log'))).toContain('Since Nov 21, 2026 this page has flagged 19 DIP BUYs. Also recorded automatically.');
    (el.querySelector('.log button') as HTMLButtonElement).click();
    expect(saved).toBe(1);
  });

  it('points out, as a status, a background job that needs a look', () => {
    const {el} = shown({evidenceText: 'The tested numbers were not updated on Nov 22.'});
    expect(text(el.querySelector('[role="status"]'))).toBe('The tested numbers were not updated on Nov 22.');
  });
});

// Found by a review of the page: on a day no price arrived the bar, the plan and every list said so, and this box
// kept its grey loading bars for good.
describe('DipCandidatesComponent: a day no price arrives', () => {
  function shown(instead: string) {
    TestBed.configureTestingModule({imports: [DipCandidatesComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(DipCandidatesComponent);
    Object.assign(fixture.componentInstance, {loaded: false, instead});
    fixture.detectChanges();
    return {fixture, el: fixture.nativeElement as HTMLElement};
  }

  it('says so in place of the loading bars, and offers to try again', () => {
    const {fixture, el} = shown('Today\'s prices could not be loaded: the data source did not answer.');
    expect(el.querySelector('.loading')).toBeNull();
    expect(el.querySelector('.failed p')!.textContent).toBe('Today\'s prices could not be loaded: the data source did not answer.');
    let asked = 0;
    fixture.componentInstance.retry.subscribe(() => asked++);
    el.querySelector<HTMLButtonElement>('.failed button')!.click();
    expect(asked).toBe(1);
  });

  it('shows the loading bars while the prices are still on their way', () => {
    const {el} = shown('');
    expect(el.querySelector('.failed')).toBeNull();
    expect(el.querySelector('.loading')!.getAttribute('aria-busy')).toBe('true');
  });
});

// The owner, of the sentence that the candidates are nearer to one big bet: "I can't leverage it since I don't know
// what stocks move together - maybe we can add something to show the tied group".
describe('DipCandidatesComponent: which of the candidates move together', () => {
  const candidate = (symbol: string): DipCandidate =>
    ({symbol, belowHigh: 30, growthText: 'sales +20%', isNew: false, earningsSoon: false, held: false, headline: ''} as DipCandidate);
  const TIED = {
    groups: [
      {letter: 'A', index: 0, symbols: ['ACME', 'BOLT'], level: 0.71, sector: 'all Technology'},
      {letter: 'B', index: 1, symbols: ['YARN', 'ZED'], level: 0.6, sector: ''},
    ],
    alone: ['SOLO'], unknown: [],
  };

  function shown(inputs: object = {}) {
    TestBed.configureTestingModule({imports: [DipCandidatesComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(DipCandidatesComponent);
    Object.assign(fixture.componentInstance, {
      loaded: true, candidates: ['ACME', 'BOLT', 'SOLO', 'YARN', 'ZED'].map(candidate), oneBet: 'Their prices move closely together.', tied: TIED, ...inputs,
    });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el?: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('gives each row the letter of its group, and a dash to a stock that moved on its own', () => {
    const el = shown();
    expect(Array.from(el.querySelectorAll('thead th')).map(text)).toEqual(['Stock', 'Dropped', 'Growing', 'Group']);
    expect(el.querySelector('th.group-head button')).withContext('a heading the rows can be ordered by').not.toBeNull();
    expect(Array.from(el.querySelectorAll('tbody td.group-cell')).map(text)).toEqual(['A', 'A', '—', 'B', 'B']);
    expect(el.querySelector('tbody td.group-cell .tied-tag')!.getAttribute('aria-label')).toBe('Group A');
    expect(el.querySelector('tbody td.group-cell .tied-tag i')!.className).withContext('the same colour for the same letter').toBe('g0');
  });

  it('lists the groups under the sentence about one big bet: the letter, its stocks, how many and their sector', () => {
    const el = shown();
    expect(text(el.querySelector('.tied h3'))).toBe('Which of them move together');
    const parts = (line: Element) => ['.tied-tag', '.members', '.brief'].map(part => text(line.querySelector(part)));
    expect(Array.from(el.querySelectorAll('.tied li')).map(parts)).toEqual([
      ['A', 'ACME, BOLT', '2 stocks, all Technology'], ['B', 'YARN, ZED', '2 stocks'], ['—', 'SOLO', 'moved with none of the others']]);
    expect(text(el.querySelector('.tied .note'))).toContain('not a tested reason to pick');
  });

  it('puts the stocks of a group side by side on a click on "Group", and back in A to Z on the next', () => {
    TestBed.configureTestingModule({imports: [DipCandidatesComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(DipCandidatesComponent);
    Object.assign(fixture.componentInstance, {
      loaded: true, candidates: ['ACME', 'SOLO', 'YARN', 'ZED', 'BOLT'].map(candidate), oneBet: 'x', tied: TIED,
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const order = () => Array.from(el.querySelectorAll('tbody th button.symbol')).map(text);
    expect(order()).toEqual(['ACME', 'SOLO', 'YARN', 'ZED', 'BOLT']);
    el.querySelector<HTMLButtonElement>('th.group-head button')!.click();
    fixture.detectChanges();
    expect(order()).toEqual(['ACME', 'BOLT', 'YARN', 'ZED', 'SOLO']);
    expect(el.querySelector('th.group-head')!.getAttribute('aria-sort')).toBe('ascending');
    el.querySelector<HTMLButtonElement>('thead th button')!.click();
    fixture.detectChanges();
    expect(order()).withContext('a click on "Stock" gives A to Z again').toEqual(['ACME', 'BOLT', 'SOLO', 'YARN', 'ZED']);
  });

  // The owner: "all tables must have sortable columns".
  it('orders the rows by any column on a click on its heading, the biggest first for a number, and turns round on the next', () => {
    TestBed.configureTestingModule({imports: [DipCandidatesComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(DipCandidatesComponent);
    const rows = [
      {...candidate('ACME'), belowHigh: 20, growthText: 'sales +45%'}, {...candidate('BOLT'), belowHigh: 60, growthText: 'profit +10%'},
      {...candidate('ZED'), belowHigh: 35, growthText: 'sales +27%', earningsSoon: true},
    ];
    Object.assign(fixture.componentInstance, {loaded: true, candidates: rows, tied: TIED});
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const order = () => Array.from(el.querySelectorAll('tbody th button.symbol')).map(text);
    const head = (name: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('thead th button')).find(it => text(it) === name)!;
    expect(Array.from(el.querySelectorAll('thead th button')).map(text)).toEqual(['Stock', 'Dropped', 'Growing', 'Group', 'Next results']);
    expect(el.querySelector('.stocks .order-note')).withContext('not in the table\'s block, which is as wide as its widest line').toBeNull();
    expect(text(el.querySelector('.about .order-note'))).withContext('the order is the reader\'s own view').toBe(
      'A click on a heading orders the rows by its column, and a second click turns the order round. That is your own view of them: the page ranks nothing.');
    expect(order()).withContext('as given, A to Z, until a heading is clicked').toEqual(['ACME', 'BOLT', 'ZED']);
    head('Dropped').click();
    fixture.detectChanges();
    expect(order()).withContext('the furthest drop first').toEqual(['BOLT', 'ZED', 'ACME']);
    expect(head('Dropped').closest('th')!.getAttribute('aria-sort')).toBe('descending');
    head('Dropped').click();
    fixture.detectChanges();
    expect(order()).toEqual(['ACME', 'ZED', 'BOLT']);
    head('Growing').click();
    fixture.detectChanges();
    expect(order()).toEqual(['ACME', 'ZED', 'BOLT']);
    head('Next results').click();
    fixture.detectChanges();
    expect(order()[0]).withContext('the one that reports within 2 weeks first').toBe('ZED');
  });

  it('says nothing of groups when there are none, and keeps the column out of the folded box', () => {
    const none = shown({tied: {groups: [], alone: ['ACME'], unknown: []}});
    expect(none.querySelector('.tied')).toBeNull();
    expect(none.querySelector('td.group-cell')).toBeNull();
  });

  it('leaves the column out while the box is folded to the least', () => {
    const folded = shown({folded: true});
    expect(folded.querySelector('td.group-cell')).toBeNull();
  });
});

// The owner: "the fact that watchlist is mapping to a random portfolio is odd". The tag says where a stock is held.
describe('DipCandidatesComponent: where a candidate is held', () => {
  it('names the portfolios on the tag and in the stock\'s mouse-over', () => {
    TestBed.configureTestingModule({imports: [DipCandidatesComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(DipCandidatesComponent);
    const held = {symbol: 'ACME', name: 'Acme Tools Inc', belowHigh: 30, growthText: 'sales +20%', isNew: false, earningsSoon: false,
      held: true, heldIn: 'You hold this in Savings and Brokerage.', headline: 'A growing company.'} as DipCandidate;
    Object.assign(fixture.componentInstance, {loaded: true, candidates: [held]});
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tbody .held')!.getAttribute('aria-label')).toBe('You hold this in Savings and Brokerage.');
    expect(fixture.componentInstance.tipOf(held)).toBe('Acme Tools Inc\nA growing company.\nYou hold this in Savings and Brokerage.');
    expect(fixture.componentInstance.tipOf({...held, heldIn: undefined})).toBe('Acme Tools Inc\nA growing company.');
  });
});
