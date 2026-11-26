import {ComponentFixture, TestBed} from "@angular/core/testing";
import {By} from "@angular/platform-browser";
import {MatTooltip} from "@angular/material/tooltip";
import {FactCell, FactKey, sideBySide, StockCase} from "../case-against";
import {CompareTickedComponent} from "./compare-ticked.component";

// The owner of the page, of the stocks in "Could add": "there should be some sort of way of comparing them against
// each other". The ticked stocks stand side by side here, a column a stock and a row a fact.

/** A case that says only these facts; a fact given as a pair has a sentence behind it, one given whole is taken as it is. */
function saying(facts: Partial<Record<FactKey, string | [string, string] | FactCell>>): StockCase {
  const cell = (said: string | [string, string] | FactCell): FactCell =>
    typeof said === 'string' ? {value: said} : Array.isArray(said) ? {value: said[0], tip: said[1]} : said;
  return {
    swings: '', beyondTests: false, swingsTip: '', against: [], againstTip: '',
    facts: Object.fromEntries(Object.entries(facts).map(([key, said]) => [key, cell(said!)])),
  };
}

const ACME = saying({dropped: '−38%', swings: '47% a year · volatile', profit: 'yes', bigDay: '−10.9% on Mar 20'});
const BOLT = saying({
  dropped: '−48%', swings: '47% a year · volatile', profit: ['no', 'Not profitable: profit per share over the past year -2.25.'],
  debt: ['3.0 times · high', 'High debt: it owes 3.00 times what belongs to its owners.'],
});

function create(stocks: { symbol: string, case: StockCase | undefined }[], names: Record<string, string> = {}): ComponentFixture<CompareTickedComponent> {
  const fixture = TestBed.createComponent(CompareTickedComponent);
  fixture.componentRef.setInput('comparison', sideBySide(stocks));
  fixture.componentRef.setInput('names', names);
  fixture.detectChanges();
  return fixture;
}

const say = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const two = [{symbol: 'ACME', case: ACME}, {symbol: 'BOLT', case: BOLT}];

describe('CompareTickedComponent (the ticked stocks of "Could add", side by side)', () => {
  beforeEach(() => TestBed.configureTestingModule({imports: [CompareTickedComponent]}));

  it('shows nothing while no stock is ticked', () => {
    const el: HTMLElement = create([]).nativeElement;
    expect(el.querySelector('table')).toBeNull();
    expect(say(el)).toBe('');
  });

  it('has a title that counts the stocks', () => {
    const el: HTMLElement = create(two).nativeElement;
    expect(say(el.querySelector('h3'))).toBe('2 ticked stocks, side by side');
    expect(el.querySelector('section.compare')!.getAttribute('aria-label')).toBe('2 ticked stocks, side by side');
  });

  // Seen on the page: one table of twenty rows was a tall, narrow strip in a box four times as wide. A part is a
  // small table of its own, so that the parts stand beside each other where the box has the room.
  it('keeps what was tested apart from the context and from why the price dropped: a table a part, under its name', () => {
    const fixture = create(two);
    const titles = fixture.debugElement.queryAll(By.css('table.part thead th.part-title'));
    expect(titles.map(title => say(title.nativeElement))).toEqual(['Tested', 'Context', 'Why it dropped']);
    expect(titles.map(title => title.injector.get(MatTooltip).message)).withContext('what a part is, where the pointer rests on its name').toEqual([
      'what the mark rests on, and what stocks that swing like it did in tests',
      'not part of the mark: no test could use it, or it made no difference',
      '',
    ]);
  });

  it('has a column a stock under its symbol in every part, so that a part can be read by itself', () => {
    const el: HTMLElement = create(two).nativeElement;
    const heads = Array.from(el.querySelectorAll('table.part')).map(part => Array.from(part.querySelectorAll('thead th:not(.part-title)')).map(say));
    expect(heads).toEqual([['ACME', 'BOLT'], ['ACME', 'BOLT'], ['ACME', 'BOLT']]);
  });

  it('gives every part the same columns, as wide as the number of stocks needs', () => {
    const el: HTMLElement = create(two).nativeElement;
    expect((el.querySelector('section.compare') as HTMLElement).style.getPropertyValue('--stocks')).toBe('2');
    const widths = Array.from(el.querySelectorAll('table.part')).map(part => Math.round(part.getBoundingClientRect().width));
    expect(widths[0]).toBeGreaterThan(400);
    expect(widths).withContext('one under the other, a stock stays in its column').toEqual([widths[0], widths[0], widths[0]]);
  });

  it('prints a row a fact: its name, then what each stock says, and a dash where the page does not know', () => {
    const el: HTMLElement = create(two).nativeElement;
    const rows = Array.from(el.querySelectorAll('tbody tr')).map(row => Array.from(row.children).map(say));
    expect(rows).toEqual([
      ['Dropped', '−38%', '−48%'],
      ['Swings', '47% a year · volatile', '47% a year · volatile'],
      ['Makes a profit', 'yes', 'no'],
      ['Debt', '—', '3.0 times · high'],
      ['Biggest one-day fall', '−10.9% on Mar 20', '—'],
    ]);
    expect(el.querySelectorAll('tbody tr th[scope="row"]').length).withContext('a row is named by a heading cell').toBe(5);
  });

  it('lets a row step back where every stock says the same, so that what differs stands out', () => {
    const el: HTMLElement = create(two).nativeElement;
    expect(Array.from(el.querySelectorAll('tbody tr.same')).map(row => say(row.querySelector('th')))).toEqual(['Swings']);
  });

  it('says what a fact is where the pointer rests on its name, and a stock\'s own sentence on its cell', () => {
    const fixture = create(two);
    const debt = fixture.debugElement.queryAll(By.css('tbody tr'))[3];
    expect(debt.query(By.css('th')).injector.get(MatTooltip).message).toContain('debt/equity');
    expect(debt.queryAll(By.css('td')).map(cell => cell.injector.get(MatTooltip).message))
      .toEqual(['', 'High debt: it owes 3.00 times what belongs to its owners.']);
  });

  // The owner, of what stands in "Against": "I want that in red so that we know it's a "no no"".
  it('sets a cell that speaks against a stock in red, and says so to a screen reader', () => {
    const risky: StockCase = {...BOLT, facts: {...BOLT.facts, profit: {value: 'no', against: true}}};
    const el: HTMLElement = create([{symbol: 'ACME', case: ACME}, {symbol: 'BOLT', case: risky}]).nativeElement;
    const cells = Array.from(el.querySelectorAll('table.part:nth-of-type(2) tbody tr:first-child td')) as HTMLElement[];
    expect(cells.map(say)).toEqual(['yes', 'no (speaks against it)']);
    expect(cells.map(cell => cell.classList.contains('against'))).toEqual([false, true]);
    expect(getComputedStyle(cells[1]).color).withContext('the page\'s red').toBe('rgb(198, 40, 40)');
    expect(getComputedStyle(cells[0]).color).not.toBe('rgb(198, 40, 40)');
    const hidden = getComputedStyle(cells[1].querySelector('span')!);
    expect([hidden.position, hidden.width]).withContext('the words are for a screen reader').toEqual(['absolute', '1px']);
  });

  it('keeps the red where every stock has the same word against it: a row set back is not a row excused', () => {
    const both = {...ACME, facts: {...ACME.facts, profit: {value: 'no', against: true}}};
    const el: HTMLElement = create([{symbol: 'ACME', case: both}, {symbol: 'BOLT', case: {...BOLT, facts: {...BOLT.facts, profit: {value: 'no', against: true}}}}]).nativeElement;
    const row = el.querySelector('table.part:nth-of-type(2) tbody tr:first-child')!;
    expect(row.classList.contains('same')).toBeTrue();
    expect(Array.from(row.querySelectorAll('td')).map(cell => getComputedStyle(cell).color)).toEqual(['rgb(198, 40, 40)', 'rgb(198, 40, 40)']);
  });

  // The owner, of the block: "highlight the winers so that it's easy to pick".
  it('sets the best of the ticked stocks in a row in green, and says so to a screen reader', () => {
    const calm = saying({swings: {value: '33% a year · calm', n: 33}, debt: {value: '0.6 times', n: 0.6}});
    const wild = saying({swings: {value: '88% a year · volatile', n: 88}, debt: {value: '0.1 times', n: 0.1}});
    const el: HTMLElement = create([{symbol: 'ACME', case: calm}, {symbol: 'BOLT', case: wild}]).nativeElement;
    const rows = Array.from(el.querySelectorAll('tbody tr')).map(row => Array.from(row.querySelectorAll('td')) as HTMLElement[]);
    expect(rows.map(cells => cells.map(say))).toEqual([
      ['33% a year · calm (best of the ticked)', '88% a year · volatile'],
      ['0.6 times', '0.1 times (best of the ticked)'],
    ]);
    expect(rows.map(cells => cells.map(cell => cell.classList.contains('best')))).toEqual([[true, false], [false, true]]);
    expect(rows.map(cells => cells.map(cell => getComputedStyle(cell).color === 'rgb(27, 127, 75)')))
      .withContext('the page\'s green').toEqual([[true, false], [false, true]]);
    expect(getComputedStyle(rows[0][0]).fontWeight).withContext('and heavier: it does not rest on the colour').toBe('600');
    const hidden = getComputedStyle(rows[0][0].querySelector('span')!);
    expect([hidden.position, hidden.width]).withContext('the words are for a screen reader').toEqual(['absolute', '1px']);
  });

  it('opens a stock from its symbol, and says the company\'s name under the pointer', () => {
    const fixture = create(two, {ACME: 'Acme Tools Inc'});
    const opened: string[] = [];
    fixture.componentInstance.open.subscribe(symbol => opened.push(symbol));
    const buttons = fixture.debugElement.query(By.css('table.part')).queryAll(By.css('thead button.symbol'));
    expect(buttons.map(button => button.injector.get(MatTooltip).message)).toEqual(['Acme Tools Inc', '']);
    expect(buttons[1].nativeElement.getAttribute('aria-label')).toBe('Open details for BOLT');
    buttons[1].nativeElement.click();
    expect(opened).toEqual(['BOLT']);
  });

  it('stops the Tab key once a stock: on the symbols of the first part, not on their repeats', () => {
    const el: HTMLElement = create(two).nativeElement;
    const stops = Array.from(el.querySelectorAll('table.part')).map(part =>
      Array.from(part.querySelectorAll('thead button.symbol')).map(button => button.getAttribute('tabindex')));
    expect(stops).toEqual([[null, null], ['-1', '-1'], ['-1', '-1']]);
  });

  it('says to the keyboard on a symbol what that stock\'s cells say to a pointer, in every part', () => {
    const fixture = create(two, {BOLT: 'Bolt Motors Inc'});
    const button = fixture.debugElement.queryAll(By.css('thead button.symbol'))[1];
    spyOn(button.nativeElement, 'matches').and.callFake((selector: string) => selector === ':focus-visible');
    button.triggerEventHandler('focus', {target: button.nativeElement});
    fixture.detectChanges();
    expect(button.injector.get(MatTooltip).message.split('\n')).toEqual([
      'Bolt Motors Inc',
      'Makes a profit: Not profitable: profit per share over the past year -2.25.',
      'Debt: High debt: it owes 3.00 times what belongs to its owners.',
    ]);
    button.triggerEventHandler('blur', {});
    fixture.detectChanges();
    expect(button.injector.get(MatTooltip).message).withContext('the name alone again').toBe('Bolt Motors Inc');
  });

  it('names each table for a screen reader, out of sight: its part, and what the part is', () => {
    const captions = Array.from(create(two).nativeElement.querySelectorAll('table.part caption')) as HTMLElement[];
    expect(captions.map(say)).toEqual([
      'Tested (what the mark rests on, and what stocks that swing like it did in tests)',
      'Context (not part of the mark: no test could use it, or it made no difference)',
      'Why it dropped',
    ]);
    // Found on the page: a caption stood in sight under the title. The class that hides it is each component's own.
    const style = getComputedStyle(captions[0]);
    expect([style.position, style.width, style.height, style.overflow]).toEqual(['absolute', '1px', '1px', 'hidden']);
  });

  it('shows one stock alone, fact by fact, with no row set back', () => {
    const el: HTMLElement = create([{symbol: 'ACME', case: ACME}]).nativeElement;
    expect(say(el.querySelector('h3'))).toBe('ACME, fact by fact');
    expect(el.querySelectorAll('tbody tr.same').length).toBe(0);
    expect(el.querySelectorAll('tbody tr').length).toBe(4);
  });
});
