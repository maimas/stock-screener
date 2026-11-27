import {ComponentFixture, fakeAsync, flush, TestBed} from "@angular/core/testing";
import {HttpClientTestingModule} from "@angular/common/http/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {By} from "@angular/platform-browser";
import {WatchlistTableComponent} from "./watchlist-table.component";
import {SmartTableComponent} from "../dashboard/dashboard-components/smart-table/smart-table.component";
import {ClaudeAskComponent} from "./claude-ask/claude-ask.component";
import {ClaudeViewCellComponent} from "./cells/claude-view/claude-view-cell.component";
import {ClaudeViewService} from "./claude-view.service";
import {ReadingService} from "./reading.service";
import {FakeClaudeViews} from "./testing/fake-claude-views";
import {FakeReadings} from "./testing/fake-readings";
import {flatCloses, makeStock, reportedQuarters} from "./testing/fixtures";

// The owner, with a picture of the Watchlist ("Dip candidates" as a pane beside the lists): "maybe that can be a
// table on the top where it becomes a table like the other ones but more polished in terms of prose", and "go" to a
// sketch: the stocks marked DIP BUY in the lists' own table at the top of the Watchlist, with the lists' columns,
// the AI column, details in place, and a column that says which list a stock is in.
describe('WatchlistTableComponent: the stocks marked DIP BUY as a table at the top of the Watchlist', () => {
  let fixture: ComponentFixture<WatchlistTableComponent>;

  const quarters = reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120});
  /** A growing company 20% below its highest price of the past year: marked DIP BUY. */
  const marked = (symbol: string) => makeStock({symbol, price: 80, high52: 100, quarters, closes: flatCloses(250, 80)});
  /** The same company 1% below it: no DIP BUY. */
  const unmarked = (symbol: string) => makeStock({symbol, price: 99, high52: 100, quarters, closes: flatCloses(250, 99)});

  const page = () => fixture.componentInstance;
  const el = (): HTMLElement => fixture.nativeElement;
  const say = (it: Element | null | undefined) => (it?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const box = () => el().querySelector<HTMLElement>('.view-watchlist > app-dip-candidates')!;
  const headings = (within: Element) => Array.from(within.querySelectorAll('th')).map(say).filter(Boolean);
  const symbols = (within: Element) =>
    Array.from(within.querySelectorAll('tr.main-row [data-symbol]')).map(it => it.getAttribute('data-symbol'));

  /** The page works out what is marked again, as it does when prices arrive. */
  function summed(): void {
    (page() as unknown as { refreshSummary(): void }).refreshSummary();
    fixture.detectChanges();
  }

  /** Two of the reader's lists and a stock held outside every list, with their prices in. */
  function load(first: string[] = ['WXYZ', 'EFGH', 'ABCD'], second: string[] = ['MNOP'], held: string[] = ['HELD']): void {
    const [one, two] = page().watchLists;
    const rows = (names: string[]) => names.map(name => name === 'WXYZ' ? unmarked(name) : marked(name));
    one.symbols = first;
    one.dataSource.data = rows(first);
    one.state = 'ready';
    two.symbols = second;
    two.dataSource.data = rows(second);
    two.state = 'ready';
    page().heldOutside.symbols = held;
    page().heldOutside.dataSource.data = rows(held);
    page().heldOutside.state = 'ready';
    page().shownLists = held.length ? [...page().watchLists, page().heldOutside] : page().watchLists;
    summed();
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [WatchlistTableComponent, HttpClientTestingModule, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: new FakeClaudeViews()}, {provide: ReadingService, useValue: new FakeReadings()}],
    });
    fixture = TestBed.createComponent(WatchlistTableComponent);
    fixture.componentRef.setInput('shows', 'watchlist');
    fixture.detectChanges();
  });

  it('shows every stock marked DIP BUY in one table inside the box, A to Z, whichever list it is in', () => {
    load();
    expect(box().querySelectorAll('app-smart-table').length).toBe(1);
    expect(box().querySelector('mat-card .stocks app-smart-table')).withContext('inside the box, under its three lines').not.toBeNull();
    expect(symbols(box())).toEqual(['ABCD', 'EFGH', 'HELD', 'MNOP']);
    expect(box().querySelector('table')!.getAttribute('aria-label')).toBe('Dip candidates');
  });

  it('is built like the lists\' tables: their columns in their order, and one more that says the list', () => {
    load();
    const list = el().querySelector('.lists > section.list')!;
    const mine = headings(box());
    expect(mine.filter(it => it !== 'List')).toEqual(headings(list));
    expect(mine).toContain('List');
    expect(headings(list)).not.toContain('List');
    page().setView('all');
    fixture.detectChanges();
    expect(headings(box()).filter(it => it !== 'List')).withContext('with every column too').toEqual(headings(list));
    expect(headings(box())).toContain('List');
  });

  it('says in the column "List" which of the reader\'s lists each stock is in', () => {
    load();
    const [one, two] = page().watchLists;
    const cells = Array.from(box().querySelectorAll('tr.main-row td.mat-column-list')).map(say);
    expect(cells).toEqual([one.title, one.title, page().heldOutside.title, two.title]);
  });

  it('names both lists of a stock that is in two of them', () => {
    load(['ABCD'], ['ABCD'], []);
    const [one, two] = page().watchLists;
    expect(symbols(box())).withContext('one row a stock').toEqual(['ABCD']);
    expect(say(box().querySelector('tr.main-row td.mat-column-list'))).toBe(`${one.title}, ${two.title}`);
  });

  it('opens a stock\'s details where its row stands, in the top table, and leaves its row in the list closed', () => {
    load();
    box().querySelector<HTMLButtonElement>('button.toggle[aria-label="Show details for ABCD"]')!.click();
    fixture.detectChanges();
    expect(box().querySelector('tr.detail-row.open[data-detail="ABCD"] app-signal-detail')).not.toBeNull();
    expect(el().querySelector('.lists tr.detail-row.open')).toBeNull();
    expect(page().openDetails).toBe(1);
  });

  it('opens a stock that is looked for ("Find a stock", the plan, the address) in its own list, not in the top table', fakeAsync(() => {
    load();
    page().findText = 'ABCD';
    page().findStock();
    fixture.detectChanges();
    flush();
    expect(el().querySelector('.lists tr.detail-row.open[data-detail="ABCD"]')).not.toBeNull();
    expect(box().querySelector('tr.detail-row.open')).toBeNull();
    const row = el().querySelector('.lists [data-symbol="ABCD"]')!.closest('tr')!;
    expect(document.activeElement).withContext('the keyboard goes to the row in the list').toBe(row.querySelector('button.toggle'));
  }));

  it('puts the keyboard back on the row in the top table when details opened there are closed at their foot', fakeAsync(() => {
    load();
    const toggle = () => box().querySelector<HTMLButtonElement>('button.toggle[aria-label$="details for ABCD"]')!;
    toggle().click();
    fixture.detectChanges();
    box().querySelector<HTMLElement>('tr.detail-row.open[data-detail="ABCD"] button')!.focus();
    page().closeStock(page().watchLists[0].dataSource.data.find(it => it.quote?.symbol === 'ABCD')!);
    fixture.detectChanges();
    flush();
    expect(box().querySelector('tr.detail-row.open')).toBeNull();
    expect(document.activeElement).toBe(toggle());
  }));

  // The stock's row in the top table comes first on the page: a search of the whole page for its row would put the
  // keyboard there, a screen away from the list the reader was in.
  it('puts the keyboard back on the row in the list when details opened there are closed at their foot', fakeAsync(() => {
    load();
    const lists = () => el().querySelector<HTMLElement>('.lists')!;
    const toggle = () => lists().querySelector<HTMLButtonElement>('button.toggle[aria-label$="details for ABCD"]')!;
    toggle().click();
    fixture.detectChanges();
    lists().querySelector<HTMLElement>('tr.detail-row.open[data-detail="ABCD"] button')!.focus();
    page().closeStock(page().watchLists[0].dataSource.data.find(it => it.quote?.symbol === 'ABCD')!);
    fixture.detectChanges();
    flush();
    expect(el().querySelector('tr.detail-row.open')).toBeNull();
    expect(document.activeElement).withContext('the row in the list, not the one at the top').toBe(toggle());
  }));

  it('goes back to the table the details were open in when the keyboard was elsewhere (Esc from the page)', fakeAsync(() => {
    load();
    const lists = () => el().querySelector<HTMLElement>('.lists')!;
    const toggle = () => lists().querySelector<HTMLButtonElement>('button.toggle[aria-label$="details for ABCD"]')!;
    toggle().click();
    fixture.detectChanges();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).withContext('the keyboard in no table').toBe(document.body);
    page().closeStock(page().watchLists[0].dataSource.data.find(it => it.quote?.symbol === 'ABCD')!);
    fixture.detectChanges();
    flush();
    expect(document.activeElement).toBe(toggle());
  }));

  // The lists are ordered together (a click on a heading in one orders them all). The top table is not one of
  // them: it starts A to Z, as the box always showed its stocks, and an order given to it is its own.
  it('keeps an order of its own: the lists\' order leaves it A to Z, and its order leaves the lists as they are', () => {
    load();
    const tables = fixture.debugElement.queryAll(By.directive(SmartTableComponent)).map(it => it.componentInstance as SmartTableComponent);
    const [top, firstList] = tables;
    expect([top.sort!.active, top.sort!.direction]).toEqual(['symbol', 'asc']);
    page().sortLists({active: 'price', direction: 'asc'});
    fixture.detectChanges();
    expect(firstList.sort!.active).toBe('price');
    expect(top.sort!.active).withContext('the top table is not ordered with the lists').toBe('symbol');

    page().orderByMark();
    top.sort!.sort({id: 'price', start: 'desc', disableClear: true});
    fixture.detectChanges();
    expect(top.sort!.active).toBe('price');
    expect(page().listSort).withContext('and the lists stay by mark').toEqual({active: 'signal', direction: 'desc'});
    expect(page().orderSays).toBe('');
  });

  // The list of what is held outside every list is made of what is owned, and nothing owned is sent to the AI (the
  // owner: "AI should not know what I own"). A marked stock of that list is in the top table, and not in its question.
  it('asks the AI about the marked stocks of the reader\'s own lists only: one held outside every list is not sent', () => {
    load();
    const ask = fixture.debugElement.query(By.css('app-dip-candidates')).query(By.directive(ClaudeAskComponent)).componentInstance as ClaudeAskComponent;
    expect(ask.stocks.map(it => it.quote!.symbol)).toEqual(['ABCD', 'EFGH', 'MNOP']);
    expect(ask.tied).toBe(page().tied);
    expect(say(box().querySelector('.head app-claude-ask button'))).toBe('Ask AI about these 3');
  });

  // The owner, told that the top table has room on a wide screen for the AI's short reason: "I want it". Under
  // "Key columns" a list's cell is the word alone; the top table's cell holds the reason too and shows it where the
  // table's box is wide (the cell's own style sheet decides by the box).
  it('gives the AI\'s cells of the top table their few words of why, to show where the box is wide; a list keeps the word alone', () => {
    load();
    const cellsIn = (within: Element) => Array.from(within.querySelectorAll<HTMLElement>('app-claude-view-cell'));
    const top = cellsIn(box()), listed = cellsIn(el().querySelector('.lists')!);
    expect(top.length).toBe(4);
    expect(top.every(it => it.classList.contains('when-wide'))).toBeTrue();
    expect(listed.some(it => it.classList.contains('when-wide'))).toBeFalse();
    const compact = (within: Element) => fixture.debugElement.queryAll(By.directive(ClaudeViewCellComponent))
      .filter(it => within.contains(it.nativeElement)).map(it => (it.componentInstance as ClaudeViewCellComponent).compact);
    expect(compact(box())).toEqual([false, false, false, false]);
    expect(compact(el().querySelector('.lists')!).every(it => it)).toBeTrue();

    page().setView('all');
    fixture.detectChanges();
    expect(cellsIn(box()).some(it => it.classList.contains('when-wide'))).withContext('with every column a cell shows all of it, as in a list').toBeFalse();
    expect(compact(box())).toEqual([false, false, false, false]);
  });

  it('keeps what the AI column\'s heading says in the top table as in the lists, also after a new answer', () => {
    load();
    const tables = fixture.debugElement.queryAll(By.directive(SmartTableComponent)).map(it => it.componentInstance as SmartTableComponent);
    const tipOf = (table: SmartTableComponent) => table.tableDefinition.find(it => it.columnName === 'claudeView')!.columnTooltip;
    expect(tipOf(tables[0])).toBe(tipOf(tables[1]));
    expect(tipOf(tables[0])).toContain('not tested');
  });

  it('hands the box the counts of the marks over every stock of the page', () => {
    load();
    expect(Array.from(box().querySelectorAll('.legend .mark-count')).map(say)).toEqual(['4', '1', '0']);
  });

  it('has no table and no button on a day nothing is marked: the box says so in a sentence', () => {
    load(['WXYZ'], [], []);
    expect(box().querySelector('app-smart-table')).toBeNull();
    expect(box().querySelector('app-claude-ask')).toBeNull();
    expect(say(box().querySelector('.empty'))).toMatch(/^Nothing is marked DIP BUY right now/);
  });

  it('keeps an open row open when prices arrive again: the same table, the same rows', () => {
    load();
    box().querySelector<HTMLButtonElement>('button.toggle[aria-label="Show details for EFGH"]')!.click();
    fixture.detectChanges();
    const table = box().querySelector('table');
    load();
    expect(box().querySelector('table')).withContext('not built anew').toBe(table);
    expect(box().querySelector('tr.detail-row.open[data-detail="EFGH"]')).not.toBeNull();
  });

  it('puts the table away with "Hide the table", keeps it in the page, and remembers the choice in this browser', () => {
    load();
    box().querySelector<HTMLButtonElement>('button.fold')!.click();
    fixture.detectChanges();
    expect(page().paneFolded).toBeTrue();
    expect(box().querySelector<HTMLElement>('.stocks')!.hidden).toBeTrue();
    expect(box().querySelector('.stocks app-smart-table')).not.toBeNull();
    expect(TestBed.createComponent(WatchlistTableComponent).componentInstance.paneFolded).withContext('the next visit starts with it away').toBeTrue();
  });
});
