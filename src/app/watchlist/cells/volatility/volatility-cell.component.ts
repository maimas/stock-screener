import {Component, Input} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";
import {VOLATILITY_GROUPS_NOTE, volatilityNote} from "../../evidence";

/**
 * How widely the price swings (annualised, from the last year's weekly returns). For a DIP BUY the two tested
 * groups are labelled, because they differed in how often the price fell another 20%: "volatile" and "calm".
 */
@Component({
  selector: "app-volatility-cell",
  standalone: true,
  imports: [NgIf, MatTooltipModule],
  template: `
    <div class="container" [matTooltip]="tooltip" matTooltipClass="multiline-tooltip">
      <ng-container *ngIf="hasValue; else noData">
        <div class="value" [class.high]="tier === 'high'">{{ volatility!.toFixed(0) }}%</div>
        <div class="label" *ngIf="tier">{{ tier === 'high' ? 'volatile' : 'calm' }}</div>
      </ng-container>
      <ng-template #noData><span class="no-data">—</span></ng-template>
    </div>`,
  styles: [`
    /* The figure, then its word ("volatile", "calm") beside it: one line a cell. */
    .container { display: flex; align-items: baseline; gap: 6px; min-width: 56px; white-space: nowrap; }
    .value.high { color: var(--warn); font-weight: 600; }
    .label { font-size: var(--text-meta); color: var(--ink-3); }
    .no-data { color: var(--ink-3); }
  `]
})
export class VolatilityCellComponent {
  @Input() volatility?: number | null;
  /** Set for DIP BUYs in one of the two tested groups. */
  @Input() tier?: 'high' | 'low';

  get hasValue(): boolean {
    return typeof this.volatility === 'number' && Number.isFinite(this.volatility);
  }

  get tooltip(): string {
    if (!this.hasValue) {
      return 'Needs about 40 weeks of prices';
    }
    if (this.tier) {
      return volatilityNote(this.tier, this.volatility!);
    }
    return `Swings of about ${this.volatility!.toFixed(0)}% a year (from weekly returns over the past year). ${VOLATILITY_GROUPS_NOTE}`;
  }
}
