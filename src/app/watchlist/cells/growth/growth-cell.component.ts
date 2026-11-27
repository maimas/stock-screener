import {Component, Input} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatIconModule} from "@angular/material/icon";
import {MatTooltipModule} from "@angular/material/tooltip";
import {GROWTH_EPS_PERCENT, GROWTH_REVENUE_PERCENT, GrowthOutlook, MIN_REPORTED_QUARTERS} from "../../signal";

/**
 * The two numbers the Signal's "growing" test uses. The one that passes its threshold gets a tick,
 * so the verdict can be read without hovering. For a company too young for the tested rule the numbers
 * are shown plain: they are context, not a verdict input.
 */
@Component({
  selector: "app-growth-cell",
  standalone: true,
  imports: [NgIf, MatIconModule, MatTooltipModule],
  template: `
    <div class="container" [class.untested]="growth && !growth.tested" [matTooltip]="tooltip" matTooltipClass="multiline-tooltip">
      <ng-container *ngIf="growth; else noData">
        <div class="line" [class.pass]="epsPass">
          <span class="key">Profit</span>{{ show(growth.epsOutlook, epsBar) }}<mat-icon *ngIf="epsPass" class="check" aria-hidden="false" aria-label="passes">check</mat-icon>
        </div>
        <div class="line" [class.pass]="revPass">
          <span class="key">Sales</span>{{ show(growth.revenueGrowth, salesBar) }}<mat-icon *ngIf="revPass" class="check" aria-hidden="false" aria-label="passes">check</mat-icon>
        </div>
      </ng-container>
      <ng-template #noData><span class="no-data">—</span></ng-template>
    </div>`,
  styles: [`
    /* The two figures stand side by side: one line a cell, so a row of a list is one line tall. */
    .container { display: flex; gap: 12px; min-width: 100px; white-space: nowrap; font-size: var(--text-meta); color: var(--ink-2); line-height: 1.5; }
    .key { margin-right: 6px; font-size: var(--text-meta); font-weight: 400; color: var(--ink-3); }
    .line { display: flex; align-items: center; }
    .line.pass { color: var(--gain); font-weight: 600; }
    .check { width: 14px; height: 14px; margin-left: 3px; font-size: 14px; }
    .untested { color: var(--ink-3); }
    .no-data { color: var(--ink-3); }
  `]
})
export class GrowthCellComponent {
  @Input() growth?: GrowthOutlook;

  get epsPass(): boolean {
    return !!this.growth?.tested && (this.growth.epsOutlook ?? -Infinity) >= GROWTH_EPS_PERCENT;
  }

  get revPass(): boolean {
    return !!this.growth?.tested && (this.growth.revenueGrowth ?? -Infinity) >= GROWTH_REVENUE_PERCENT;
  }

  readonly epsBar = GROWTH_EPS_PERCENT;
  readonly salesBar = GROWTH_REVENUE_PERCENT;

  /**
   * A figure in whole percent, as "Could add" writes it (the owner asked for less in the tables' cells: "+379.3%"
   * said no more than "+379%"). With a tenth only where the whole number would reach the bar the figure is under
   * ("+9.6%", not a "+10%" without the tick that +10% gets).
   */
  show(value: number | undefined, bar: number): string {
    if (value === undefined) {
      return '—';
    }
    const whole = Math.round(value);
    const text = whole >= bar && value < bar ? value.toFixed(1) : String(whole === 0 ? 0 : whole);
    return `${Number(text) > 0 ? '+' : ''}${text.replace('-', '−')}%`;
  }

  get tooltip(): string {
    if (!this.growth) {
      return 'No history of results to work the growth out from.';
    }
    if (!this.growth.tested) {
      return `Context only. The tested rule needs ${MIN_REPORTED_QUARTERS} reported quarters and a year of prices, and this ` +
        'company has less, so these growth figures give no verdict.';
    }
    return [
      'Profit: profit per share (EPS), the next quarter as analysts expect it plus the last 3 reported, against the last 4 reported. ' +
      `Passes at ${GROWTH_EPS_PERCENT}% or more.`,
      `Sales: the latest reported quarter's sales (revenue) against the same quarter a year earlier. Passes at ${GROWTH_REVENUE_PERCENT}% or more.`,
      '',
      this.growth.growing
        ? 'Growing: at least one passes, which is what DIP BUY and WATCH need.'
        : 'Not growing: neither passes, so the mark is PASS.',
    ].join('\n');
  }
}
