import {ComponentFixture, TestBed} from "@angular/core/testing";
import {HttpClientTestingModule} from "@angular/common/http/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {By} from "@angular/platform-browser";
import {WatchlistTableComponent} from "./watchlist-table.component";
import {ClaudeAskComponent} from "./claude-ask/claude-ask.component";
import {ClaudeViewCellComponent} from "./cells/claude-view/claude-view-cell.component";
import {ClaudeViewService} from "./claude-view.service";
import {VIEW_HEADING, VIEW_HELP} from "./claude-view";
import {ReadingService} from "./reading.service";
import {FakeClaudeViews, keptView} from "./testing/fake-claude-views";
import {FakeReadings} from "./testing/fake-readings";
import {flatCloses, makeStock, reportedQuarters} from "./testing/fixtures";

// The owner of the page asked for the details of a stock "summarized by AI and added to a column as an AI suggestion
// to act on the stock", and chose one button for the whole list. On the Watchlist every list of the reader's own has
// that button, and its table a column "AI · not tested".
describe("WatchlistTableComponent: Claude's view of the stocks of a list", () => {
  let views: FakeClaudeViews;
  let fixture: ComponentFixture<WatchlistTableComponent>;

  const stock = (symbol: string) => makeStock({
    symbol, price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
  });

  beforeEach(() => {
    localStorage.clear();
    views = new FakeClaudeViews();
    TestBed.configureTestingModule({
      imports: [WatchlistTableComponent, HttpClientTestingModule, NoopAnimationsModule],
      providers: [{provide: ClaudeViewService, useValue: views}, {provide: ReadingService, useValue: new FakeReadings()}],
    });
    fixture = TestBed.createComponent(WatchlistTableComponent);
    fixture.componentRef.setInput('shows', 'watchlist');
    fixture.detectChanges();
    // The first of the reader's lists with two stocks loaded, and the list of what is held outside every list with one.
    const page = fixture.componentInstance, first = page.watchLists[0];
    first.dataSource.data = [stock('ABCD'), stock('EFGH')];
    first.state = 'ready';
    page.heldOutside.symbols = ['HELD'];
    page.heldOutside.dataSource.data = [stock('HELD')];
    page.heldOutside.state = 'ready';
    page.shownLists = [...page.watchLists, page.heldOutside];
    fixture.detectChanges();
  });

  const page = () => fixture.componentInstance;
  const lists = (): HTMLElement[] => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.lists > section.list'));
  const listOf = (title: string): HTMLElement => lists().find(it => it.querySelector('h3')?.textContent?.trim() === title)!;
  const headings = (list: HTMLElement): string[] =>
    Array.from(list.querySelectorAll('th')).map(it => (it.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);

  it('puts the button in the head of a list of the reader\'s own, with the stocks of that list', () => {
    const first = listOf(page().watchLists[0].title);
    expect(first.querySelector('app-claude-ask button')!.textContent!.trim()).toBe('Ask AI about these 2');
    const asks = fixture.debugElement.queryAll(By.directive(ClaudeAskComponent));
    expect(asks.length).withContext('one for the one list that is loaded').toBe(1);
    expect((asks[0].componentInstance as ClaudeAskComponent).stocks.map(it => it.quote!.symbol)).toEqual(['ABCD', 'EFGH']);
  });

  // The owner: "claude needs to factor also the same group stocks so compare". The button is handed the page's groups.
  it('hands the button the page\'s groups of stocks that move together, so that Claude can compare them after the list', () => {
    const ask = fixture.debugElement.query(By.directive(ClaudeAskComponent)).componentInstance as ClaudeAskComponent;
    expect(ask.tied).toBe(page().tied);
    page().tied = {groups: [{letter: 'A', index: 0, symbols: ['ABCD', 'EFGH'], level: 0.7, sector: ''}], alone: [], unknown: []};
    fixture.detectChanges();
    expect(ask.tied.groups.map(it => it.letter)).toEqual(['A']);
  });

  it('has no button for the stocks held outside every list: asking about that list would send out what is owned', () => {
    const held = listOf(page().heldOutside.title);
    expect(held).withContext('the list is on the page').toBeTruthy();
    expect(held.querySelector('app-claude-ask')).toBeNull();
  });

  // The owner: "Move "Claude · not tested" as a column next to Mark · dropped". It stood last, after the tested columns.
  it('shows the column in the short view of the table, right after the mark, with the word alone', () => {
    page().setView('decision');
    fixture.detectChanges();
    const shown = headings(listOf(page().watchLists[0].title));
    expect(shown[shown.indexOf('Mark · dropped') + 1]).withContext('the column after "Mark · dropped"').toBe(VIEW_HEADING);
    const cells = fixture.debugElement.queryAll(By.directive(ClaudeViewCellComponent)).map(it => it.componentInstance as ClaudeViewCellComponent);
    expect(cells.length).toBe(3);
    expect(cells.every(it => it.compact)).toBeTrue();
    expect(cells.map(it => it.symbol).sort()).toEqual(['ABCD', 'EFGH', 'HELD']);
    expect(cells.every(it => it.today === page().today)).toBeTrue();
  });

  it('shows it among all the columns too, with the short reason', () => {
    page().setView('all');
    fixture.detectChanges();
    expect(headings(listOf(page().watchLists[0].title))).toContain(VIEW_HEADING);
    const cells = fixture.debugElement.queryAll(By.directive(ClaudeViewCellComponent)).map(it => it.componentInstance as ClaudeViewCellComponent);
    expect(cells.some(it => it.compact)).toBeFalse();
  });

  it('says on the heading what the column is, that it is not tested, and how its past views turned out', () => {
    const column = page().tableDefinition.find(it => it.columnName === 'claudeView')!;
    expect(column.columnDisplayName).toBe('AI · not tested');
    expect(column.columnTooltip).toBe(VIEW_HELP);
    views.knows({views: {ABCD: {'2020-01-06': keptView('WAIT')}}});
    expect(page().tableDefinition.find(it => it.columnName === 'claudeView')!.columnTooltip)
      .withContext('a view old enough to check, of a stock the log does not have').toBe(`${VIEW_HELP}\n\n1 no longer followed.`);
  });

  // The owner: every table of the page can be put in order by any of its columns. The order is the reader's own.
  it('can be put in order by Claude\'s word like every other column: BUY SOME, WAIT, AVOID, then the stocks with none', () => {
    const column = page().tableDefinition.find(it => it.columnName === 'claudeView')!;
    views.knows({views: {ABCD: {'2026-11-14': keptView('AVOID')}, EFGH: {'2026-11-14': keptView('BUY SOME')}, WXYZ: {'2026-11-14': keptView('WAIT')}}});
    const order = ['ABCD', 'EFGH', 'WXYZ', 'NONE'].map(symbol => column.sortValue!(stock(symbol)));
    expect(order).toEqual([2, 0, 1, 3]);
    expect(column.sortStart).toBe('asc');
  });
});
