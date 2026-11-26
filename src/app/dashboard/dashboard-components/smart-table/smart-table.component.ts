import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output,
  SimpleChanges, TemplateRef, ViewChild,
} from "@angular/core";
import {DemoMaterialModule} from "../../../demo-material-module";
import {MatTable, MatTableDataSource} from "@angular/material/table";
import {MatSort} from "@angular/material/sort";
import {PipesModule} from "../../../pipes/pipes.module";
import {NgForOf, NgIf, NgTemplateOutlet} from "@angular/common";

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

const TOGGLE_COLUMN = '__toggle';
const DETAIL_COLUMN = '__detail';
const WIDE_SCREEN = '(min-width: 700px)';

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
  /** The reader ordered the rows by a column (a click on its heading): which column, and which way. */
  @Output()
  public sorted = new EventEmitter<{ active: string, direction: 'asc' | 'desc' }>();
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
  }

  ngOnDestroy(): void {
    this.media?.removeEventListener('change', this.onMedia);
    this.widths?.disconnect();
    this.scrollBox?.removeEventListener('scroll', this.onScroll);
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
    }
    this.rowToggled.emit({row, open});
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

  /** A click on a heading reordered the rows: said to the page, unless the order came from the page (`sortTo`). */
  onSort(change: { active: string, direction: string }): void {
    if (!this.following && (change.direction === 'asc' || change.direction === 'desc')) {
      this.sorted.emit({active: change.active, direction: change.direction});
    }
  }

  /** Orders the rows from outside, as a click on that heading would: the page's lists are ordered together. */
  sortTo(active: string, direction: 'asc' | 'desc'): void {
    if (!this.sort || (this.sort.active === active && this.sort.direction === direction)) {
      return;
    }
    this.sort.active = active;
    this.sort.direction = direction;
    this.following = true;
    this.sort.sortChange.emit({active, direction});
    this.following = false;
    this.changeDetector.markForCheck();
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
    if (this.sort) {
      this.dataSource.sort = this.sort;
    }
  }
}
