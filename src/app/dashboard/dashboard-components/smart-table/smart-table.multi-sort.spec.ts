import {Component, OnInit, TemplateRef, ViewChild} from "@angular/core";
import {ComponentFixture, TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {MatTableDataSource} from "@angular/material/table";
import {MatTooltip} from "@angular/material/tooltip";
import {NgIf} from "@angular/common";
import {SmartTableComponent, SortKey, TableDef} from "./smart-table.component";
import {ALSO_ORDER_TIP} from "../../../watchlist/row-order";

type Row = { name: string, group?: string, drop?: number, note: string };

/** A page with one table: a name, a group, a figure, and a column of words the rows cannot be ordered by. */
@Component({
  standalone: true,
  imports: [SmartTableComponent, NgIf],
  template: `
    <ng-template #cell let-templateData="templateData">{{ templateData }}</ng-template>
    <app-smart-table *ngIf="shown" [tableDefinition]="columns" [dataSource]="data" defaultSortColumn="name" defaultSortDirection="asc"
                     [alsoSortedBy]="also" (sorted)="said.push($event)"></app-smart-table>`,
})
class PageWithATable implements OnInit {
  @ViewChild('cell', {static: true}) cell!: TemplateRef<unknown>;
  @ViewChild(SmartTableComponent) table!: SmartTableComponent;
  shown = true;
  also: SortKey[] = [];
  said: { active: string, direction: string, further: SortKey[] }[] = [];
  // The rows arrive after the table is there, as on the page (prices are loaded).
  data = new MatTableDataSource<Row>([]);
  columns: TableDef[] = [];

  ngOnInit(): void {
    this.columns = [
      {columnName: 'name', columnDisplayName: 'Stock', template: this.cell, templateData: (row: Row) => row.name, sortValue: (row: Row) => row.name, sortStart: 'asc'},
      {columnName: 'group', columnDisplayName: 'Group', template: this.cell, templateData: (row: Row) => row.group, sortValue: (row: Row) => row.group, sortStart: 'asc'},
      {
        columnName: 'drop', columnDisplayName: 'Dropped', columnTooltip: 'How far the price is below its highest of the past year.',
        template: this.cell, templateData: (row: Row) => row.drop, sortValue: (row: Row) => row.drop,
      },
      {columnName: 'note', columnDisplayName: 'Note', columnTooltip: 'Words.', template: this.cell, templateData: (row: Row) => row.note},
    ];
  }
}

const ROWS: Row[] = [
  {name: 'DDD', group: 'B', drop: 40, note: 'x'},
  {name: 'AAA', group: 'A', drop: 20, note: 'x'},
  {name: 'CCC', group: 'A', drop: 55, note: 'x'},
  {name: 'BBB', group: 'B', drop: 40, note: 'x'},
  {name: 'EEE', group: 'A', drop: 31, note: 'x'},
];

/**
 * The owner: "I need tables to support sorting by multiple coluns". A click on a heading orders by that column
 * alone, as before; a click with the Shift key held adds the column as the next key.
 */
describe('SmartTableComponent: rows ordered by several columns', () => {
  let fixture: ComponentFixture<PageWithATable>;
  const page = () => fixture.componentInstance;
  const el = () => fixture.nativeElement as HTMLElement;
  const heading = (name: string) => Array.from(el().querySelectorAll('th')).find(th => th.textContent?.trim().startsWith(name))!;
  const names = () => Array.from(el().querySelectorAll('tbody tr')).map(tr => tr.querySelector('td')?.textContent?.trim()).filter(Boolean).join(' ');
  const click = (name: string, shiftKey = false) => {
    heading(name).querySelector('.mat-sort-header-container, th')!.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey}));
    fixture.detectChanges();
  };
  const place = (name: string) => heading(name).querySelector('.sort-place')?.textContent?.trim() ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [PageWithATable, NoopAnimationsModule]});
    fixture = TestBed.createComponent(PageWithATable);
    fixture.detectChanges();
    page().data.data = ROWS.map(it => ({...it}));
    fixture.detectChanges();
  });

  it('orders by one column on a plain click, as before', () => {
    expect(names()).withContext('as it starts: A to Z').toBe('AAA BBB CCC DDD EEE');
    click('Dropped');
    expect(names()).withContext('the biggest first; the two that are level stay as they came').toBe('CCC DDD BBB EEE AAA');
    expect(place('Dropped')).withContext('one column: its arrow says it all, no number').toBe('');
  });

  it('adds a column as the next key on a click with the Shift key held', () => {
    click('Group');
    click('Dropped', true);
    expect(names()).withContext('group A first, and in a group the one that dropped most first').toBe('CCC EEE AAA DDD BBB');
  });

  it('breaks what is level in two keys by a third', () => {
    click('Group');
    click('Dropped', true);
    click('Stock', true);
    expect(names()).withContext('BBB and DDD are level in group and in drop: A to Z').toBe('CCC EEE AAA BBB DDD');
    expect([place('Group'), place('Dropped'), place('Stock')]).toEqual(['1', '2', '3']);
  });

  it('numbers the headings of the keys, and gives the later ones an arrow of their own', () => {
    click('Group');
    expect(place('Group')).toBe('');
    click('Dropped', true);
    expect(place('Group')).toBe('1');
    expect(place('Dropped')).toBe('2');
    expect(heading('Dropped').classList.contains('also-down')).withContext('its biggest first').toBeTrue();
    expect(heading('Group').getAttribute('aria-sort')).toBe('ascending');
    expect(heading('Dropped').getAttribute('aria-sort')).withContext('one heading of a table says "sorted"').not.toBe('descending');
    expect(heading('Dropped').textContent).withContext('said in words for a screen reader').toContain('order key 2, descending');
  });

  it('turns a later key round on a second click with Shift, and keeps its place', () => {
    click('Group');
    click('Dropped', true);
    click('Dropped', true);
    expect(names()).toBe('AAA EEE CCC DDD BBB');
    expect(place('Dropped')).toBe('2');
    expect(heading('Dropped').classList.contains('also-up')).toBeTrue();
  });

  it('turns the first key round on a click with Shift, and keeps the later keys', () => {
    click('Group');
    click('Dropped', true);
    click('Group', true);
    expect(names()).withContext('group B first now; the drop still orders inside a group').toBe('DDD BBB CCC EEE AAA');
    expect([place('Group'), place('Dropped')]).toEqual(['1', '2']);
  });

  it('goes back to one column on a plain click', () => {
    click('Group');
    click('Dropped', true);
    click('Dropped');
    expect(names()).toBe('CCC DDD BBB EEE AAA');
    expect([place('Group'), place('Dropped')]).toEqual(['', '']);
    expect(heading('Dropped').classList.contains('also-down')).toBeFalse();
  });

  it('does the same from the keyboard: Shift with Enter on a heading', () => {
    click('Group');
    heading('Dropped').querySelector('.mat-sort-header-container')!
      .dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', keyCode: 13, bubbles: true, cancelable: true, shiftKey: true} as KeyboardEventInit));
    fixture.detectChanges();
    expect(names()).toBe('CCC EEE AAA DDD BBB');
    expect(place('Dropped')).toBe('2');
  });

  it('leaves a column the rows cannot be ordered by alone', () => {
    click('Group');
    click('Note', true);
    expect(names()).toBe('AAA CCC EEE DDD BBB');
    expect(place('Group')).toBe('');
  });

  it('tells the page the whole order', () => {
    click('Group');
    click('Dropped', true);
    expect(page().said[page().said.length - 1]).toEqual({active: 'group', direction: 'asc', further: [{active: 'drop', direction: 'desc'}]});
    click('Stock');
    expect(page().said[page().said.length - 1]).toEqual({active: 'name', direction: 'asc', further: []});
  });

  it('takes a whole order from the page without saying it back', () => {
    const before = page().said.length;
    page().table.sortTo('group', 'desc', [{active: 'drop', direction: 'asc'}]);
    fixture.detectChanges();
    expect(names()).toBe('DDD BBB AAA EEE CCC');
    expect([place('Group'), place('Dropped')]).toEqual(['1', '2']);
    expect(page().said.length).toBe(before);
    page().table.sortTo('group', 'desc', []);
    fixture.detectChanges();
    expect(place('Group')).withContext('the later key taken away again').toBe('');
  });

  it('starts with the later keys the page gives it (a list shown after the others were ordered)', () => {
    page().shown = false;
    fixture.detectChanges();
    page().data = new MatTableDataSource<Row>([]);
    page().also = [{active: 'group', direction: 'desc'}, {active: 'drop', direction: 'desc'}];
    page().shown = true;
    fixture.detectChanges();
    page().data.data = ROWS.map(it => ({...it}));
    fixture.detectChanges();
    expect([place('Stock'), place('Group'), place('Dropped')]).toEqual(['1', '2', '3']);
    expect(names()).withContext('A to Z first: every name differs, so the later keys change nothing here').toBe('AAA BBB CCC DDD EEE');
  });

  it('says on a heading the rows can be ordered by how a column is added, after what the column means', () => {
    const tips = (name: string) => fixture.debugElement.queryAll(it => it.name === 'th')
      .find(it => (it.nativeElement as HTMLElement).textContent?.trim().startsWith(name))!.injector.get(MatTooltip).message;
    expect(tips('Dropped')).toBe('How far the price is below its highest of the past year.\n\n' + ALSO_ORDER_TIP);
    expect(tips('Stock')).toBe(ALSO_ORDER_TIP);
    expect(tips('Note')).withContext('not a column to order by').toBe('Words.');
  });
});
