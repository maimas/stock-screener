import {Component, Input} from "@angular/core";

/**
 * How a number is coloured:
 * - none:       plain text
 * - sign:       green when positive, red when negative (e.g. EPS: profit vs loss)
 * - negativeOnly: plain text, red only when negative (e.g. P/E, where "high" is not "good")
 */
export type PriceColorMode = 'none' | 'sign' | 'negativeOnly';

@Component({
  selector: "app-price-cell",
  standalone: true,
  imports: [],
  templateUrl: "./price-cell.component.html",
  styleUrls: ["./price-cell.component.scss"]
})
export class PriceCellComponent {

  @Input() price?: number | null
  @Input() colorMode: PriceColorMode = 'none'

  get hasValue(): boolean {
    return this.price !== null && this.price !== undefined && Number.isFinite(this.price);
  }

  get priceColor(): string {
    if (!this.hasValue) {
      return 'var(--ink-3)';
    }
    const value = Number(this.price!.toFixed(2));
    switch (this.colorMode) {
      case 'sign':
        return value === 0 ? 'var(--ink-3)' : (value > 0 ? 'var(--gain)' : 'var(--loss)');
      case 'negativeOnly':
        return value < 0 ? 'var(--loss)' : 'inherit';
      default:
        return 'inherit';
    }
  }

  get value(): string {
    return this.hasValue ? this.price!.toFixed(2) : '—';
  }
}
