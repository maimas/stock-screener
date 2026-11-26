import {Component, Input} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatIconModule} from "@angular/material/icon";
import {MatTooltipModule} from "@angular/material/tooltip";
import {Trend} from "../../market-math";

@Component({
  selector: "app-trend-cell",
  standalone: true,
  imports: [NgIf, MatIconModule, MatTooltipModule],
  template: `
    <div class="container" [matTooltip]="tooltip" matTooltipClass="multiline-tooltip">
      <ng-container *ngIf="trend; else noData">
        <div class="line">
          <span class="value" [class.up]="trend.intact" [class.down]="!trend.intact">{{ valueText }}</span>
          <mat-icon class="arrow" aria-hidden="false" [class.down]="trend.ma200SlopePercent < 0"
                    [attr.aria-label]="trend.ma200SlopePercent >= 0 ? '200-day average rising' : '200-day average falling'">
            {{ trend.ma200SlopePercent >= 0 ? 'trending_up' : 'trending_down' }}
          </mat-icon>
        </div>
      </ng-container>
      <ng-template #noData><span class="no-data">—</span></ng-template>
    </div>`,
  styles: [`
    .container { min-width: 72px; white-space: nowrap; }
    .line { display: flex; align-items: center; gap: 4px; }
    /* Green while the trend holds and red when it is broken; the arrow green for a rising average and red for a
       falling one. The owner asked for these colours back (2026-11-26). The sign and the arrow still say it too. */
    .value { font-weight: 500; }
    .value.up { color: var(--gain); }
    .value.down { color: var(--loss); }
    .arrow { width: 16px; height: 16px; font-size: 16px; color: var(--gain); }
    .arrow.down { color: var(--loss); }
    .no-data { color: var(--ink-3); }
  `]
})
export class TrendCellComponent {
  @Input() trend: Trend | null = null;

  get valueText(): string {
    const v = this.trend!.vs200Percent;
    return `${v > 0 ? '+' : ''}${v.toFixed(1).replace('-', '−')}%`;
  }

  get tooltip(): string {
    if (!this.trend) {
      return 'Not enough price history';
    }
    const t = this.trend;
    const direction = t.ma200SlopePercent >= 0 ? 'rising' : 'falling';
    return [
      `Price is ${Math.abs(t.vs200Percent).toFixed(1)}% ${t.vs200Percent >= 0 ? 'above' : 'below'} its 200-day average (${t.ma200.toFixed(2)}).`,
      `The 200-day average is ${direction} (${t.ma200SlopePercent >= 0 ? '+' : ''}${t.ma200SlopePercent.toFixed(1)}% over the last month).`,
      t.ma50 !== undefined ? `50-day average: ${t.ma50.toFixed(2)}.` : '',
      '',
      'Context only: being above the 200-day average looked like a strong edge on the first test set, but it did not',
      'improve dip returns on fresh stocks, and it came with more further drops, so the Signal does not use it.',
    ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
  }
}
