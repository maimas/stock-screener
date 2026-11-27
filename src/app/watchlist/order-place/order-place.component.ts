import {Component, Input} from "@angular/core";
import {NgIf} from "@angular/common";
import {orderWords, placeIn, RowOrder} from "../row-order";

/**
 * Inside a heading's button: the place of its column among the columns a table's rows are ordered by (1, 2, 3),
 * once there are two or more. The owner: "I need tables to support sorting by multiple coluns" (a click with the
 * Shift key held adds a column to the order). The number is for the eye; a screen reader is told the place and
 * the way of a later key in words (the first key says it with `aria-sort`).
 * Nothing at all while the rows follow one column or none. In these tables the arrow stands outside the heading's
 * button, in the gap to the next heading: the number stands just over the arrow and takes no width. (Set after the
 * name it made "Could add" 7px wider than its box in a window of 1,085px.) The Watchlist's tables draw it beside
 * their arrow (smart-table's `.sort-place`).
 */
@Component({
  selector: "app-order-place",
  standalone: true,
  imports: [NgIf],
  template: `<span class="order-place" *ngIf="place" aria-hidden="true">{{ place }}</span><span class="visually-hidden" *ngIf="words">{{ words }}</span>`,
  styles: [`
    :host { display: contents; }
    .order-place {
      position: absolute;
      bottom: calc(50% + 4px);
      left: calc(100% + 4px);
      width: 8px;
      text-align: center;
      pointer-events: none;
      font-family: var(--font-figures);
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      color: var(--ink);
    }
    /* In a column of figures the arrow stands before the heading, and so does the number. */
    :host-context(th.num) .order-place {
      left: auto;
      right: calc(100% + 4px);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
  `],
})
export class OrderPlaceComponent {
  /** The columns the rows follow, the first deciding first. */
  @Input() orders: readonly RowOrder<string>[] = [];
  /** The column of this heading. */
  @Input() column = '';

  get place(): number | undefined {
    return placeIn(this.orders, this.column);
  }

  get words(): string {
    return orderWords(this.orders, this.column);
  }
}
