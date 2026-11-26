import {Component, Input} from "@angular/core";
import {FlexModule} from "@angular/flex-layout";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";

@Component({
  selector: "app-price-range",
  standalone: true,
  imports: [
    FlexModule,
    NgIf,
    MatTooltipModule
  ],
  templateUrl: "./price-range-cell.component.html",
  styleUrls: ["./price-range-cell.component.scss"]
})
export class PriceRangeCellComponent {
  @Input() price?: number;
  @Input() minPrice?: number;
  @Input() maxPrice?: number;
  /** Used in the tooltip, e.g. "day" or "past-year". */
  @Input() rangeLabel: string = '';

  get hasRange(): boolean {
    return this.isNumber(this.price) && this.isNumber(this.minPrice) && this.isNumber(this.maxPrice)
      && this.maxPrice! >= this.minPrice!;
  }

  /** Where the current price sits between low (0%) and high (100%), clamped to the bar. */
  get currentPricePosition(): number {
    if (!this.hasRange) {
      return 0;
    }
    const span = this.maxPrice! - this.minPrice!;
    if (span === 0) {
      return 50;
    }
    const position = ((this.price! - this.minPrice!) / span) * 100;
    return Math.min(100, Math.max(0, position));
  }

  /** How far the price is above the low, as a % of the low. */
  get aboveLowPercent(): number {
    return ((this.price! - this.minPrice!) / this.minPrice!) * 100;
  }

  /** How far the price is below the high, as a % of the high (0 at the high, negative below it). */
  get fromHighPercent(): number {
    return ((this.price! - this.maxPrice!) / this.maxPrice!) * 100;
  }

  get tooltip(): string {
    if (!this.hasRange) {
      return '';
    }
    const label = this.rangeLabel ? `${this.rangeLabel} ` : '';
    return `${this.format(this.price)} is ${this.aboveLowPercent.toFixed(1)}% above the ${label}low ` +
      `and ${Math.abs(this.fromHighPercent).toFixed(1)}% below the ${label}high`;
  }

  format(value?: number): string {
    return this.isNumber(value) ? value!.toFixed(2) : '—';
  }

  private isNumber(value?: number): boolean {
    return value !== null && value !== undefined && Number.isFinite(value);
  }
}
