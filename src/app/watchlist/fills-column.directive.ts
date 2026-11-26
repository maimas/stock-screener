import {AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy} from "@angular/core";

/** The height of one row of the grid the element is laid out in: `grid-auto-rows` in the page's styles says the same. */
export const GRID_ROW_PX = 4;

/**
 * Lets a box stand directly under the one above it in its column of a grid, whatever stands beside it:
 * `<section appFillsColumn>`.
 *
 * A grid lines its rows up across the columns, so a short box beside a tall one leaves a hole under it. Here the
 * grid has many low rows instead (4px each), and each box says how many of them it takes: its own height and the
 * gap under it. The height is measured, and measured again whenever it changes (a stock's details opened, a list
 * edited), so the boxes under it move with it and nothing ever overlaps. Outside such a grid the setting does
 * nothing.
 */
@Directive({
  selector: "[appFillsColumn]",
  standalone: true,
})
export class FillsColumnDirective implements AfterViewInit, OnDestroy {
  /** The room left under the box, in px. */
  @Input() gapUnder = 24;

  private sizes?: ResizeObserver;

  constructor(private readonly host: ElementRef<HTMLElement>, private readonly zone: NgZone) {
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const element = this.host.nativeElement;
    // Outside Angular: a height that changed is no reason to check the whole page for changes.
    this.zone.runOutsideAngular(() => {
      this.sizes = new ResizeObserver(() => element.style.gridRowEnd = `span ${rowsFor(element.offsetHeight, this.gapUnder)}`);
      this.sizes.observe(element);
    });
  }

  ngOnDestroy(): void {
    this.sizes?.disconnect();
  }
}

/** How many rows of the grid a box of this height takes, with the gap under it. */
export function rowsFor(height: number, gapUnder: number): number {
  return Math.max(1, Math.ceil((height + gapUnder) / GRID_ROW_PX));
}
