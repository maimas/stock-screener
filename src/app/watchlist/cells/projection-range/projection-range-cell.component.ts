import {Component, Input} from "@angular/core";
import {FlexModule} from "@angular/flex-layout";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";

/**
 * Analyst 12-month price targets (low / median / high) relative to the current price.
 * The headline number is the upside to the median target: positive means analysts,
 * on balance, expect the price to rise from here.
 */
@Component({
  selector: "app-projection-range",
  standalone: true,
  imports: [
    FlexModule,
    NgIf,
    MatTooltipModule
  ],
  templateUrl: "./projection-range-cell.component.html",
  styleUrls: ["./projection-range-cell.component.scss"]
})
export class ProjectionRangeCellComponent {
  @Input() price?: number;
  @Input() minPrice?: number;
  @Input() medianPrice?: number;
  @Input() maxPrice?: number;
  @Input() numberOfTargets?: number;

  get hasTargets(): boolean {
    return [this.price, this.minPrice, this.medianPrice, this.maxPrice].every(it => this.isPositive(it));
  }

  /** Bar spans the analyst range, widened to include the current price if it is outside it. */
  private get barMin(): number {
    return Math.min(this.minPrice!, this.price!);
  }

  private get barMax(): number {
    return Math.max(this.maxPrice!, this.price!);
  }

  private position(value: number): number {
    const span = this.barMax - this.barMin;
    if (span === 0) {
      return 50;
    }
    return Math.min(100, Math.max(0, ((value - this.barMin) / span) * 100));
  }

  get pricePosition(): number {
    return this.position(this.price!);
  }

  get medianPosition(): number {
    return this.position(this.medianPrice!);
  }

  get rangeStartPosition(): number {
    return this.position(this.minPrice!);
  }

  get rangeWidth(): number {
    return this.position(this.maxPrice!) - this.rangeStartPosition;
  }

  get lowPercent(): number {
    return this.changeTo(this.minPrice!);
  }

  get medianPercent(): number {
    return this.changeTo(this.medianPrice!);
  }

  get highPercent(): number {
    return this.changeTo(this.maxPrice!);
  }

  get tooltip(): string {
    if (!this.hasTargets) {
      return 'No analyst price targets';
    }
    const count = this.numberOfTargets ? ` (${this.numberOfTargets} analysts)` : '';
    return `12-month price targets${count}\n` +
      `Low ${this.minPrice!.toFixed(2)} (${this.formatPercent(this.lowPercent)})\n` +
      `Median ${this.medianPrice!.toFixed(2)} (${this.formatPercent(this.medianPercent)})\n` +
      `High ${this.maxPrice!.toFixed(2)} (${this.formatPercent(this.highPercent)})\n` +
      `Current price ${this.price!.toFixed(2)}`;
  }

  formatPercent(value: number): string {
    const fixed = value.toFixed(1);
    return `${Number(fixed) > 0 ? '+' : ''}${fixed}%`;
  }

  private changeTo(target: number): number {
    return ((target - this.price!) / this.price!) * 100;
  }

  private isPositive(value?: number): boolean {
    return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
  }
}
