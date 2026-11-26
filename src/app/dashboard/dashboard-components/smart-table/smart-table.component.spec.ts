import {Component, OnInit, TemplateRef, ViewChild} from "@angular/core";
import {fakeAsync, flush, TestBed, tick} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {OverlayContainer} from "@angular/cdk/overlay";
import {By} from "@angular/platform-browser";
import {MatTooltip} from "@angular/material/tooltip";
import {MatTableDataSource} from "@angular/material/table";
import {SmartTableComponent, TableDef} from "./smart-table.component";
import {SymbolCellComponent} from "../../../watchlist/cells/symbol/symbol-cell.component";

type Row = { name: string, drop: number };

/** A page with one table of two columns; the second explains itself. */
@Component({
  standalone: true,
  imports: [SmartTableComponent],
  template: `
    <ng-template #cell let-templateData="templateData">{{ templateData }}</ng-template>
    <app-smart-table [tableDefinition]="columns" [dataSource]="data"></app-smart-table>`,
})
class PageWithATable implements OnInit {
  @ViewChild('cell', {static: true}) cell!: TemplateRef<unknown>;
  data = new MatTableDataSource<Row>([{name: 'AMD', drop: 37}]);
  columns: TableDef[] = [];

  ngOnInit(): void {
    this.columns = [
      {columnName: 'name', columnDisplayName: 'Symbol', template: this.cell, templateData: (row: Row) => row.name, sortValue: (row: Row) => row.name},
      {
        columnName: 'drop', columnDisplayName: 'Dropped', columnTooltip: 'How far the price is below its highest of the past year.',
        template: this.cell, templateData: (row: Row) => row.drop, sortValue: (row: Row) => row.drop,
      },
    ];
  }
}

describe('SmartTableComponent: what a column heading means', () => {
  it('is shown when the heading is reached with the keyboard, not only under the mouse, and goes when the heading is left', fakeAsync(() => {
    TestBed.configureTestingModule({imports: [PageWithATable, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(PageWithATable);
    fixture.detectChanges();
    const explained = () => TestBed.inject(OverlayContainer).getContainerElement().textContent ?? '';
    const heading = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('th')).find(th => th.textContent?.includes('Dropped'))!;
    // What the Tab key lands on in a sortable heading.
    const button = heading.querySelector('.mat-sort-header-container') as HTMLElement;
    expect(button.getAttribute('tabindex')).withContext('the heading can be reached with the keyboard').toBe('0');

    button.dispatchEvent(new FocusEvent('focusin', {bubbles: true}));
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();
    expect(explained()).toContain('How far the price is below its highest of the past year.');

    button.dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
    fixture.detectChanges();
    tick(2000);
    fixture.detectChanges();
    expect(explained()).not.toContain('How far the price');
    flush();
  }));
});

/** A page with a list of stocks as the screener shows them: the stock's name first, and details that open under a row. */
@Component({
  standalone: true,
  imports: [SmartTableComponent, SymbolCellComponent],
  template: `
    <ng-template #name let-templateData="templateData">
      <app-symbol-cell [symbol]="templateData" id="x1" sector="A company"></app-symbol-cell>
    </ng-template>
    <ng-template #details let-row="row"><p class="details-of">Details of {{ row.name }}</p></ng-template>
    <app-smart-table [tableDefinition]="columns" [dataSource]="data" [detailTemplate]="details" [rowKey]="nameOf"></app-smart-table>`,
})
class PageWithStocks implements OnInit {
  @ViewChild('name', {static: true}) name!: TemplateRef<unknown>;
  data = new MatTableDataSource<Row>([{name: 'AMD', drop: 37}]);
  columns: TableDef[] = [];
  readonly nameOf = (row: Row) => row.name;

  ngOnInit(): void {
    this.columns = [{columnName: 'name', columnDisplayName: 'Symbol', template: this.name, templateData: (row: Row) => row.name}];
  }
}

describe('SmartTableComponent: opening a stock', () => {
  it("opens the details when the stock's name is clicked: the name is part of its row, not a way out of the page", () => {
    TestBed.configureTestingModule({imports: [PageWithStocks, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(PageWithStocks);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const name = Array.from(el.querySelectorAll('app-symbol-cell *')).find(it => it.children.length === 0 && it.textContent?.trim() === 'AMD') as HTMLElement;
    // Whatever the name is made of, this test's own page stays where it is.
    name.addEventListener('click', event => event.preventDefault());
    expect(el.querySelector('.details-of')).toBeNull();
    name.click();
    fixture.detectChanges();
    expect(el.querySelector('.details-of')?.textContent).toBe('Details of AMD');
  });
});

/** A page with a table whose rows open, and which says what each row is. */
@Component({
  standalone: true,
  imports: [SmartTableComponent],
  template: `
    <ng-template #cell let-templateData="templateData">{{ templateData }}</ng-template>
    <ng-template #detail let-row="row">details of {{ row.name }}</ng-template>
    <app-smart-table [tableDefinition]="columns" [dataSource]="data" [detailTemplate]="detail"
                     [rowKey]="nameOf" [rowLabel]="nameOf" [rowTip]="companyOf"></app-smart-table>`,
})
class PageWithRowsThatOpen implements OnInit {
  @ViewChild('cell', {static: true}) cell!: TemplateRef<unknown>;
  data = new MatTableDataSource<Row>([{name: 'ACME', drop: 37}]);
  columns: TableDef[] = [];
  readonly nameOf = (row: Row) => row.name;
  readonly companyOf = (row: Row) => `${row.name} Tools Inc | Technology`;

  ngOnInit(): void {
    this.columns = [{columnName: 'name', columnDisplayName: 'Symbol', template: this.cell, templateData: (row: Row) => row.name}];
  }
}

// A row's one tab stop is the button that opens it, at the far end of the row. What the first cell says to a
// pointer (the company behind the symbol) could not be reached with the keyboard at all.
describe('SmartTableComponent: what a row is, for the keyboard', () => {
  it('says it on the row\'s button, where the pointer rests or the Tab key lands', () => {
    TestBed.configureTestingModule({imports: [PageWithRowsThatOpen, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(PageWithRowsThatOpen);
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button.toggle'));
    expect(button.injector.get(MatTooltip).message).toBe('ACME Tools Inc | Technology');
    expect(button.nativeElement.getAttribute('aria-label')).toBe('Show details for ACME');
  });
});

// Found by a review of the page: "Reload prices" on the Watchlist closed a purchase that was being typed in a
// stock's details. Every reload hands the table new objects, and each row was taken away and built again.
describe('SmartTableComponent: a reload of its rows', () => {
  it('keeps a row, and the details open under it, when the same stock arrives as a new object', () => {
    TestBed.configureTestingModule({imports: [PageWithRowsThatOpen, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(PageWithRowsThatOpen);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('button.toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    const row = el.querySelector('tr.main-row'), detail = el.querySelector('.detail');
    expect(detail?.textContent).toContain('details of ACME');
    fixture.componentInstance.data = new MatTableDataSource<Row>([{name: 'ACME', drop: 41}]);
    fixture.detectChanges();
    expect(el.querySelector('tr.main-row')).withContext('the same row').toBe(row);
    expect(el.querySelector('.detail')).withContext('the same details, still open').toBe(detail);
  });
});
