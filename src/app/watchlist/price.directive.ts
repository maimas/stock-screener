import {AfterViewInit, Directive, ElementRef, HostListener} from "@angular/core";

/**
 * A price as it is written everywhere else on the page, with its cents: "70.1" becomes "70.10", "70" becomes
 * "70.00". Nothing (null) for a text that is not a price with at most one decimal: an empty field, a price that
 * has its cents already, one with more decimals (an average price paid keeps them).
 */
export function withCents(text: string): string | null {
  return /^\d+(\.\d)?$/.test(text.trim()) ? Number(text).toFixed(2) : null;
}

/**
 * On a field for a price: shows the price with its cents when the field is filled in by the page and when the
 * reader leaves it. A number field drops a last zero ("70.1" for 70.10), so a price filled in from the table read
 * differently from the same price in the table beside it. Only what is shown changes: the number is the same.
 */
@Directive({
  selector: "input[appPrice]",
  standalone: true,
})
export class PriceDirective implements AfterViewInit {
  constructor(private readonly field: ElementRef<HTMLInputElement>) {
  }

  /** After the form has written its number into the field, which it does a moment after the field appears. */
  ngAfterViewInit(): void {
    Promise.resolve().then(() => this.show());
  }

  @HostListener("blur")
  show(): void {
    const shown = withCents(this.field.nativeElement.value);
    if (shown !== null) {
      this.field.nativeElement.value = shown;
    }
  }
}
