import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output,
  SimpleChanges, TemplateRef, ViewChild,
} from "@angular/core";
import {DemoMaterialModule} from "../../../demo-material-module";
import {MatTable, MatTableDataSource} from "@angular/material/table";
import {MatSort} from "@angular/material/sort";
import {PipesModule} from "../../../pipes/pipes.module";
import {NgForOf, NgIf, NgTemplateOutlet} from "@angular/common";
import {ALSO_ORDER_TIP} from "../../../watchlist/row-order";

export type TableDef = {
  columnName: string;
  columnTooltip?: string;
  columnDisplayName: string;
  template: TemplateRef<any>
  templateData: (data: any) => any
  /** Value used when sorting by this column. Columns without it are not sortable. */
  sortValue?: (data: any) => number | string | null | undefined
  /**
   * Which way the first click on the heading orders the rows. The biggest first unless said otherwise, as in the
   * page's other tables: a number is looked at for its extremes. 'asc' for a name (A first) or a date (soonest first).
   */
  sortStart?: 'asc' | 'desc'
  /** Keep this column pinned on the left while the table scrolls horizontally. */
  sticky?: boolean
  /** With `sticky`: pin only on wide screens, so a phone keeps room for the scrolling columns. */
  stickyWideOnly?: boolean
}

/** A column the rows follow, and which way. */
export type SortKey = { active: string, direction: 'asc' | 'desc' };

const TOGGLE_COLUMN = '__toggle';
const DETAIL_COLUMN = '__detail';
const WIDE_SCREEN = '(min-width: 700px)';

/** Where a row may stand at the top of the window: under the bar across the top of the page (48px) and a little air. */
const UNDER_THE_BAR = 64;

@Component({
  selector: "app-smart-table",
  standalone: true,
  imports: [
    DemoMaterialModule,
    PipesModule,
    NgForOf,
    NgTemplateOutlet,
    NgIf,
  ],
  templateUrl: "./smart-table.component.html",
  styleUrls: ["./smart-table.component.scss"]
})
export class SmartTableComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input()
  public tableDefinition: TableDef[] = []
  @Input()
  public dataSource: MatTableDataSource<any> = new MatTableDataSource<any>([]);

  /** Column names to show (in tableDefinition order). All columns when not set. */
  @Input()
  public visibleColumns?: string[];
  @Input()
  public defaultSortColumn = '';
  @Input()
  public defaultSortDirection: 'asc' | 'desc' = 'asc';

  /** When set, every row can be opened to show this template underneath (context: `row`). */
  @Input()
  public detailTemplate?: TemplateRef<any>;
  /** Stable identity of a row, so an open row stays open when the data is reloaded. */
  @Input()
  public rowKey: (row: any) => string = row => String(row);
  /** What the table is, for a screen reader that lists the tables of a page, e.g. the name of the list it shows. */
  @Input()
  public label = '';
  /**
   * The columns the rows follow after the first one (which is `defaultSortColumn` until a heading is clicked): for
   * a table that is shown after the reader ordered the page's other tables by several columns.
   */
  @Input()
  set alsoSortedBy(keys: SortKey[] | undefined) {
    this.further = (keys ?? []).map(it => ({...it}));
  }

  /**
   * The reader ordered the rows (a click on a heading): by which column and which way, and by which further
   * columns where rows are level in it (a click with the Shift key held adds one).
   */
  @Output()
  public sorted = new EventEmitter<{ active: string, direction: 'asc' | 'desc', further: SortKey[] }>();
  /** The reader opened or closed a row's details (its button, or a click on the row). */
  @Output()
  public rowToggled = new EventEmitter<{ row: any, open: boolean }>();
  /** How a row is named to screen readers, e.g. its symbol. */
  @Input()
  public rowLabel: (row: any) => string = () => 'this row';
  /**
   * What the row's button says where the pointer rests on it or the Tab key reaches it, e.g. the company behind a
   * symbol. The button is the row's one tab stop, so this is the only way the keyboard gets at what the first cell
   * shows to a pointer. Nothing when not given.
   */
  @Input()
  public rowTip: (row: any) => string = () => '';

  @ViewChild(MatSort) sort?: MatSort;
  @ViewChild(MatTable) table?: MatTable<any>;

  tableColumns: string[] = [];
  /** tableColumns plus the open/close button when rows have details. */
  rowColumns: string[] = [];
  readonly detailColumns = [DETAIL_COLUMN];
  wide = true;

  /**
   * The columns the rows follow after the first: the owner asked that tables can be ordered by several columns.
   * The first key is the one Material's sort holds (a plain click on a heading, as before); a click with the Shift
   * key held adds a column here, or turns it round when it is a key already. A plain click empties it again.
   */
  private further: SortKey[] = [];

  private expanded = new Set<string>();
  private media?: MediaQueryList;
  private readonly onMedia = (event: MediaQueryListEvent) => {
    this.wide = event.matches;
    this.changeDetector.markForCheck();
  };

  /** Watches the width of the table's box: the pinned columns are placed by measured widths (see `ngAfterViewInit`). */
  private widths?: ResizeObserver;
  /** Columns are out of sight on the left or on the right of the box the table scrolls in. */
  cutLeft = false;
  cutRight = false;
  private scrollBox?: HTMLElement;
  private readonly onScroll = () => this.updateCut();

  constructor(private changeDetector: ChangeDetectorRef, private host: ElementRef<HTMLElement>, private zone: NgZone) {
  }

  ngOnInit(): void {
    this.media = window.matchMedia(WIDE_SCREEN);
    this.wide = this.media.matches;
    this.media.addEventListener('change', this.onMedia);
    this.updateColumns();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visibleColumns'] || changes['tableDefinition'] || changes['detailTemplate']) {
      this.updateColumns();
    }
    // The parent replaces the data source once quotes arrive, so re-attach sorting each time.
    if (changes['dataSource'] || changes['tableDefinition']) {
      this.attachSort();
    }
  }

  ngAfterViewInit(): void {
    this.attachSort();
    // A pinned column stands at the summed width of the columns before it, measured once. When the table gets
    // another width (the window, or the pane beside the lists folded) the columns change theirs, and a pinned
    // column would stay where it was and cover the one after it. So the places are worked out again.
    this.scrollBox = this.host.nativeElement.querySelector<HTMLElement>('.table-scroll') ?? undefined;
    if (typeof ResizeObserver !== 'undefined') {
      this.widths = new ResizeObserver(() => this.zone.run(() => {
        this.table?.updateStickyColumnStyles();
        this.updateCut();
      }));
      // The box the table scrolls in is watched: the component's own element is an inline one, which has no size.
      this.widths.observe(this.scrollBox ?? this.host.nativeElement);
      // And the table itself: it gets wider when its rows arrive or more columns are shown, and the box does not.
      const table = this.scrollBox?.querySelector('table');
      if (table) {
        this.widths.observe(table);
      }
    }
    // Scrolling fires often and changes nothing most of the time: it is listened to outside Angular, which is told
    // only when a side starts or stops being cut.
    this.zone.runOutsideAngular(() => this.scrollBox?.addEventListener('scroll', this.onScroll, {passive: true}));
    // A click on a heading with the Shift key held is taken on its way down to the heading, before Material's own
    // sort sees it (which would make the column the only one).
    const box = this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      box.addEventListener('click', this.onShiftClick, true);
      box.addEventListener('keydown', this.onShiftKey, true);
      box.addEventListener('mousedown', this.onShiftDown, true);
    });
  }

  ngOnDestroy(): void {
    this.media?.removeEventListener('change', this.onMedia);
    this.widths?.disconnect();
    this.scrollBox?.removeEventListener('scroll', this.onScroll);
    const box = this.host.nativeElement;
    box.removeEventListener('click', this.onShiftClick, true);
    box.removeEventListener('keydown', this.onShiftKey, true);
    box.removeEventListener('mousedown', this.onShiftDown, true);
  }

  /** The column of the heading an event happened in, when the rows can be ordered by it; nothing otherwise. */
  private sortableAt(target: EventTarget | null): string | undefined {
    const th = target instanceof Element ? target.closest('th[data-column]') : null;
    if (!th || th.closest('.table-scroll') !== this.scrollBox) {
      return undefined;
    }
    const column = th.getAttribute('data-column') ?? '';
    return this.tableDefinition.find(it => it.columnName === column)?.sortValue ? column : undefined;
  }

  private readonly onShiftClick = (event: MouseEvent) => {
    const column = event.shiftKey ? this.sortableAt(event.target) : undefined;
    if (column) {
      event.stopPropagation();
      event.preventDefault();
      this.zone.run(() => this.alsoSortBy(column));
    }
  };

  private readonly onShiftKey = (event: KeyboardEvent) => {
    const column = event.shiftKey && (event.key === 'Enter' || event.key === ' ') ? this.sortableAt(event.target) : undefined;
    if (column) {
      event.stopPropagation();
      event.preventDefault();
      this.zone.run(() => this.alsoSortBy(column));
    }
  };

  /** A click with Shift held would mark the text from the last click to here: not on a heading. */
  private readonly onShiftDown = (event: MouseEvent) => {
    if (event.shiftKey && this.sortableAt(event.target)) {
      event.preventDefault();
    }
  };

  /**
   * A click on a heading with the Shift key held: the column becomes the next key of the order, or is turned
   * round when it is a key already (the first one too), keeping its place.
   */
  private alsoSortBy(column: string): void {
    const sort = this.sort;
    if (!sort) {
      return;
    }
    const start = this.tableDefinition.find(it => it.columnName === column)?.sortStart ?? 'desc';
    if (!sort.active || !sort.direction) {
      // The rows follow no column yet: this is a first click.
      sort.sort({id: column, start, disableClear: true});
      return;
    }
    if (sort.active === column) {
      sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
    } else if (this.further.some(it => it.active === column)) {
      this.further = this.further.map(it => it.active === column ? {active: column, direction: it.direction === 'asc' ? 'desc' : 'asc'} : it);
    } else {
      this.further = [...this.further, {active: column, direction: start}];
    }
    this.sortAgain();
    this.sorted.emit({active: sort.active, direction: sort.direction as 'asc' | 'desc', further: this.further.map(it => ({...it}))});
  }

  /** Orders the rows again by the keys as they stand now, without telling the page. */
  private sortAgain(): void {
    if (!this.sort) {
      return;
    }
    this.following = true;
    this.sort.sortChange.emit({active: this.sort.active, direction: this.sort.direction});
    this.following = false;
    this.changeDetector.markForCheck();
  }

  /** The small number beside a heading's arrow: its place among the keys, once there are two or more. */
  placeOf(column: string): number | undefined {
    const first = this.firstKey;
    if (this.further.length === 0 || !first) {
      return undefined;
    }
    if (first === column) {
      return 1;
    }
    const at = this.further.findIndex(it => it.active === column);
    return at < 0 ? undefined : at + 2;
  }

  /** Which way a key after the first goes; nothing for the first key (Material draws that one) or for no key. */
  alsoWay(column: string): 'asc' | 'desc' | undefined {
    return this.firstKey === column ? undefined : this.further.find(it => it.active === column)?.direction;
  }

  /** The column the rows follow first: what Material's sort holds, and before that is there, what the table starts with. */
  private get firstKey(): string {
    return this.sort?.active || this.defaultSortColumn;
  }

  /** For a screen reader, on the heading of a key after the first: its place and its way. */
  alsoWords(column: string): string {
    const way = this.alsoWay(column);
    return way ? `, order key ${this.placeOf(column)}, ${way === 'asc' ? 'ascending' : 'descending'}` : '';
  }

  /** What a heading says where the pointer rests on it: what its column means, and how to add it to the order. */
  tipOf(def: TableDef): string {
    return def.sortValue ? [def.columnTooltip, ALSO_ORDER_TIP].filter(Boolean).join('\n\n') : def.columnTooltip ?? '';
  }

  /** Works out again whether columns are out of sight on either side, and says so only when that changed. */
  private updateCut(): void {
    const box = this.scrollBox;
    if (!box) {
      return;
    }
    const left = box.scrollLeft > 1, right = box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
    if (left !== this.cutLeft || right !== this.cutRight) {
      this.zone.run(() => {
        this.cutLeft = left;
        this.cutRight = right;
        this.changeDetector.markForCheck();
      });
    }
  }

  trackByIndex(i: number): number {
    return i;
  }

  /**
   * A row is the same row while its key is the same (a stock's symbol). Every reload of prices hands the table new
   * objects; without this each row was taken away and built again, and with it the details that were open under
   * it: a purchase half typed there was thrown away and the keyboard was left on nothing.
   */
  readonly trackByKey = (_: number, row: any) => this.rowKey(row);

  isSticky(def: TableDef): boolean {
    return !!def.sticky && (this.wide || !def.stickyWideOnly);
  }

  isExpanded(row: any): boolean {
    return this.expanded.has(this.rowKey(row));
  }

  toggle(row: any): void {
    const key = this.rowKey(row);
    const open = !this.expanded.delete(key);
    if (open) {
      this.expanded.add(key);
      this.bringIntoView(key);
    }
    this.rowToggled.emit({row, open});
  }

  /**
   * A row opened near the foot of the window used to open its details wholly below it: only the row's arrow
   * turned, and the click read as dead. The page moves just far enough for the details to be in the window, and
   * never so far that the row itself leaves it (details taller than the window then start under their row).
   * Only for a row the reader opened here: who opens one from outside (`expand`) scrolls to it themselves.
   */
  private bringIntoView(key: string): void {
    this.zone.runOutsideAngular(() => setTimeout(() => {
      const detail = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('tr.detail-row.open'))
        .find(it => it.getAttribute('data-detail') === key);
      if (!detail) {
        return;
      }
      const box = detail.getBoundingClientRect();
      const below = box.bottom - window.innerHeight;
      if (below <= 0) {
        return;
      }
      const row = (detail.previousElementSibling as HTMLElement | null)?.getBoundingClientRect() ?? box;
      const room = row.top - UNDER_THE_BAR;
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      window.scrollBy({top: Math.max(0, Math.min(below + 16, room)), behavior: calm ? 'auto' : 'smooth'});
    }, 80));
  }

  /** How many rows have their details open. */
  get openCount(): number {
    return this.expanded.size;
  }

  /** Closes every row's details at once. */
  collapseAll(): void {
    if (this.expanded.size > 0) {
      this.expanded.clear();
      this.changeDetector.markForCheck();
    }
  }

  /** Opens a row from outside (e.g. after scrolling to it). */
  expand(row: any): void {
    this.expanded.add(this.rowKey(row));
    this.changeDetector.markForCheck();
  }

  /** Closes a row from outside (a "Close" at the foot of its details, far below the row's own button). */
  collapse(row: any): void {
    if (this.expanded.delete(this.rowKey(row))) {
      this.changeDetector.markForCheck();
    }
  }

  /** A click anywhere on the row opens its details, except on a link or button, which keep their own action. */
  onRowClick(row: any, event: MouseEvent): void {
    if (!this.detailTemplate || (event.target as HTMLElement).closest('a, button')) {
      return;
    }
    this.toggle(row);
  }

  private updateColumns(): void {
    const all = this.tableDefinition.map(c => c.columnName);
    this.tableColumns = this.visibleColumns ? all.filter(it => this.visibleColumns!.includes(it)) : all;
    this.rowColumns = this.detailTemplate ? [...this.tableColumns, TOGGLE_COLUMN] : this.tableColumns;
  }

  /**
   * A plain click on a heading reordered the rows by that column alone: said to the page, unless the order came
   * from the page (`sortTo`) or from a click with Shift held (`alsoSortBy`, which says it itself).
   */
  onSort(change: { active: string, direction: string }): void {
    if (!this.following && (change.direction === 'asc' || change.direction === 'desc')) {
      if (this.further.length > 0) {
        // Material ordered the rows with the further keys still there: once more, by the one column.
        this.further = [];
        this.sortAgain();
      }
      this.sorted.emit({active: change.active, direction: change.direction, further: []});
    }
  }

  /** Orders the rows from outside, as clicks on those headings would: the page's lists are ordered together. */
  sortTo(active: string, direction: 'asc' | 'desc', further: SortKey[] = []): void {
    const same = this.further.length === further.length && this.further.every((it, at) => it.active === further[at].active && it.direction === further[at].direction);
    if (!this.sort || (this.sort.active === active && this.sort.direction === direction && same)) {
      return;
    }
    this.sort.active = active;
    this.sort.direction = direction;
    this.further = further.filter(it => it.active !== active).map(it => ({...it}));
    this.sortAgain();
  }

  private following = false;

  private attachSort(): void {
    if (!this.dataSource) {
      return;
    }
    this.dataSource.sortingDataAccessor = (row: any, columnName: string) => {
      const def = this.tableDefinition.find(it => it.columnName === columnName);
      const value = def?.sortValue?.(row);
      // MatTableDataSource only types the accessor as string | number; null/undefined
      // still works at runtime and keeps missing values grouped together.
      return (value ?? null) as any;
    };
    // By the first key, then by each further one where rows are level. Each key compares as Material's own sort
    // does (a missing value before every other going up, after them going down), so one key orders as before.
    this.dataSource.sortData = (data: any[], sort: MatSort) => {
      const keys = [{active: sort.active, direction: sort.direction}, ...this.further].filter(it => it.active && it.direction);
      if (keys.length === 0) {
        return data;
      }
      const shown = this.dataSource.sortingDataAccessor;
      return data.sort((a, b) => {
        for (const key of keys) {
          const result = compareAsMaterial(shown(a, key.active), shown(b, key.active));
          if (result !== 0) {
            return key.direction === 'asc' ? result : -result;
          }
        }
        return 0;
      });
    };
    if (this.sort) {
      this.dataSource.sort = this.sort;
    }
  }
}

/** Two values of a column as Material's table compares them: numbers as numbers, a missing value under every other. */
function compareAsMaterial(a: any, b: any): number {
  if (typeof a !== typeof b) {
    a = typeof a === 'number' ? a + '' : a;
    b = typeof b === 'number' ? b + '' : b;
  }
  if (a != null && b != null) {
    return a > b ? 1 : a < b ? -1 : 0;
  }
  return a != null ? 1 : b != null ? -1 : 0;
}
