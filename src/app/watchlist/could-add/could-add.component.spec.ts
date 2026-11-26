import {ComponentFixture, fakeAsync, flush, TestBed, tick as tick$} from "@angular/core/testing";
import {By} from "@angular/platform-browser";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {MatTooltip} from "@angular/material/tooltip";
import {CouldAddComponent} from "./could-add.component";
import {
  Addition, COLUMN_HELP, couldAddHeadline, couldAddLead, FIT_NOTE, NO_SIZE_NOTE, nothingToAdd, ORDER_NOTE, readingOf, Recommendation, RowReading, sellNote, SIZE_RULES, SizingInput, tickHint
} from "../recommendations";
import {MORE_STORAGE_KEY} from "../more/more.service";
import {TestedCases} from "../sizing";
import {FACTS_NOTE, StockFacts} from "../stock-facts";
import {CASES_LIMIT} from "../evidence";
import {Trade} from "../position-panel/position-panel.component";
import {PurchaseFormComponent} from "../purchase-form/purchase-form.component";
import {PurchasesFormComponent} from "../purchases-form/purchases-form.component";
import {FIGURES_2026_11_21 as F} from "../testing/figures";

const VOLATILE: TestedCases = {group: 'volatile', lossPercent: 41, typicalPercent: 2.4, gainPercent: 85};
const MIDDLE: TestedCases = {group: 'middle', lossPercent: 31, typicalPercent: -0.1, gainPercent: 56};

/** Two made-up stocks sized for a made-up portfolio worth $10,000 that holds three stocks. */
const ACME: Recommendation = {
  symbol: 'ACME', cases: VOLATILE,
  size: {sharePercent: 20.13, dollars: 2012.99, loss: 825.32, gain: 1711.04, capped: false},
  fit: {holdings: 3, sector: 'Technology', sameSector: 2, tied: 0.61, recent: 0.7, close: true},
};
const ZED: Recommendation = {
  symbol: 'ZED', cases: MIDDLE,
  size: {sharePercent: 12.2, dollars: 1220, loss: 378.2, gain: 683.2, capped: true},
  fit: {holdings: 3, sector: 'Energy', sameSector: 0, tied: 0.31, recent: 0.2, close: false},
};

/** The made-up portfolio those sizes are for: three stocks in between, with a limit of 20%. */
const BROKERAGE: SizingInput = {
  portfolioValue: 10_000, limitPercent: 20,
  holdings: ['AAA', 'BBB', 'CCC'].map(symbol => ({symbol, value: 3000, cases: MIDDLE})),
};
/** The first row worked out in words, as the page hands it in. */
const READING: RowReading = readingOf(ACME, BROKERAGE, F)!;

/** CCC is one of the three held, marked DIP BUY and $400 under its share: what could be added to it. */
const MORE_CCC: Addition = {symbol: 'CCC', sharePercent: 4, dollars: 400, loss: 124, gain: 224, capped: false};

type Inputs = Partial<Pick<CouldAddComponent,
  'recommendations' | 'portfolio' | 'marked' | 'fresh' | 'loading' | 'reading' | 'additions' | 'sizing' | 'cash' | 'names' | 'portfolioId'
  | 'unpriced' | 'facts' | 'prices' | 'positions' | 'today' | 'keep'>>;

/** The box for Brokerage: worth $10,000, of which $9,000 is in its three stocks and $1,000 is cash. */
function create(inputs: Inputs = {}): ComponentFixture<CouldAddComponent> {
  const fixture = TestBed.createComponent(CouldAddComponent);
  Object.entries({recommendations: [ACME, ZED], portfolio: 'Brokerage', marked: 2, reading: READING, sizing: BROKERAGE, cash: 1000, ...inputs})
    .forEach(([name, value]) => fixture.componentRef.setInput(name, value));
  fixture.detectChanges();
  return fixture;
}

const say = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const page = (fixture: ComponentFixture<CouldAddComponent>) => fixture.nativeElement as HTMLElement;
/** The table's headings and rows without the column of tick boxes, which holds no words. */
const headings = (fixture: ComponentFixture<CouldAddComponent>) => Array.from(page(fixture).querySelectorAll('thead th:not(.tick)')).map(say);
const rows = (fixture: ComponentFixture<CouldAddComponent>) =>
  Array.from(page(fixture).querySelectorAll('tbody tr:not(.group):not(.form-row)'))
    .map(row => Array.from(row.querySelectorAll('th, td:not(.tick):not(.act)')).map(say));
const boxes = (fixture: ComponentFixture<CouldAddComponent>) =>
  Array.from(page(fixture).querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]'));
/** Ticks, or unticks, the box of the row with that stock, the way a click does. */
function tick(fixture: ComponentFixture<CouldAddComponent>, symbol: string): void {
  boxes(fixture).find(box => box.getAttribute('aria-label')!.includes(` ${symbol} `))!.click();
  fixture.detectChanges();
}
/** The lines under the table that say what the ticked purchase would do. */
const splitSays = (fixture: ComponentFixture<CouldAddComponent>) => Array.from(page(fixture).querySelectorAll('.split p:not(.unsaved)')).map(say);
const notes = (fixture: ComponentFixture<CouldAddComponent>) => Array.from(page(fixture).querySelectorAll('p.note')).map(say);
/** The answer to a tick, beside the instruction: figures with their names, as [name, figure] pairs. */
const facts = (fixture: ComponentFixture<CouldAddComponent>) =>
  Array.from(page(fixture).querySelectorAll('.tick-answer dl.facts > div')).map(fact => [say(fact.querySelector('dt')), say(fact.querySelector('dd'))]);
/** The one control of the box's explanations, and what it opens. */
const about = (fixture: ComponentFixture<CouldAddComponent>) => ({
  button: page(fixture).querySelector<HTMLButtonElement>('.about button.about-toggle')!,
  body: page(fixture).querySelector<HTMLElement>('.about .about-body')!,
});
/** The example under the table, as [label, sentence] pairs. */
const example = (fixture: ComponentFixture<CouldAddComponent>) =>
  Array.from(page(fixture).querySelectorAll('.reading dl > div')).map(line => [say(line.querySelector('dt')), say(line.querySelector('dd'))]);

describe('CouldAddComponent ("Could add": the stocks marked DIP BUY, each sized for the portfolio being shown)', () => {
  beforeEach(() => {
    localStorage.removeItem(MORE_STORAGE_KEY);
    TestBed.configureTestingModule({imports: [CouldAddComponent, NoopAnimationsModule]});
  });
  afterEach(() => localStorage.removeItem(MORE_STORAGE_KEY));

  it('has its title, and says beside it which stocks these are and that the page ranks none of them', () => {
    const fixture = create();
    expect(say(page(fixture).querySelector('h2'))).toBe('Could add');
    expect(say(page(fixture).querySelector('.head .headline'))).toBe(couldAddHeadline(2, 'Brokerage'));
    expect(say(page(fixture).querySelector('.head .headline'))).toBe('2 stocks marked DIP BUY, not in Brokerage yet · not ranked');
    expect(say(page(fixture).querySelector('p.lead'))).withContext('the paragraph itself is with the explanations').toBe(couldAddLead(2, 'Brokerage'));
  });

  // The owner, of this box when it began with a paragraph, had three lines about a tick and ten notes around the
  // table: "too much text and not much signal". Above the table one sentence is left, the instruction.
  it('keeps one sentence in sight above the table: what to do', () => {
    const fixture = create();
    const sentences = Array.from(page(fixture).querySelectorAll('.top p')).map(say);
    expect(sentences).toEqual([tickHint(1000)]);
    expect(sentences[0]).toBe('Tick stocks to split your cash ($1,000) between them.');
  });

  it('keeps every explanation of the box behind one control under the table, closed until it is asked for', () => {
    const fixture = create();
    const {button, body} = about(fixture);
    expect(say(button)).toBe('How to read this table');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBeTrue();
    expect(page(fixture).querySelectorAll('button.about-toggle').length).withContext('one control, not one a note').toBe(1);
    expect(page(fixture).querySelector('app-more')).withContext('no "more" inside it: opened, the notes are whole').toBeNull();
    // Nothing is taken away: the lead, the example, the notes and whose an order of the rows is are all behind it.
    expect(Array.from(body.children).map(part => part.className.split(' ')[0])).toEqual(['lead', 'sell', 'reading', 'note', 'note', 'order-note']);
    expect(say(body.querySelector('.order-note'))).toBe(ORDER_NOTE);
    button.click();
    fixture.detectChanges();
    expect([button.getAttribute('aria-expanded'), body.hidden]).toEqual(['true', false]);
  });

  it('shows no sentence outside that control but the instruction and one quiet line about the cases, with nothing ticked', () => {
    const fixture = create();
    const inSight = Array.from(page(fixture).querySelectorAll('p')).filter(p => !p.closest('[hidden]')).map(say);
    expect(inSight).toEqual([tickHint(1000), CASES_LIMIT]);
  });

  // The owner had it put back in sight: the three cases are from tests in a rising market. One quiet line under the
  // table whose columns it is about, and none while the table has no such columns.
  it('says under the table, in one quiet line, when the three cases were tested', () => {
    const fixture = create();
    const line = page(fixture).querySelector('.body p.caveat')!;
    expect(say(line)).toBe(CASES_LIMIT);
    expect(say(line)).toMatch(/^Bad, typical and good case: tested in \d{4}–\d{4}, when the market was rising\. In a falling market they can be worse\.$/);
    expect(line.previousElementSibling?.classList.contains('table-scroll')).withContext('right under the table').toBeTrue();
    const noSizes = create({recommendations: [{symbol: 'ACME', cases: VOLATILE}], reading: undefined, sizing: undefined, cash: undefined});
    expect(page(noSizes).querySelector('p.caveat')).withContext('no cases in the table: nothing to say of them').toBeNull();
  });

  it('gives each stock a row: its size as a share first and dollars second, a bad and a good half-year at that size, and its fit', () => {
    const fixture = create();
    expect(headings(fixture)).toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Sector (you own)', 'Moves with yours']);
    expect(rows(fixture)).toEqual([
      ['ACME', '20.1% $2,013', '−$825', '+$48', '+$1,711', '', 'Technology (2)', 'closely'],
      ['ZED', '12.2% $1,220 at your limit', '−$378', '−$1', '+$683', '', 'Energy (none)', 'not closely'],
    ]);
  });

  // The owner of the page asked to see these four in the box. What the mark rests on stands beside the stock, as in
  // "Dip candidates"; the context no test could use comes after the plan's numbers, set quieter.
  describe('what the page knows of the stock itself', () => {
    const FACTS: Record<string, StockFacts> = {
      ACME: {
        dropped: '−42%', droppedTip: '41.6% below its highest price of the past year.',
        growing: 'profit +21%', growingTip: 'Expected profit per share +21.0%, sales +9.0% on a year ago.',
        target: '+56%', targetTip: "Analysts' middle price target is 156.00 (+56.0% from here; cannot be tested: no history of targets).",
        holders: '38%', holdersTip: '38.0% of its owners are in profit; the average owner paid 120.00 (+20.0% from here).',
      },
      // A stock with no price target on record and too little history for its owners' prices.
      ZED: {dropped: '−17%', droppedTip: '17.2% below its highest price of the past year.', growing: 'sales +27%', growingTip: '',
        target: '', targetTip: '', holders: '', holdersTip: ''},
    };

    it('adds four columns: how far it dropped and how it grows beside the stock, the two pieces of context after the numbers', () => {
      const fixture = create({facts: FACTS});
      expect(headings(fixture)).toEqual([
        'Stock', 'Dropped', 'Growing', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Analyst target', 'Holders in profit', 'Sector (you own)', 'Moves with yours',
      ]);
      expect(rows(fixture)).toEqual([
        ['ACME', '−42%', 'profit +21%', '20.1% $2,013', '−$825', '+$48', '+$1,711', '', '+56%', '38%', 'Technology (2)', 'closely'],
        ['ZED', '−17%', 'sales +27%', '12.2% $1,220 at your limit', '−$378', '−$1', '+$683', '', '—', '—', 'Energy (none)', 'not closely'],
      ]);
    });

    it('keeps the amount of a ticked stock with the plan\'s numbers, before the context', () => {
      const fixture = create({facts: FACTS});
      tick(fixture, 'ACME');
      expect(headings(fixture).slice(3, 9)).toEqual(['Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Analyst target']);
    });

    it('says them with the keyboard on the stock too, each under the name of its column, in the order of the columns', () => {
      const fixture = create({facts: FACTS, names: {ACME: 'Acme Tools Inc'}});
      fixture.componentInstance.onStockFocus('ACME', {target: {matches: () => true}} as unknown as FocusEvent);
      fixture.detectChanges();
      const lines = fixture.debugElement.query(By.css('tbody button.symbol')).injector.get(MatTooltip).message.split('\n');
      expect(lines.map(line => line.split(':')[0])).toEqual(
        ['Acme Tools Inc', 'Dropped', 'Growing', 'Analyst target', 'Holders in profit', 'Moves with yours']);
      expect(lines[1]).toBe('Dropped: 41.6% below its highest price of the past year.');
    });

    it('says the sentence behind each cell where the pointer rests', () => {
      const fixture = create({facts: FACTS});
      const first = fixture.debugElement.queryAll(By.css('tbody tr'))[0];
      const tips = first.queryAll(By.directive(MatTooltip)).map(it => it.injector.get(MatTooltip).message);
      expect(tips).toContain(FACTS['ACME'].droppedTip);
      expect(tips).toContain(FACTS['ACME'].growingTip);
      expect(tips).toContain(FACTS['ACME'].targetTip);
      expect(tips).toContain(FACTS['ACME'].holdersTip);
    });

    // Colour is for the mark and what it rests on. The two pieces of context keep their sign and get no green or red.
    it('marks the two pieces of context as context, in the heading and in every row', () => {
      const fixture = create({facts: FACTS});
      expect(Array.from(page(fixture).querySelectorAll('thead th.context')).map(say)).toEqual(['Analyst target', 'Holders in profit']);
      expect(page(fixture).querySelectorAll('tbody td.context').length).toBe(4);
    });

    // A row holds four kinds of fact: what the mark rests on, what the plan gives, context, and what you own that is
    // like the stock. Twelve evenly spaced columns drew no line between them, and "Analyst target" read as a
    // neighbour of "Good case". Each kind now starts at a hairline.
    it('sets the four kinds of fact in a row apart: the plan\'s numbers, the context and the fit each start at a line', () => {
      const fixture = create({facts: FACTS});
      expect(Array.from(page(fixture).querySelectorAll('thead th.starts')).map(say)).toEqual(['Size', 'Analyst target', 'Sector (you own)']);
      const first = page(fixture).querySelector('tbody tr')!;
      expect(Array.from(first.querySelectorAll('td.starts')).map(say)).toEqual(['20.1% $2,013', '+56%', 'Technology (2)']);
    });

    // Found by a review of the page: "Size", "Bad case" and "Good case" said nothing on their headings, where the
    // same columns of "What you own" do.
    it('says what each column is when its heading is pointed at or reached with the Tab key', () => {
      const fixture = create({facts: FACTS});
      const helped = fixture.debugElement.queryAll(By.css('thead th .has-help'));
      expect(helped.map(it => say(it.nativeElement))).toEqual(
        ['Dropped', 'Growing', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Analyst target', 'Holders in profit', 'Sector (you own)', 'Moves with yours']);
      expect(helped.slice(9).map(it => it.injector.get(MatTooltip).message)).withContext('what the two columns about fit are').toEqual(
        [COLUMN_HELP.sector, COLUMN_HELP.moves]);
      expect(helped.every(it => it.nativeElement.tagName === 'BUTTON')).withContext('each heading is a button that orders the rows').toBeTrue();
      expect(helped.slice(2, 7).map(it => it.injector.get(MatTooltip).message)).toEqual(
        [COLUMN_HELP.size, COLUMN_HELP.bad, COLUMN_HELP.typical, COLUMN_HELP.good, COLUMN_HELP.cash]);
      expect(helped.every(it => it.nativeElement.tabIndex === 0)).withContext('each can take the keyboard').toBeTrue();
      expect(helped.map(it => it.injector.get(MatTooltip).message).every(text => text.length > 40)).toBeTrue();
    });

    it('says under the table which two the mark rests on and that the other two are no reason to pick', () => {
      expect(notes(create({facts: FACTS}))).toEqual([SIZE_RULES, FACTS_NOTE, FIT_NOTE]);
    });

    it('shows them for a stock that is owned too, and lets the heading over those rows span every column', () => {
      const fixture = create({facts: {...FACTS, CCC: {...FACTS['ZED'], dropped: '−30%'}}, additions: [MORE_CCC]});
      expect(rows(fixture)[2]).toEqual(['CCC held', '−30%', 'sales +27%', 'add 4.0% $400', '−$124', '$0', '+$224', '', '—', '—', 'You own $3,000 of it today.']);
      expect(page(fixture).querySelector('tr.group th')!.getAttribute('colspan')).toBe('13');
    });

    it('has none of the four columns until the page knows the stocks', () => {
      expect(headings(create({facts: {}}))).toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Sector (you own)', 'Moves with yours']);
    });
  });

  // A bad or a good case is worked out from tests, not counted: cents would claim a precision it does not have, and
  // "−$41.03" under "−$825" made one column of two kinds of number. The same holds in "What you own".
  it('says a bad, a typical and a good case in whole dollars, also under $100', () => {
    const small: Recommendation = {...ACME, size: {sharePercent: 1, dollars: 100.07, loss: 41.03, gain: 85.06, capped: false}};
    const fixture = create({recommendations: [small], additions: [{...MORE_CCC, dollars: 60, loss: 18.6, gain: 33.6}]});
    // The typical one of the volatile stocks ended at +2.4%, of the ones in between at −0.1%: $2 and nothing.
    expect(rows(fixture).map(row => row.slice(2, 5))).toEqual([['−$41', '+$2', '+$85'], ['−$19', '$0', '+$34']]);
  });

  // Found by a review of the page: "−$825 · +$1,711" read as an upside twice the downside, with the typical result
  // one click away. The owner had it put between the two.
  it('gives the typical result a column of its own between the two cases, with what it is at the pointer', () => {
    const fixture = create();
    expect(headings(fixture).slice(1, 5)).toEqual(['Size', 'Bad case', 'Typical', 'Good case']);
    const cell = fixture.debugElement.query(By.css('tbody tr td.typical'));
    expect(say(cell.nativeElement)).toBe('+$48');
    expect(cell.injector.get(MatTooltip).message).toBe(
      'In tests, the typical stock like this ended at +2.4% after 6 months: half did better, half worse. At this size that would be the amount shown.');
  });

  // The page is to be compact: a row is one line. "Fit" was a sentence a row, and before that two. Now it is two
  // short cells, so that the sectors can be read down the table; the two figures behind "closely" show where the
  // pointer rests on that cell, also in a row that does not move closely.
  it('keeps a row one line tall: fit is two short cells, and its two figures show where the pointer rests', () => {
    const fixture = create();
    const all = fixture.debugElement.queryAll(By.css('tbody td.fit'));
    expect(all.map(cell => cell.nativeElement.children.length)).withContext('words only, nothing set under them').toEqual([0, 0, 0, 0]);
    const cells = fixture.debugElement.queryAll(By.css('tbody td.fit.moves'));
    expect(cells.map(cell => cell.injector.get(MatTooltip).message)).toEqual([
      'How closely its price has moved with your stocks: 0.61 over the past year, 0.70 over the last month (0 = not at all, 1 = exactly together).',
      'How closely its price has moved with your stocks: 0.31 over the past year, 0.20 over the last month (0 = not at all, 1 = exactly together).',
    ]);
  });

  // The owner of the page could not tell what "Size", "Bad case" and "Good case" were from one paragraph of
  // definitions, and the cases were explained only when the pointer rested on them. The first row is worked out in
  // words instead, each line under the name of the column it explains, readable without a pointer.
  it('works its first row out in words under the table: a line for each of the three numbers, named as its column is', () => {
    const fixture = create();
    expect(say(page(fixture).querySelector('.reading h3'))).toBe('For example, the first row: ACME');
    expect(example(fixture).map(line => line[0])).withContext('the labels are the column headings').toEqual(headings(fixture).slice(1, 5));
    expect(example(fixture)).toEqual([
      ['Size', "$2,013 is 20.1% of what this portfolio is worth today ($10,000). With ACME it would hold 4 stocks; " +
        "this is ACME's share if a bad half-year were to cost the same on each of them."],
      ['Bad case', 'In tests, 1 in 10 stocks marked DIP BUY that swing as much as ACME lost 41% or more after 6 months. ' +
        'On $2,013 that is −$825, within the $2,000 you accept to lose on one stock.'],
      ['Typical', 'In the same tests the typical one ended at +2.4%: +$48. Half did better, half worse.'],
      ['Good case', 'In the same tests, 1 in 10 gained 85% or more: +$1,711.'],
    ]);
  });

  it('puts the example between the table and the sentences that hold for every row', () => {
    const fixture = create();
    const order = Array.from(page(fixture).querySelectorAll('.table-scroll, .reading, p.note')).map(el => el.className);
    expect(order).toEqual(['table-scroll', 'reading', 'note', 'note']);
  });

  // A box as wide as the window has room for both: the table, and beside it what is said about the table.
  it('keeps the table and what is said about it in one block, so that a wide box can set them side by side', () => {
    const body = page(create()).querySelector('.body')!;
    expect(Array.from(body.children).map(part => part.className)).toEqual(['table-scroll', 'caveat', 'about']);
    expect(body.querySelector('.about .reading')).withContext('the example').not.toBeNull();
    expect(body.querySelectorAll('.about p.note').length).withContext('the sentences that hold for every row').toBe(2);
    expect(page(create()).querySelector('.about p.lead')).withContext('the lead is the first of the explanations').not.toBeNull();
  });

  it('shows no example when it is given none', () => {
    const fixture = create({reading: undefined});
    expect(page(fixture).querySelector('.reading')).toBeNull();
    expect(notes(fixture)).toEqual([SIZE_RULES, FIT_NOTE]);
  });

  it('keeps the order it is given: from A to Z, which is no order of merit', () => {
    expect(rows(create({recommendations: [ZED, ACME]})).map(row => row[0])).toEqual(['ZED', 'ACME']);
  });

  it('marks a stock that got its mark today', () => {
    const fixture = create({fresh: new Set(['ZED'])});
    const marks = Array.from(page(fixture).querySelectorAll('tbody tr')).map(row => say(row.querySelector('.new-mark')));
    expect(marks).toEqual(['', 'new']);
    expect(page(fixture).querySelector('.new-mark')!.getAttribute('aria-label')).toBe('Marked DIP BUY today');
  });

  // A click anywhere on a row used to open the stock, which leaves the Portfolio view: in a table whose rows have
  // a box to tick and a button, a click that missed one took the reader away. Only the name opens it now, as in
  // "What you own" on the same view.
  it('opens a stock when its name is clicked, and not from elsewhere on its row', () => {
    const fixture = create();
    const opened: string[] = [];
    fixture.componentInstance.open.subscribe(symbol => opened.push(symbol));
    (page(fixture).querySelectorAll('tbody tr')[1].querySelector('td.num') as HTMLElement).click();
    expect(opened).withContext('a click on a number').toEqual([]);
    (page(fixture).querySelector('tbody tr button') as HTMLButtonElement).click();
    expect(opened).toEqual(['ACME']);
    expect(page(fixture).querySelector('tbody tr button')!.getAttribute('aria-label')).toBe('Open details for ACME');
  });

  it('says under the example what holds for every row, and what fit is', () => {
    expect(notes(create())).toEqual([SIZE_RULES, FIT_NOTE]);
  });

  it('has no columns about fit for a portfolio that holds nothing: there is nothing to be like', () => {
    const fixture = create({recommendations: [{...ACME, fit: undefined}, {...ZED, fit: undefined}]});
    expect(headings(fixture)).toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash']);
    expect(notes(fixture)).toEqual([SIZE_RULES]);
  });

  // The page's rule: a column that would be a dash in every row is left out. Three such columns stood here.
  it('lists only the stocks while the portfolio is worth nothing, and says how to get their sizes', () => {
    const fixture = create({
      recommendations: [{symbol: 'ACME', cases: VOLATILE}, {symbol: 'ZED', cases: MIDDLE}], reading: undefined, sizing: undefined, cash: undefined,
    });
    expect(headings(fixture)).toEqual(['Stock']);
    expect(rows(fixture)).toEqual([['ACME'], ['ZED']]);
    expect(boxes(fixture).length).withContext('nothing to split: no tick boxes').toBe(0);
    expect(page(fixture).querySelector('p.hint')).toBeNull();
    expect(page(fixture).querySelector('.reading')).toBeNull();
    expect(notes(fixture)).toEqual([NO_SIZE_NOTE]);
  });

  it('shows nothing but that it is working while prices are still arriving: half the prices give wrong sizes', () => {
    const fixture = create({loading: true});
    expect(page(fixture).querySelector('table')).toBeNull();
    expect(page(fixture).querySelector('p.lead')).toBeNull();
    expect(say(page(fixture).querySelector('p.empty'))).toBe('Working it out from today\'s prices.');
    expect(page(fixture).querySelector('p.empty')!.getAttribute('aria-busy')).toBe('true');
  });

  it('says why there is nothing to add: no stock is marked, or the portfolio holds every one that is', () => {
    expect(say(page(create({recommendations: [], marked: 0})).querySelector('p.empty'))).toBe(nothingToAdd(0));
    const holdsAll = create({recommendations: [], marked: 4});
    expect(say(page(holdsAll).querySelector('p.empty'))).toBe(nothingToAdd(4));
    expect(page(holdsAll).querySelector('table')).toBeNull();
  });

  it('takes a change of portfolio: other stocks, other sizes', () => {
    const fixture = create();
    fixture.componentRef.setInput('recommendations', [ZED]);
    fixture.componentRef.setInput('portfolio', 'Retirement');
    fixture.detectChanges();
    expect(rows(fixture).map(row => row[0])).toEqual(['ZED']);
    expect(say(page(fixture).querySelector('p.lead'))).toBe(couldAddLead(1, 'Retirement'));
  });

  // The cash split: the user ticks the stocks they are thinking of buying, and the box says what the portfolio's cash
  // would buy of each. The app ticks nothing itself and keeps the rows in their order: which stocks is the user's
  // choice. The amounts are worked out by cash-split.ts; these tests are about what the box shows of them.
  describe('the split of the cash between the stocks that are ticked', () => {
    const ONE_SHORT = 'The one you ticked is $2,013 short of its share. Your $1,000 covers a part of that.';
    const BAD_CASE = 'A bad half-year for every marked stock at once: −$2,790 today, −$3,200 after. ' +
      'More of your money would be in stocks, and cash cannot fall.';
    const CASH_SOURCE = 'The cash is what you entered under "Cash" in the "Your plan today" box.';

    it('lists a stock that is owned and can be added to after the new ones, as a row of the same table', () => {
      const fixture = create({additions: [MORE_CCC]});
      expect(say(page(fixture).querySelector('p.lead'))).toBe(couldAddLead(2, 'Brokerage', 1));
      expect(rows(fixture)[2]).toEqual(['CCC held', 'add 4.0% $400', '−$124', '$0', '+$224', '', 'You own $3,000 of it today.']);
      expect(rows(fixture).map(row => row[0])).toEqual(['ACME', 'ZED', 'CCC held']);
    });

    // The lead counts the new stocks ("2 stocks are marked ... and are not in Brokerage yet"), and the table has
    // a row more: without a word between them that reads as a miscount.
    it('sets the stocks that are owned apart under a heading of their own, across the whole table', () => {
      const fixture = create({additions: [MORE_CCC]});
      const groups = Array.from(page(fixture).querySelectorAll('tbody'));
      expect(groups.map(group => group.querySelectorAll('tr:not(.group)').length)).withContext('the new ones, then the owned').toEqual([2, 1]);
      const heading = groups[1].firstElementChild as HTMLTableRowElement;
      expect(heading.className).toBe('group');
      expect(say(heading)).toBe('Stocks you own that could be added to');
      const cell = heading.querySelector('th')!;
      expect(cell.getAttribute('scope')).toBe('rowgroup');
      expect(cell.colSpan).withContext('as wide as the table').toBe(page(fixture).querySelectorAll('thead th').length);
      tick(fixture, 'ACME');
      expect(cell.colSpan).withContext('also with the second amount showing').toBe(page(fixture).querySelectorAll('thead th').length);
    });

    it('has no such heading when there is nothing owned to add to, and none when every row is such a stock', () => {
      expect(page(create()).querySelector('tr.group')).toBeNull();
      expect(page(create({recommendations: [], additions: [MORE_CCC], marked: 3, reading: undefined})).querySelector('tr.group'))
        .withContext('the lead says it then').toBeNull();
    });

    it('does not open a stock when that heading is clicked', () => {
      const fixture = create({additions: [MORE_CCC]});
      const opened: string[] = [];
      fixture.componentInstance.open.subscribe(symbol => opened.push(symbol));
      (page(fixture).querySelector('tr.group th') as HTMLElement).click();
      expect(opened).toEqual([]);
    });

    it('lists only the stocks that can be added to when every marked stock is owned', () => {
      const fixture = create({recommendations: [], additions: [MORE_CCC], marked: 3, reading: undefined});
      expect(say(page(fixture).querySelector('p.lead'))).toBe(couldAddLead(0, 'Brokerage', 1));
      expect(rows(fixture).map(row => row[0])).toEqual(['CCC held']);
      expect(page(fixture).querySelector('p.empty')).toBeNull();
      // Its last column says what is held of each. The note about sectors and how prices move together would
      // describe something this table does not show.
      expect(headings(fixture)).toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Sector (you own)', 'Moves with yours']);
      expect(notes(fixture)).toEqual([SIZE_RULES]);
    });

    it('gives every row a tick box that says what it is for, with none ticked, and says above the table how it works', () => {
      const fixture = create({additions: [MORE_CCC]});
      expect(boxes(fixture).map(box => box.getAttribute('aria-label'))).toEqual([
        'Count ACME in the split', 'Count ZED in the split', 'Count CCC in the split',
      ]);
      expect(boxes(fixture).map(box => box.checked)).toEqual([false, false, false]);
      expect(say(page(fixture).querySelector('p.hint'))).toBe(tickHint(1000));
      expect(headings(fixture)).withContext('the column of the second amount is there from the start, empty: a column that arrives with the first tick moves the others').toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Sector (you own)', 'Moves with yours']);
      expect(splitSays(fixture)).toEqual([]);
    });

    it('says where to enter the cash when the portfolio has none', () => {
      expect(say(page(create({cash: undefined})).querySelector('p.hint'))).toBe(tickHint(undefined));
    });

    it('shows in the row of a ticked stock what the cash gives it, and under the table what the purchase would do', () => {
      const fixture = create();
      tick(fixture, 'ACME');
      expect(headings(fixture)).toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Sector (you own)', 'Moves with yours']);
      expect(rows(fixture).map(row => row[5])).withContext('the ticked row, and the one that is not').toEqual(['$1,000', '']);
      expect(say(page(fixture).querySelector('.split h3'))).toBe('With your cash');
      expect(splitSays(fixture)).toEqual([ONE_SHORT, 'You would hold 4 stocks instead of 3.', BAD_CASE, CASH_SOURCE]);
    });

    // The ticks are for looking and are gone after a reload of the page: the owner's choice when they were designed.
    // The box says so while something is ticked.
    it('says while something is ticked that ticks are not saved, and not before', () => {
      const fixture = create();
      expect(page(fixture).querySelector('.split .unsaved')).toBeNull();
      tick(fixture, 'ACME');
      expect(say(page(fixture).querySelector('.split .unsaved'))).toBe('Ticks are not saved: a reload of the page clears them.');
    });

    it('keeps nothing of the ticks in the browser: a new page starts with none', () => {
      const before = JSON.stringify({...localStorage});
      const first = create({portfolioId: 'p1'});
      tick(first, 'ACME');
      first.destroy();
      expect(JSON.stringify({...localStorage})).withContext('nothing written').toBe(before);
      expect(Array.from(page(create({portfolioId: 'p1'})).querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')).some(box => box.checked)).toBeFalse();
    });

    it('takes the second amount and the lines away again when the tick is taken off', () => {
      const fixture = create();
      tick(fixture, 'ACME');
      tick(fixture, 'ACME');
      expect(headings(fixture)).toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case', 'With your cash', 'Sector (you own)', 'Moves with yours']);
      expect(splitSays(fixture)).toEqual([]);
    });

    it('says why a ticked stock that is owned gets nothing once it is at its share with the others ticked', () => {
      // With ACME in the portfolio CCC's share is 26.6% of $10,000, and $3,000 of it is held already.
      const fixture = create({additions: [MORE_CCC]});
      tick(fixture, 'ACME');
      tick(fixture, 'CCC');
      expect(rows(fixture).map(row => row[5])).toEqual(['$1,000', '', '— at its share']);
      // The cash covers a part of what ACME is short of: that is why its amount is less than its "Size", the first
      // line says so, and the line about a share that is smaller with others in the portfolio is not there.
      expect(splitSays(fixture).slice(0, 2)).toEqual([
        '1 of the 2 you ticked is $2,013 short of its share; the other is at its share already. Your $1,000 covers a part of that.',
        'You would hold 4 stocks instead of 3.',
      ]);
    });

    it('says why an amount is less than "Size" when two new stocks are ticked together and the cash covers both', () => {
      // BETA, in between like the three held: alone it would take a quarter, $2,500. With ACME and BETA both in, the
      // portfolio holds five: ACME's share is 15.9% ($1,590) and BETA's 21.0% ($2,103).
      const BETA: Recommendation = {symbol: 'BETA', cases: MIDDLE, size: {sharePercent: 25, dollars: 2500, loss: 775, gain: 1400, capped: false}};
      const fixture = create({recommendations: [ACME, BETA]});
      tick(fixture, 'ACME');
      tick(fixture, 'BETA');
      expect(rows(fixture).map(row => row[5])).withContext('$1,000 of cash: the same part of what each is short of').toEqual(['$431', '$569']);
      expect(splitSays(fixture)[1]).withContext('the cash covers a part: the first line says why the amounts are less')
        .toBe('You would hold 5 stocks instead of 3.');
      // With the three held at $2,000 each there is $4,000 of cash, which covers both: each gets its whole share,
      // which is less than its size alone, and the line under the first says why.
      fixture.componentRef.setInput('sizing', {...BROKERAGE, holdings: BROKERAGE.holdings.map(it => ({...it, value: 2000}))});
      fixture.componentRef.setInput('cash', 4000);
      fixture.detectChanges();
      expect(rows(fixture).map(row => row[5])).toEqual(['$1,590', '$2,103']);
      expect(splitSays(fixture)[0]).toContain('covers all of it');
      expect(splitSays(fixture)[1]).toBe(
        `With the others you ticked in the portfolio a stock's share is smaller than alone: that is why an amount can be less ` +
        `than the stock's "Size".`);
    });

    // Found by a review of the page: a ticked row carried three dollar amounts ("9.0% $3,000" under Size, then
    // "$1,400 of $2,600"). The amount the money would buy is now the row's one strong figure: the row is marked as
    // ticked, so that the style sheet can let its size step back, and the cell holds that amount alone. What it is
    // measured against is said where the pointer rests, and to the keyboard on the stock's name.
    it('marks a ticked row and shows in it one amount, with what it is measured against where the pointer rests', () => {
      const fixture = create({names: {ACME: 'Acme Tools Inc'}});
      tick(fixture, 'ACME');
      const [acme, zed] = Array.from(page(fixture).querySelectorAll<HTMLElement>('tbody tr[data-row]'));
      expect([acme.classList.contains('ticked'), zed.classList.contains('ticked')]).toEqual([true, false]);
      expect(Array.from(acme.querySelectorAll('td.cash span')).map(say)).withContext('one figure, nothing beside it').toEqual(['$1,000']);
      const tip = 'It is $2,013 short of its share with the stocks you ticked in the portfolio. This covers a part of that, ' +
        'the same part for every stock you ticked.';
      expect(fixture.debugElement.query(By.css('tbody tr[data-row="ACME"] td.cash')).injector.get(MatTooltip).message).toBe(tip);
      fixture.componentInstance.onStockFocus('ACME', {target: {matches: () => true}} as unknown as FocusEvent);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('tbody button.symbol')).injector.get(MatTooltip).message.split('\n'))
        .withContext('with the keyboard on the stock').toContain(`With your cash: ${tip}`);
      tick(fixture, 'ACME');
      expect(acme.classList.contains('ticked')).withContext('unticked again').toBeFalse();
    });

    // The answer to a tick stands beside the lead, the other lines under the table. The line about a bad
    // half-year is handed out by itself, so that it can stand with that answer.
    it('hands out the line about a bad half-year by itself once something is ticked, and nothing before', () => {
      const fixture = create();
      expect(fixture.componentInstance.badCaseSays).toBe('');
      tick(fixture, 'ACME');
      expect(fixture.componentInstance.badCaseSays).toBe(BAD_CASE);
      expect(splitSays(fixture)).toContain(fixture.componentInstance.badCaseSays);
      tick(fixture, 'ACME');
      expect(fixture.componentInstance.badCaseSays).withContext('unticked again').toBe('');
    });

    // The amount the money would buy is the one strong figure of a ticked row, and its size, which is for the
    // stock added alone, steps back to the weight of the row's other numbers.
    it('sets the amount of a ticked row stronger than its size, and leaves the size of the other rows as it was', () => {
      const fixture = create();
      tick(fixture, 'ACME');
      const [acme, zed] = Array.from(page(fixture).querySelectorAll<HTMLElement>('tbody tr[data-row]'));
      const weight = (row: HTMLElement, cell: string) => Number(getComputedStyle(row.querySelector(`td.${cell} .share`)!).fontWeight);
      expect(weight(acme, 'cash')).toBeGreaterThan(weight(acme, 'size'));
      expect(weight(acme, 'cash')).toBeGreaterThanOrEqual(600);
      expect(weight(zed, 'size')).withContext('a row that is not ticked').toBeGreaterThan(weight(acme, 'size'));
    });

    it('keeps the two words of a ticked stock that gets nothing beside its dash', () => {
      const fixture = create({additions: [MORE_CCC]});
      tick(fixture, 'ACME');
      tick(fixture, 'CCC');
      const ccc = page(fixture).querySelector('tbody tr[data-row="CCC"] td.cash')!;
      expect(Array.from(ccc.querySelectorAll('span')).map(say)).toEqual(['—', 'at its share']);
    });

    it('keeps a ticked row one line tall: the dash of a stock that gets nothing and its two words stand side by side', () => {
      const fixture = create({additions: [MORE_CCC]});
      tick(fixture, 'ACME');
      tick(fixture, 'CCC');
      const cells = Array.from(page(fixture).querySelectorAll('tbody tr.ticked td.cash'));
      expect(cells.map(cell => Array.from(cell.children).map(part => getComputedStyle(part).display)))
        .withContext('the amount alone, then the dash with its words').toEqual([['inline'], ['inline', 'inline']]);
    });

    // A symbol alone says nothing to who does not know it. The name is not a second line (the rows are to stay one
    // line tall): it shows when the pointer rests on the symbol or the keyboard reaches it, as in the other tables.
    it("says the company's name where the pointer rests on its symbol", () => {
      const fixture = create({names: {ACME: 'Acme Tools Inc'}});
      const tips = fixture.debugElement.queryAll(By.css('tbody button.symbol')).map(button => button.injector.get(MatTooltip).message);
      expect(tips).toEqual(['Acme Tools Inc', '']);
    });

    // Where a row's numbers come from was said only where the pointer rests on a cell, and a cell cannot take the
    // keyboard. The stock is the row's tab stop: with the keyboard on it, it says what every cell of its row says.
    it('says what each cell of the row says to a pointer when the keyboard is on the stock, under the name of its column', () => {
      const fixture = create({names: {ACME: 'Acme Tools Inc'}});
      const box = fixture.componentInstance;
      const first = fixture.debugElement.query(By.css('tbody button.symbol'));
      box.onStockFocus('ACME', {target: {matches: () => true}} as unknown as FocusEvent);
      fixture.detectChanges();
      const tip = first.injector.get(MatTooltip);
      // Only what differs from row to row: how a size and the two cases are worked out reads the same in every row
      // and stands in words under the table. With those three lines the box covered the next eight rows.
      expect(tip.message).toBe(
        'Acme Tools Inc\nMoves with yours: How closely its price has moved with your stocks: 0.61 over the past year, ' +
        '0.70 over the last month (0 = not at all, 1 = exactly together).');
      expect(tip.position).withContext('over what was read already, not over the rows to come').toBe('above');
      box.onStockBlur();
      fixture.detectChanges();
      expect(first.injector.get(MatTooltip).message).withContext('the name alone again').toBe('Acme Tools Inc');
    });

    it('keeps to the name when the stock is clicked with the pointer', () => {
      const fixture = create({names: {ACME: 'Acme Tools Inc'}});
      fixture.componentInstance.onStockFocus('ACME', {target: {matches: () => false}} as unknown as FocusEvent);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('tbody button.symbol')).injector.get(MatTooltip).message).toBe('Acme Tools Inc');
    });

    it('does not open the stock when its tick box is clicked', () => {
      const fixture = create();
      const opened: string[] = [];
      fixture.componentInstance.open.subscribe(symbol => opened.push(symbol));
      tick(fixture, 'ACME');
      (page(fixture).querySelector('tbody td.tick') as HTMLElement).click();
      expect(opened).toEqual([]);
    });

    it('announces the answer to a tick to a screen reader', () => {
      const fixture = create();
      const status = page(fixture).querySelector('.tick-answer .answer')!;
      expect(status.getAttribute('role')).withContext('there before anything is ticked, so that what appears in it is read out').toBe('status');
      // Hidden while empty, it would be out of a screen reader's sight until it is already filled, and the first
      // tick's figures might then not be read out at all.
      expect(getComputedStyle(status).display).withContext('in the page while it is empty').not.toBe('none');
      expect(say(status)).toBe('');
      tick(fixture, 'ACME');
      expect(status.querySelectorAll('dl.facts > div').length).toBe(4);
      expect(page(fixture).querySelector('.tick-answer [aria-hidden="true"]')).withContext('nothing of the answer is kept from a screen reader').toBeNull();
    });

    // Found by three reviews of the page: the answer to a tick stood under the table only, out of sight in a
    // laptop window while rows were being ticked. And the owner, of the sentences it then got beside the lead:
    // "too much text and not much signal". It is figures with their names now, each with its sentence at the pointer.
    it('answers a tick beside the instruction with figures, each named, and no sentence', () => {
      const fixture = create();
      const beside = () => page(fixture).querySelector('.tick-answer')!;
      expect(say(beside())).withContext('nothing ticked').toBe('');
      tick(fixture, 'ACME');
      expect(say(beside().querySelector('h3'))).toBe('With your cash');
      expect(facts(fixture)).toEqual([
        ['Room for the one ticked', '$2,013'], ['Cash to split', '$1,000'], ['Stocks held', '3 today, 4 after'],
        ['Bad half-year, every marked stock at once', '−$2,790 today, −$3,200 after'],
      ]);
      expect(beside().querySelectorAll('p').length).withContext('no sentence').toBe(0);
      // The sentence a figure comes from is where the pointer rests on it.
      const tips = fixture.debugElement.queryAll(By.css('.tick-answer dl.facts > div')).map(it => it.injector.get(MatTooltip).message);
      expect(tips).toEqual([ONE_SHORT, CASH_SOURCE, 'You would hold 4 stocks instead of 3.', BAD_CASE]);
      // And all of them, whole, are with the explanations of the box.
      expect(splitSays(fixture)).toEqual([ONE_SHORT, 'You would hold 4 stocks instead of 3.', BAD_CASE, CASH_SOURCE]);
      expect(page(fixture).querySelector('.about .about-body .split')).not.toBeNull();
    });

    // Found by a review, and the owner's word: ticking a row far down a long table left the answer above the window.
    // While something is ticked it stays under the page's bar as the table is scrolled. For that it is a child of
    // the box itself, not of the short block above the table, which would take it away with it.
    it('keeps the answer to a tick in sight while the table is scrolled, and lets it go when nothing is ticked', () => {
      const fixture = create();
      (fixture.nativeElement as HTMLElement).style.width = '1300px';
      const answer = page(fixture).querySelector<HTMLElement>('.tick-answer')!;
      expect(answer.parentElement!.querySelector(':scope > .body table')).withContext('beside the block of the table, in the box itself').not.toBeNull();
      expect(answer.closest('.top')).toBeNull();
      expect(getComputedStyle(answer).position).withContext('nothing ticked').not.toBe('sticky');
      tick(fixture, 'ACME');
      expect(getComputedStyle(answer).position).toBe('sticky');
      expect(getComputedStyle(answer).top).withContext('under the bar across the top of the page').not.toBe('auto');
      expect(getComputedStyle(answer).backgroundColor).withContext('the rows pass under it: it is not see-through').not.toBe('rgba(0, 0, 0, 0)');
      tick(fixture, 'ACME');
      expect(getComputedStyle(answer).position).withContext('unticked again').not.toBe('sticky');
    });

    // The owner's word, after a review: a ticked row said "With your cash $1,000" beside a bad and a good case still
    // worked out for its whole size of $2,013. In a ticked row that gets an amount, the three cases are for that amount.
    it('works the three cases of a ticked row out for the amount the cash would buy, and says so at the pointer', () => {
      const fixture = create();
      const cases = () => rows(fixture).map(row => row.slice(2, 5));
      expect(cases()).toEqual([['−$825', '+$48', '+$1,711'], ['−$378', '−$1', '+$683']]);
      tick(fixture, 'ACME');
      // $1,000 of a volatile stock: 41% lost, +2.4% typical, 85% gained.
      expect(cases()).withContext('the ticked row, and the one that is not').toEqual([['−$410', '+$24', '+$850'], ['−$378', '−$1', '+$683']]);
      const ticked = fixture.debugElement.query(By.css('tbody tr[data-row="ACME"]'));
      expect(ticked.queryAll(By.css('td.for-cash')).length).withContext('the three cells are marked as being for the cash').toBe(3);
      expect(ticked.query(By.css('td.typical')).injector.get(MatTooltip).message).toBe(
        'In tests, the typical stock like this ended at +2.4% after 6 months: half did better, half worse. ' +
        'On the $1,000 the money would buy, that would be the amount shown.');
      expect(fixture.debugElement.queryAll(By.css('tbody tr[data-row="ZED"] td.for-cash')).length).toBe(0);
      tick(fixture, 'ACME');
      expect(cases()).withContext('unticked again: for its size').toEqual([['−$825', '+$48', '+$1,711'], ['−$378', '−$1', '+$683']]);
    });

    it('leaves the cases of a ticked row that gets nothing as they are: for its size', () => {
      const fixture = create({cash: undefined});
      tick(fixture, 'ACME');
      expect(rows(fixture)[0].slice(2, 5)).toEqual(['−$825', '+$48', '+$1,711']);
      expect(page(fixture).querySelectorAll('td.for-cash').length).toBe(0);
    });

    it('answers with the one sentence that says why, where nothing is split', () => {
      const fixture = create({cash: undefined});
      tick(fixture, 'ACME');
      expect(facts(fixture)).toEqual([]);
      expect(Array.from(page(fixture).querySelectorAll('.tick-answer .answer p')).map(say)).toEqual([
        'You ticked 1, but this portfolio has no cash to split. Enter it in the "Your plan today" box, under "Cash".',
      ]);
    });

    it('follows the cash: more of it, and the ticked stock gets all it is short of', () => {
      const fixture = create();
      tick(fixture, 'ACME');
      // $3,000 of cash in a portfolio worth $12,000: ACME's share is 20.13% of that, $2,416.
      fixture.componentRef.setInput('sizing', {...BROKERAGE, portfolioValue: 12_000});
      fixture.componentRef.setInput('cash', 3000);
      fixture.detectChanges();
      expect(boxes(fixture)[0].checked).withContext('still ticked').toBeTrue();
      expect(rows(fixture)[0][5]).toBe('$2,416');
      expect(splitSays(fixture)[0]).toBe('The one you ticked is $2,416 short of its share. Your $3,000 covers all of it, and $584 stays cash.');
    });

    it('forgets the ticks when another portfolio is shown: they were for the other one', () => {
      const fixture = create({portfolioId: 'p1'});
      tick(fixture, 'ACME');
      fixture.componentRef.setInput('portfolioId', 'p2');
      fixture.detectChanges();
      expect(boxes(fixture).map(box => box.checked)).toEqual([false, false]);
      expect(splitSays(fixture)).toEqual([]);
    });

    // Two portfolios may have one name, and a portfolio may get a new one: the ticks go by which portfolio it is.
    it('keeps the ticks when the portfolio is only given another name, and forgets them for another portfolio of the same name', () => {
      const fixture = create({portfolioId: 'p1'});
      tick(fixture, 'ACME');
      fixture.componentRef.setInput('portfolio', 'Savings');
      fixture.detectChanges();
      expect(boxes(fixture).map(box => box.checked)).withContext('renamed').toEqual([true, false]);
      fixture.componentRef.setInput('portfolioId', 'p2');
      fixture.detectChanges();
      expect(boxes(fixture).map(box => box.checked)).withContext('another portfolio, also called Savings').toEqual([false, false]);
    });

    it('counts a holding whose price did not load among the stocks held: it is held all the same', () => {
      const fixture = create({unpriced: 1});
      tick(fixture, 'ACME');
      expect(splitSays(fixture)[1]).toBe('You would hold 5 stocks instead of 4.');
    });

    describe('with what the plan says to sell', () => {
      // Worth $10,000, $6,000 of it in three stocks and $4,000 in cash, with a limit of 5% ($500 on one stock):
      // $3,000 of a volatile stock could lose $1,230.
      const TOO_BIG: SizingInput = {
        portfolioValue: 10_000, limitPercent: 5,
        holdings: [
          {symbol: 'AAA', value: 3000, cases: VOLATILE}, {symbol: 'BBB', value: 1500, cases: MIDDLE}, {symbol: 'CCC', value: 1500, cases: MIDDLE},
        ],
      };
      const sellSays = (fixture: ComponentFixture<CouldAddComponent>) => say(page(fixture).querySelector('p.sell'));
      const countSold = (fixture: ComponentFixture<CouldAddComponent>) => page(fixture).querySelector<HTMLInputElement>('label.count-sold input');

      // Nothing to do about it, so it is said quietly, with the other sentences beside the table: the page is to
      // stay compact, and above the table it would cost a line on every visit.
      it('says among the sentences about the table that the plan asks to sell nothing, when it does', () => {
        const fixture = create();
        expect(say(page(fixture).querySelector('.about p.sell'))).toBe(sellNote([]));
        expect(page(fixture).querySelectorAll('p.sell').length).withContext('said once, and not above the table').toBe(1);
        expect(countSold(fixture)).withContext('nothing to count').toBeNull();
      });

      it('says above the table what the sale would free, as a figure, and offers to count that money, unticked', () => {
        const fixture = create({sizing: TOO_BIG, cash: 4000});
        const sale = page(fixture).querySelector('.top .sale')!;
        expect(say(sale.querySelector('.fact'))).toBe('SELL SOME would free $1,780');
        expect(say(sale.querySelector('.fact strong'))).withContext('the figure is what stands out').toBe('$1,780');
        expect(fixture.debugElement.query(By.css('.top .sale .fact')).injector.get(MatTooltip).message)
          .withContext('which stocks, where the pointer rests').toBe('The plan says SELL SOME: selling AAA down to $1,220 would free $1,780.');
        const above = Array.from(page(fixture).querySelectorAll('p.hint, .sale, label.count-sold, .body')).map(el => el.className);
        expect(above).withContext('it asks for something: it stands with the hint, before the table').toEqual(['hint', 'sale', 'count-sold', 'body']);
        expect(say(page(fixture).querySelector('label.count-sold'))).toBe('Count that money in the split');
        expect(countSold(fixture)!.checked).toBeFalse();
        expect(sellSays(fixture)).withContext('the sentence is with the explanations').toBe('The plan says SELL SOME: selling AAA down to $1,220 would free $1,780.');
        expect(page(fixture).querySelector('.about .about-body p.sell')).not.toBeNull();
      });

      it('splits the cash and the freed money together once that is ticked, and says what a bad half-year would then cost', () => {
        const fixture = create({sizing: TOO_BIG, cash: 4000});
        tick(fixture, 'ACME');
        expect(splitSays(fixture)[0]).withContext('the cash alone').toBe(
          'The one you ticked is $1,220 short of its share. Your $4,000 covers all of it, and $2,780 stays cash.');
        countSold(fixture)!.click();
        fixture.detectChanges();
        expect(say(page(fixture).querySelector('p.hint'))).withContext('the hint says what is split').toBe(tickHint(4000, 1780.49));
        // The money is no longer the cash alone: the column and the heading over the lines say "the money".
        expect(headings(fixture)).toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case', 'With the money', 'Sector (you own)', 'Moves with yours']);
        expect(say(page(fixture).querySelector('.split h3'))).toBe('With the money');
        expect(splitSays(fixture)).toEqual([
          'The one you ticked is $1,220 short of its share. Your $5,780 (your cash and what selling would free) covers all of it, ' +
          'and $4,561 would be left as cash.',
          'You would hold 4 stocks instead of 3.',
          // Today: $1,230 + $465 + $465. After: the stock sold down could lose $500, and so could the new one.
          'A bad half-year for every marked stock at once: −$2,160 today, −$1,930 after selling and buying. ' +
          'Selling takes more off it than what you would buy adds.',
          'The cash is what you entered under "Cash" in the "Your plan today" box; $1,780 of the $5,780 is what SELL SOME would free.',
        ]);
      });

      // The box is the user's "yes, count it" for the portfolio and the sale it was ticked for, like the ticks.
      it('stops counting the freed money when another portfolio is shown, and when the plan no longer asks to sell', () => {
        const fixture = create({sizing: TOO_BIG, cash: 4000, portfolioId: 'p1'});
        countSold(fixture)!.click();
        fixture.detectChanges();
        expect(countSold(fixture)!.checked).toBeTrue();
        fixture.componentRef.setInput('portfolioId', 'p2');
        fixture.detectChanges();
        expect(countSold(fixture)!.checked).withContext('another portfolio').toBeFalse();

        countSold(fixture)!.click();
        fixture.detectChanges();
        // The limit is raised to 20%: $2,000 may be lost on one stock, and none of the three could lose that.
        fixture.componentRef.setInput('sizing', {...TOO_BIG, limitPercent: 20});
        fixture.detectChanges();
        expect(countSold(fixture)).withContext('nothing to sell any more').toBeNull();
        tick(fixture, 'ACME');
        expect(splitSays(fixture)[0]).toBe('The one you ticked is $2,153 short of its share. Your $4,000 covers all of it, and $1,847 stays cash.');
        // The limit goes back: the plan names the sale again, and the box must not come back ticked by itself.
        fixture.componentRef.setInput('sizing', TOO_BIG);
        fixture.detectChanges();
        expect(countSold(fixture)!.checked).withContext('named again: not ticked by itself').toBeFalse();
      });

      it('stops counting when the plan names another sale than the one the box was ticked for', () => {
        const fixture = create({sizing: TOO_BIG, cash: 4000});
        countSold(fixture)!.click();
        fixture.detectChanges();
        // Prices move: AAA is within the limit again, and BBB is the stock that could lose more than it.
        const other: SizingInput = {...TOO_BIG, holdings: [
          {symbol: 'AAA', value: 1200, cases: VOLATILE}, {symbol: 'BBB', value: 3300, cases: MIDDLE}, {symbol: 'CCC', value: 1500, cases: MIDDLE},
        ]};
        fixture.componentRef.setInput('sizing', other);
        fixture.detectChanges();
        expect(sellSays(fixture)).toBe('The plan says SELL SOME: selling BBB down to $1,613 would free $1,687.');
        expect(countSold(fixture)!.checked).withContext('ticked for another sale').toBeFalse();
      });

      // Worth $5,300, $300 of it cash, with a limit of 6% ($318): AAA could lose $1,230, and $776 of it fits.
      const LITTLE_CASH: SizingInput = {
        portfolioValue: 5300, limitPercent: 6,
        holdings: [
          {symbol: 'AAA', value: 3000, cases: VOLATILE}, {symbol: 'BBB', value: 1000, cases: MIDDLE}, {symbol: 'CCC', value: 1000, cases: MIDDLE},
        ],
      };

      it('gives a ticked row more once the freed money is counted, when the cash alone was short', () => {
        const fixture = create({sizing: LITTLE_CASH, cash: 300});
        tick(fixture, 'ACME');
        expect(rows(fixture)[0][5]).withContext('the cash alone').toBe('$300');
        countSold(fixture)!.click();
        fixture.detectChanges();
        expect(rows(fixture)[0][5]).withContext('with what selling AAA down would free, $2,224').toBe('$776');
      });

      it('splits what selling would free alone in a portfolio without cash, and says so from the hint to the last line', () => {
        // The same three stocks and no cash: worth $5,000, the limit $300, $732 of AAA fits and $2,268 would be freed.
        const fixture = create({sizing: {...LITTLE_CASH, portfolioValue: 5000}, cash: 0});
        expect(say(page(fixture).querySelector('p.hint'))).withContext('nothing to split yet, and how to change that')
          .toBe(tickHint(0, 0, true));
        tick(fixture, 'ACME');
        expect(splitSays(fixture)).toEqual([
          'You ticked 1, but this portfolio has no cash to split. Enter it in the "Your plan today" box, under "Cash", ' +
          'or tick "Count that money in the split".',
        ]);
        countSold(fixture)!.click();
        fixture.detectChanges();
        expect(say(page(fixture).querySelector('p.hint'))).toBe(tickHint(0, 2268.29));
        expect(headings(fixture)[5]).toBe('With the money');
        const said = splitSays(fixture);
        expect(said[0]).toBe(
          'The one you ticked is $732 short of its share. The $2,268 that selling would free covers all of it, and $1,537 would be left as cash.');
        expect(said[said.length - 1]).toBe('This portfolio has no cash entered: the $2,268 is what SELL SOME would free.');
      });

      // "That money" is the money of the sentence above the box: a screen reader that goes from control to control
      // reads the sentence with the box. And the hint, which changes when the box is ticked, is read out when it does.
      it('ties the box to the sentence it is about, and has the hint read out when it changes', () => {
        const fixture = create({sizing: TOO_BIG, cash: 4000});
        const sentence = page(fixture).querySelector('p.sell')!;
        expect(sentence.id).not.toBe('');
        expect(countSold(fixture)!.getAttribute('aria-describedby')).toBe(sentence.id);
        expect(page(fixture).querySelector('p.hint')!.getAttribute('aria-live')).toBe('polite');
      });

      it('says nothing about selling while the portfolio is worth nothing', () => {
        const fixture = create({recommendations: [{symbol: 'ACME', cases: VOLATILE}], reading: undefined, sizing: undefined, cash: undefined});
        expect(page(fixture).querySelector('p.sell')).toBeNull();
      });
    });

    // A second limit of the user's own: a share of the portfolio stays outside stocks, so the box splits only the
    // cash above it. Brokerage has $1,000 in cash.
    describe('with a share kept outside stocks', () => {
      it('splits only the cash above what is kept, and says so in the hint, the row and the lines', () => {
        const fixture = create({keep: 600});
        expect(say(page(fixture).querySelector('p.hint'))).toBe(tickHint(1000, 0, false, 600));
        tick(fixture, 'ACME');
        expect(rows(fixture)[0]).withContext('the ticked row').toContain('$400');
        expect(splitSays(fixture)[0]).toBe(
          'The one you ticked is $2,013 short of its share. Your $400 (your cash above the $600 you keep outside stocks) covers a part of that.');
      });

      it('splits nothing while all the cash lies within what is kept', () => {
        const fixture = create({keep: 1500});
        expect(say(page(fixture).querySelector('p.hint'))).toBe(tickHint(1000, 0, false, 1500));
        tick(fixture, 'ACME');
        expect(rows(fixture)[0]).toContain('— nothing to split');
        expect(splitSays(fixture)).toEqual([
          'You ticked 1, but your cash ($1,000) is within the $1,500 you keep outside stocks: nothing is left to split.',
        ]);
      });

      it('is as before while no share is kept', () => {
        const fixture = create({keep: undefined});
        expect(say(page(fixture).querySelector('p.hint'))).toBe(tickHint(1000));
      });

      // A holding whose quote did not load: the portfolio is worth more than could be counted, so the amount to
      // keep is the least it can be, and what lies above it may be money the user set aside.
      it('splits nothing while a stock of the portfolio has no price', () => {
        const fixture = create({keep: 600, unpriced: 1});
        expect(say(page(fixture).querySelector('p.hint'))).toBe(tickHint(1000, 0, false, 600, true));
        tick(fixture, 'ACME');
        expect(rows(fixture)[0]).toContain('— nothing to split');
        expect(splitSays(fixture)).toEqual([
          'You ticked 1, but one of your stocks has no price, so what you keep outside stocks cannot be worked out yet: ' +
          'nothing is split until its price loads.',
        ]);
      });

      it('treats money above what is kept of under a cent as none, in the hint and in the lines alike', () => {
        const fixture = create({keep: 999.999});
        expect(say(page(fixture).querySelector('p.hint'))).toBe(tickHint(1000, 0, false, 999.999));
        tick(fixture, 'ACME');
        expect(splitSays(fixture)).toEqual([
          'You ticked 1, but your cash ($1,000) is within the $1,000 you keep outside stocks: nothing is left to split.',
        ]);
      });

      // What is kept comes off the cash and the money of a counted sale taken together, not off the cash alone.
      it('takes what is kept from the cash and what a counted sale would free together', () => {
        const TOO_BIG: SizingInput = {
          portfolioValue: 10_000, limitPercent: 5,
          holdings: [
            {symbol: 'AAA', value: 3000, cases: VOLATILE}, {symbol: 'BBB', value: 1500, cases: MIDDLE}, {symbol: 'CCC', value: 1500, cases: MIDDLE},
          ],
        };
        // $4,000 of cash and $1,780 from the sale; $5,000 is kept: $780 is split. (Off the cash alone it would be
        // nothing, and with the freed money added on top $1,780.)
        const fixture = create({sizing: TOO_BIG, cash: 4000, keep: 5000});
        tick(fixture, 'ACME');
        expect(splitSays(fixture)).withContext('the cash alone is within what is kept').toEqual([
          'You ticked 1, but your cash ($4,000) is within the $5,000 you keep outside stocks: nothing is left to split. ' +
          'Or tick "Count that money in the split".',
        ]);
        page(fixture).querySelector<HTMLInputElement>('label.count-sold input')!.click();
        fixture.detectChanges();
        expect(rows(fixture)[0]).toContain('$780');
        expect(splitSays(fixture)[0]).toBe(
          'The one you ticked is $1,220 short of its share. Your $780 (your cash and what selling would free, above the $5,000 you keep ' +
          'outside stocks) covers a part of that.');
      });
    });

    it('drops the tick of a stock that is no longer in the table, and keeps the others', () => {
      const fixture = create();
      tick(fixture, 'ACME');
      tick(fixture, 'ZED');
      fixture.componentRef.setInput('recommendations', [ZED]);
      fixture.detectChanges();
      expect(boxes(fixture).map(box => box.checked)).toEqual([true]);
      expect(splitSays(fixture)[0]).toMatch(/^The one you ticked is /);
    });
  });

  // The owner of the page: "add the ability to add directly from the could add - default position values are the
  // recommended ones". Before, a purchase was recorded in the stock's details on the Watchlist, two clicks and a
  // change of view away from the row that gave its size.
  describe('a purchase recorded in a row ("Add")', () => {
    const PRICES = {ACME: 50, ZED: 20, CCC: 100};
    const withPrices = (inputs: Inputs = {}) => create({prices: PRICES, today: '2026-11-21', ...inputs});
    const addButtons = (fixture: ComponentFixture<CouldAddComponent>) => Array.from(page(fixture).querySelectorAll<HTMLButtonElement>('td.act button.add'));
    const forms = (fixture: ComponentFixture<CouldAddComponent>) =>
      fixture.debugElement.queryAll(By.directive(PurchaseFormComponent)).map(it => it.componentInstance as PurchaseFormComponent);
    function add(fixture: ComponentFixture<CouldAddComponent>, index: number): void {
      addButtons(fixture)[index].click();
      fixture.detectChanges();
    }

    it('ends every row in "Add", named for a screen reader by what it records, and says above the table what it does', () => {
      const fixture = withPrices({additions: [MORE_CCC]});
      expect(addButtons(fixture).map(say)).toEqual(['Add', 'Add', 'Add']);
      // The name read out begins with the word that is seen (who speaks to the page says what they see), and says
      // that a purchase is recorded: in this box "add" is otherwise the word for buying.
      expect(addButtons(fixture).map(button => button.getAttribute('aria-label'))).toEqual([
        'Add ACME: record a purchase you made', 'Add ZED: record a purchase you made', 'Add CCC: record a purchase you made',
      ]);
      const tips = fixture.debugElement.queryAll(By.css('td.act button.add')).map(it => it.injector.get(MatTooltip).message);
      expect(tips).withContext('the same under the pointer').toEqual(Array(3).fill('Record a purchase you made. Nothing is bought here.'));
      expect(say(page(fixture).querySelector('thead th.act'))).toBe('Record a purchase');
      // What "Add" does is said on the button (to the pointer and to a screen reader) and as the form's first line.
      // A paragraph above the table said it a third time and pushed the table three lines down.
      expect(page(fixture).querySelector('p.hint.record')).toBeNull();
      expect(rows(fixture)[0]).withContext('the cells of a row are as they were').toEqual(
        ['ACME', '20.1% $2,013', '−$825', '+$48', '+$1,711', '', 'Technology (2)', 'closely']);
    });

    it('has no "Add" until the page knows today\'s prices, and none for a stock without one', () => {
      expect(page(create()).querySelector('.act')).toBeNull();
      expect(page(create()).querySelector('p.hint.record')).toBeNull();
      expect(addButtons(withPrices({prices: {ACME: 50}})).map(button => button.getAttribute('aria-label'))).toEqual(['Add ACME: record a purchase you made']);
    });

    it('opens the purchase under its row, filled in with the size of that row at today\'s price, and does not open the stock', () => {
      const fixture = withPrices();
      const opened: string[] = [];
      fixture.componentInstance.open.subscribe(symbol => opened.push(symbol));
      add(fixture, 0);
      expect(opened).toEqual([]);
      const order = Array.from(page(fixture).querySelectorAll('tbody tr')).map(row => row.className.includes('form-row') ? 'form' : say(row.querySelector('th')));
      expect(order).toEqual(['ACME', 'form', 'ZED']);
      const [form] = forms(fixture);
      expect([form.symbol, form.price, form.today, form.cash]).toEqual(['ACME', 50, '2026-11-21', 1000]);
      expect(form.dollars).toBe(2012.99);
      expect(form.shares).toBe(40.2598);
      expect(addButtons(fixture)[0].getAttribute('aria-expanded')).toBe('true');
      expect(page(fixture).querySelector('tr.form-row td')!.getAttribute('colspan')).withContext('across the whole table').toBe('10');
    });

    // Found by a review of the page: "Add" on a second row closed the first row's form and dropped what was typed
    // in it, without a word.
    it('gives a row its form back as it was left when another row\'s was opened in between, and forgets it on Cancel', fakeAsync(() => {
      const fixture = withPrices();
      add(fixture, 0);
      const first = forms(fixture)[0];
      first.shares = 7;
      first.changed();
      add(fixture, 1);
      expect(forms(fixture).map(form => form.symbol)).toEqual(['ZED']);
      add(fixture, 0);
      const back = forms(fixture)[0];
      expect([back.symbol, back.shares]).withContext('as it was left').toEqual(['ACME', 7]);
      fixture.detectChanges();
      expect(say(page(fixture).querySelector('app-purchase-form .intro'))).toBe('This is what you typed before. Cancel starts again from the row.');
      back.cancel.emit();
      fixture.detectChanges();
      flush();
      add(fixture, 0);
      expect(forms(fixture)[0].shares).withContext('after Cancel: from the row again').toBe(40.2598);
    }));

    // The owner asked which stocks move together, and then for the same letters here, where the stocks to buy
    // are ticked.
    describe('which of the stocks move together', () => {
      const TIED = {groups: [{letter: 'A', index: 0, symbols: ['ACME', 'ZED'], level: 0.7, sector: ''}], alone: [], unknown: []};

      it('gives each row the letter of its group, in a column of its own after the stock', () => {
        const fixture = withPrices();
        fixture.componentRef.setInput('tied', TIED);
        fixture.detectChanges();
        expect(headings(fixture).slice(0, 2)).toEqual(['Stock', 'Group']);
        expect(Array.from(page(fixture).querySelectorAll('tbody td.group-cell')).map(say)).toEqual(['A', 'A']);
        expect(page(fixture).querySelector('td.group-cell .tied-tag')!.getAttribute('aria-label')).toBe('Group A');
      });

      // The tag's class once was "group", the class of the row that heads the owned stocks: that row lost its layout.
      it('leaves the row that heads the owned stocks a row of the table, across all of it', () => {
        const fixture = withPrices({additions: [{symbol: 'CCC', sharePercent: 4, dollars: 400, loss: 124, gain: 224, capped: false}] as never});
        fixture.componentRef.setInput('tied', TIED);
        fixture.detectChanges();
        const head = page(fixture).querySelector<HTMLElement>('tbody tr.group');
        if (head) {
          expect(getComputedStyle(head).display).toBe('table-row');
        }
        expect(page(fixture).querySelectorAll('.tied-tag').length).toBeGreaterThan(0);
      });

      // The owner: "group should be sortable column everywhere" and "all tables must have sortable columns".
      it('orders the rows by "Group" on a click on it, turns them round on the next, and gives A to Z back on "Stock"', () => {
        const fixture = withPrices({recommendations: [ACME, {...ACME, symbol: 'MID'}, ZED]});
        fixture.componentRef.setInput('tied', TIED);
        fixture.detectChanges();
        const order = () => Array.from(page(fixture).querySelectorAll('tbody tr[data-row]')).map(row => row.getAttribute('data-row'));
        const heading = (name: string) => Array.from(page(fixture).querySelectorAll<HTMLButtonElement>('thead th button')).find(it => say(it) === name)!;
        expect(order()).withContext('as given, A to Z, until a heading is clicked').toEqual(['ACME', 'MID', 'ZED']);
        heading('Group').click();
        fixture.detectChanges();
        expect(order()).withContext('ACME and ZED are group A; MID is in none').toEqual(['ACME', 'ZED', 'MID']);
        expect(heading('Group').closest('th')!.getAttribute('aria-sort')).toBe('ascending');
        heading('Group').click();
        fixture.detectChanges();
        expect(order()).toEqual(['MID', 'ACME', 'ZED']);
        heading('Stock').click();
        fixture.detectChanges();
        expect(order()).toEqual(['ACME', 'MID', 'ZED']);
      });

      it('orders the rows by a column of figures: the biggest first, and the other way on the next click', () => {
        const fixture = withPrices();
        const order = () => Array.from(page(fixture).querySelectorAll('tbody tr[data-row]')).map(row => row.getAttribute('data-row'));
        const heading = (name: string) => Array.from(page(fixture).querySelectorAll<HTMLButtonElement>('thead th button')).find(it => say(it) === name)!;
        expect(Array.from(page(fixture).querySelectorAll('thead th button')).map(say).slice(0, 5)).toEqual(['Stock', 'Size', 'Bad case', 'Typical', 'Good case']);
        heading('Size').click();
        fixture.detectChanges();
        expect(order()).withContext('ACME is sized 20.1%, ZED 12.2%').toEqual(['ACME', 'ZED']);
        expect(heading('Size').closest('th')!.getAttribute('aria-sort')).toBe('descending');
        heading('Size').click();
        fixture.detectChanges();
        expect(order()).toEqual(['ZED', 'ACME']);
        heading('Bad case').click();
        fixture.detectChanges();
        expect(order()).withContext('the biggest loss first: ACME could lose $825, ZED $378').toEqual(['ACME', 'ZED']);
      });

      // "The first row" is true of the example only while its stock stands first.
      it('names the example\'s row and no place once an order has put another stock first', () => {
        const fixture = withPrices();
        const title = () => say(page(fixture).querySelector('.reading-title')).replace(/\s*more.*$/, '');
        const heading = (name: string) => Array.from(page(fixture).querySelectorAll<HTMLButtonElement>('thead th button')).find(it => say(it) === name)!;
        expect(title()).toBe('For example, the first row: ACME');
        heading('Size').click();
        fixture.detectChanges();
        expect(title()).withContext('ACME is still first by size').toBe('For example, the first row: ACME');
        heading('Size').click();
        fixture.detectChanges();
        expect(title()).withContext('ZED is first now').toBe('For example, the row of ACME');
      });

      it('says under the table that an order is the reader\'s own view, and what the letters of "Group" are', () => {
        const fixture = withPrices();
        fixture.componentRef.setInput('tied', TIED);
        fixture.detectChanges();
        expect(say(page(fixture).querySelector('.about .about-body .order-note'))).withContext('with the explanations of the table').toBe(
          'A click on a heading orders the rows by its column, and a second click turns the order round. That is your own view of them: the page ranks nothing.');
        expect(page(fixture).querySelector('.table-scroll .order-note')).withContext('not a sentence in sight').toBeNull();
        expect(Array.from(page(fixture).querySelectorAll('.about .note')).map(say).some(text => text.startsWith('Stocks with the same letter moved closely together'))).toBeTrue();
      });

      it('gives the bad half-year of the split beside the instruction, with the rest of the answer to a tick', () => {
        const fixture = withPrices();
        tick(fixture, 'ACME');
        expect(facts(fixture)[facts(fixture).length - 1]).toEqual(['Bad half-year, every marked stock at once', '−$2,790 today, −$3,200 after']);
        expect(fixture.componentInstance.badCaseSays).not.toBe('');
      });

      it('has no such column while no stock of the table is in a group', () => {
        expect(page(withPrices()).querySelector('th.group-head')).toBeNull();
      });

      it('takes every tick off at once on "Untick all"', () => {
        const fixture = withPrices();
        tick(fixture, 'ACME');
        tick(fixture, 'ZED');
        page(fixture).querySelector<HTMLButtonElement>('.tick-answer .untick')!.click();
        fixture.detectChanges();
        expect(Array.from(page(fixture).querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')).some(box => box.checked)).toBeFalse();
        expect(page(fixture).querySelector('.tick-answer .untick')).toBeNull();
      });

      it('keeps the lead whole among the explanations: it is not cut after its first sentence', () => {
        const fixture = withPrices();
        expect(page(fixture).querySelector('p.lead app-more')).toBeNull();
        expect(say(page(fixture).querySelector('p.lead'))).toContain('The page ranks none of them');
      });

      it('keeps each note whole behind the one control: no "more" of its own', () => {
        const fixture = withPrices();
        expect(page(fixture).querySelectorAll('.about .about-body p.note').length).toBeGreaterThan(1);
        expect(page(fixture).querySelector('.about app-more')).toBeNull();
      });

      it('still has no column of groups when none is given', () => {
        expect(page(withPrices()).querySelector('td.group-cell')).toBeNull();
      });

      it('says of two ticked stocks of one group that they moved together, with the lines about what they would change', () => {
        const fixture = withPrices();
        fixture.componentRef.setInput('tied', TIED);
        tick(fixture, 'ACME');
        expect(page(fixture).querySelector('.split .tied-says')).withContext('one stock has no other to move with').toBeNull();
        tick(fixture, 'ZED');
        expect(say(page(fixture).querySelector('.split .tied-says'))).toBe(
          'ACME and ZED are both in group A: over the past year they moved closely together.');
        expect(facts(fixture)[facts(fixture).length - 1]).withContext('beside the instruction, as a figure').toEqual(['Moved together', 'ACME and ZED (group A)']);
      });
    });

    // Found by a review of the page: unticking a row while the form for the ticked stocks was open (two becoming
    // one) closed the form and dropped what was typed in it.
    it('keeps the form for the ticked stocks open, with what was typed, when a row is unticked down to one', () => {
      const fixture = withPrices();
      tick(fixture, 'ACME');
      tick(fixture, 'ZED');
      page(fixture).querySelector<HTMLButtonElement>('.tick-answer button.batch')!.click();
      fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(PurchasesFormComponent)).componentInstance as PurchasesFormComponent;
      form.rows[0].shares = 7;
      form.changed();
      tick(fixture, 'ZED');
      const still = fixture.debugElement.query(By.directive(PurchasesFormComponent));
      expect(still).withContext('the form is still there').not.toBeNull();
      expect((still.componentInstance as PurchasesFormComponent).rows.map(row => [row.symbol, row.shares])).toEqual([['ACME', 7]]);
    });

    it('hands the forms the name of the portfolio they record into', () => {
      const fixture = withPrices();
      add(fixture, 0);
      expect(forms(fixture)[0].portfolio).toBe('Brokerage');
    });

    it('starts from what the cash gives the stock once the row is ticked: the amount the reader sees beside it', () => {
      const fixture = withPrices();
      tick(fixture, 'ACME');
      add(fixture, 0);
      expect(forms(fixture)[0].dollars).toBeCloseTo(1000, 6);
      expect(forms(fixture)[0].shares).toBe(20);
    });

    // After Esc or Cancel the keyboard was on nothing. It goes back to the button the form was opened with.
    it('puts the keyboard back on "Add" when a row\'s form is cancelled, and on the button for several when theirs is', fakeAsync(() => {
      const fixture = withPrices();
      add(fixture, 1);
      forms(fixture)[0].cancel.emit();
      fixture.detectChanges();
      tick$();
      expect(document.activeElement).toBe(addButtons(fixture)[1]);

      tick(fixture, 'ACME');
      tick(fixture, 'ZED');
      const several = () => page(fixture).querySelector<HTMLButtonElement>('.tick-answer button.batch')!;
      several().click();
      fixture.detectChanges();
      fixture.debugElement.query(By.directive(PurchasesFormComponent)).componentInstance.cancel.emit();
      fixture.detectChanges();
      tick$();
      expect(document.activeElement).toBe(several());
      flush();
    }));

    it('shows one form at a time, and closes it on a second click or on Cancel', () => {
      const fixture = withPrices();
      add(fixture, 0);
      add(fixture, 1);
      expect(forms(fixture).map(form => form.symbol)).toEqual(['ZED']);
      add(fixture, 1);
      expect(forms(fixture)).toEqual([]);
      add(fixture, 0);
      forms(fixture)[0].cancel.emit();
      fixture.detectChanges();
      expect(forms(fixture)).toEqual([]);
    });

    it('adds the purchase to what is held of a stock that is owned', () => {
      const held = {symbol: 'CCC', shares: 30, price: 90};
      const fixture = withPrices({additions: [MORE_CCC], positions: {CCC: held}});
      add(fixture, 2);
      expect(forms(fixture)[0].held).toEqual(held);
      expect(forms(fixture)[0].dollars).toBe(400);
    });

    it('hands the saved purchase to the page and closes the form', () => {
      const fixture = withPrices();
      const trades: Trade[] = [];
      fixture.componentInstance.trade.subscribe(trade => trades.push(trade));
      add(fixture, 1);
      forms(fixture)[0].viaCash = false;   // $1,220 is more than the $1,000 of cash: paid with other money
      forms(fixture)[0].submit();
      fixture.detectChanges();
      expect(trades.map(trade => trade.text)).toEqual(['Added 61 shares of ZED at 20.00.']);
      expect(forms(fixture)).toEqual([]);
    });

    // The stocks ticked are the ones the reader said they were thinking of buying: after buying them, each had to
    // be recorded in a form of its own. With two or more ticked one form for all is offered, by a button that
    // stands with the answer to a tick (one button, not a second at the foot of the table); the form itself opens
    // at the foot of the table.
    describe('the ticked stocks, recorded together', () => {
      const batchButton = (fixture: ComponentFixture<CouldAddComponent>) => page(fixture).querySelector<HTMLButtonElement>('.tick-answer button.batch');
      const batch = (fixture: ComponentFixture<CouldAddComponent>) =>
        fixture.debugElement.query(By.directive(PurchasesFormComponent))?.componentInstance as PurchasesFormComponent | undefined;

      it('is offered with the answer to a tick once two rows are ticked, and not for one', () => {
        const fixture = withPrices();
        expect(batchButton(fixture)).toBeNull();
        tick(fixture, 'ACME');
        expect(batchButton(fixture)).withContext('one ticked: its own "Add" does it').toBeNull();
        tick(fixture, 'ZED');
        expect(say(batchButton(fixture))).toBe('Add the 2 ticked');
        expect(batchButton(fixture)!.getAttribute('aria-label')).toBe('Add the 2 ticked: record purchases you made');
        expect(page(fixture).querySelectorAll('button.batch').length).withContext('one button, not a second at the foot of the table').toBe(1);
        expect(page(fixture).querySelector('tfoot')).withContext('the foot of the table is there for the form only').toBeNull();
        batchButton(fixture)!.click();
        fixture.detectChanges();
        expect(page(fixture).querySelector('tfoot td')!.getAttribute('colspan')).withContext('the form: across the whole table').toBe('10');
        expect(page(fixture).querySelectorAll('button.batch').length).toBe(1);
      });

      it('opens one form with a line for each ticked stock, starting from what the cash gives each', () => {
        const fixture = withPrices({additions: [MORE_CCC], positions: {CCC: {symbol: 'CCC', shares: 30, price: 90}}});
        tick(fixture, 'ACME');
        tick(fixture, 'CCC');
        batchButton(fixture)!.click();
        fixture.detectChanges();
        const form = batch(fixture)!;
        expect(form.lines.map(line => line.symbol)).toEqual(['ACME', 'CCC']);
        expect(form.lines.map(line => line.price)).toEqual([50, 100]);
        expect(form.lines[1].held).withContext('what is held of the stock that is owned').toEqual({symbol: 'CCC', shares: 30, price: 90});
        expect(form.lines.every(line => (line.dollars ?? 0) > 0)).withContext('each starts from an amount').toBeTrue();
        expect(form.lines[0].dollars).withContext('ACME: what the cash gives it, not its whole size').toBeLessThan(2012.99);
        expect([form.today, form.cash]).toEqual(['2026-11-21', 1000]);
        expect(batchButton(fixture)!.getAttribute('aria-expanded')).toBe('true');
      });

      it('hands both forms what the user keeps outside stocks, so that each can say when a purchase goes under it', () => {
        const fixture = withPrices({keep: 300});
        tick(fixture, 'ACME');
        tick(fixture, 'ZED');
        add(fixture, 0);
        expect(forms(fixture)[0].keep).toBe(300);
        batchButton(fixture)!.click();
        fixture.detectChanges();
        expect(batch(fixture)!.keep).toBe(300);
      });

      it('closes a row\'s own form when it opens, and the other way round', () => {
        const fixture = withPrices();
        tick(fixture, 'ACME');
        tick(fixture, 'ZED');
        add(fixture, 0);
        batchButton(fixture)!.click();
        fixture.detectChanges();
        expect(forms(fixture)).toEqual([]);
        expect(batch(fixture)).toBeDefined();
        add(fixture, 1);
        expect(batch(fixture)).toBeUndefined();
        expect(forms(fixture).map(form => form.symbol)).toEqual(['ZED']);
      });

      it('hands the saved purchases to the page together and closes', () => {
        const fixture = withPrices();
        const sent: Trade[][] = [];
        fixture.componentInstance.trades.subscribe(trades => sent.push(trades));
        tick(fixture, 'ACME');
        tick(fixture, 'ZED');
        batchButton(fixture)!.click();
        fixture.detectChanges();
        batch(fixture)!.submit();
        fixture.detectChanges();
        expect(sent.length).toBe(1);
        expect(sent[0].map(trade => trade.symbol)).toEqual(['ACME', 'ZED']);
        expect(batch(fixture)).toBeUndefined();
      });

      it('goes away when a tick is taken off and fewer than two are left', () => {
        const fixture = withPrices();
        tick(fixture, 'ACME');
        tick(fixture, 'ZED');
        batchButton(fixture)!.click();
        fixture.detectChanges();
        tick(fixture, 'ZED');
        expect(batch(fixture)).toBeUndefined();
        expect(batchButton(fixture)).toBeNull();
      });
    });

    it('forgets a purchase being entered when another portfolio is shown', () => {
      const fixture = withPrices({portfolioId: 'p1'});
      add(fixture, 0);
      fixture.componentRef.setInput('portfolioId', 'p2');
      fixture.detectChanges();
      expect(forms(fixture)).toEqual([]);
    });
  });
});
