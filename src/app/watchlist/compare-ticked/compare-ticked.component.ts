import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";
import {CompareRow, ComparePart, Comparison, FactCell} from "../case-against";

/**
 * The ticked stocks of "Could add", side by side: a column a stock, a row a fact.
 *
 * The owner of the page: "there should be some sort of way of comparing them against each other". A stock's risk
 * stood in its details on the Watchlist, one stock at a time; to hold two against each other the reader had to
 * open one, remember it and open the other. Here the stocks they ticked stand in columns, and every fact the page
 * has of them is a row: what was tested first, then the context no test could use, then what the chart shows of
 * the fall. A row in which every stock says the same steps back, so that what differs is what the eye meets.
 *
 * It shows figures and names, no sentence: what a fact is shows where the pointer rests on its name, a stock's own
 * sentence where it rests on a cell, and with the keyboard on a stock's symbol the sentences of its cells.
 * It ranks nothing and marks no column as the better one: the page names no pick.
 *
 *     <app-compare-ticked [comparison]="comparison" [names]="names" (open)="open.emit($event)"></app-compare-ticked>
 *
 * `comparison` comes from `sideBySide` (case-against.ts); nothing is shown while it is undefined.
 */
@Component({
  selector: "app-compare-ticked",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgForOf, MatTooltipModule],
  templateUrl: "./compare-ticked.component.html",
  styleUrls: ["./compare-ticked.component.scss"],
})
export class CompareTickedComponent {
  /** The stocks and their facts, as `sideBySide` lines them up; undefined while no stock is ticked. */
  @Input() comparison?: Comparison;
  /** The names of the companies, by symbol: each shows where the pointer rests on its symbol. */
  @Input() names: Record<string, string> = {};
  /** A symbol was clicked: open that stock's details. */
  @Output() open = new EventEmitter<string>();

  /** The symbol the keyboard is on (reached with the Tab key, not clicked). */
  private keyboardOn?: string;

  onSymbolFocus(symbol: string, event: FocusEvent): void {
    const button = event.target as HTMLElement | null;
    this.keyboardOn = button?.matches?.(':focus-visible') ? symbol : undefined;
  }

  onSymbolBlur(): void {
    this.keyboardOn = undefined;
  }

  /**
   * What shows on a stock's symbol. Under the pointer: the company's name. With the keyboard on it: the name, then
   * the sentences behind that stock's cells, each under the name of its row. A cell cannot take the keyboard, and
   * without this its sentence could only be pointed at.
   */
  symbolTip(symbol: string, column: number): string {
    const name = this.names[symbol] || '';
    if (this.keyboardOn !== symbol || !this.comparison) {
      return name;
    }
    const said = this.comparison.parts.flatMap(part => part.rows)
      .flatMap(row => row.cells[column]?.tip ? [`${row.label}: ${row.cells[column].tip}`] : []);
    return [...(name ? [name] : []), ...said].join('\n');
  }

  trackByText(_: number, text: string): string {
    return text;
  }

  trackByTitle(_: number, part: ComparePart): string {
    return part.title;
  }

  trackByKey(_: number, row: CompareRow): string {
    return row.key;
  }

  trackByColumn(index: number, _: FactCell): number {
    return index;
  }
}
