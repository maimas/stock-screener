import {Component, Input} from "@angular/core";
import {MatTooltipModule} from "@angular/material/tooltip";

/** Above this, debt is high for most industries (banks and utilities often run higher). */
const HIGH_DEBT_TO_EQUITY = 2;

@Component({
  selector: "app-debt-equity-cell",
  standalone: true,
  imports: [MatTooltipModule],
  templateUrl: "./debt-equity-cell.component.html",
  styleUrls: ["./debt-equity-cell.component.scss"]
})
export class DebtEquityCellComponent {
  @Input() value?: number;
  @Input() industryValue?: number;
  @Input() industry?: string;

  get hasValue(): boolean {
    return this.value !== null && this.value !== undefined && Number.isFinite(this.value);
  }

  get isHigh(): boolean {
    return this.hasValue && this.value! > HIGH_DEBT_TO_EQUITY;
  }

  get text(): string {
    return this.hasValue ? this.value!.toFixed(2) : '—';
  }

  get tooltip(): string {
    if (!this.hasValue) {
      return '';
    }
    const lines = [`$${this.value!.toFixed(2)} of debt for every $1 of shareholder equity`];
    if (this.industryValue !== undefined && Number.isFinite(this.industryValue)) {
      const comparison = this.value! > this.industryValue ? 'above' : 'below';
      lines.push(`${comparison} the ${this.industry ?? 'industry'} average of ${this.industryValue.toFixed(2)}`);
    }
    if (this.isHigh) {
      lines.push(`High: above ${HIGH_DEBT_TO_EQUITY}`);
    }
    return lines.join('\n');
  }
}
