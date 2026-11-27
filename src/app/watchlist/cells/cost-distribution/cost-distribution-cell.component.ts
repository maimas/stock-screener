import {Component, Input} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {MatIconModule} from "@angular/material/icon";
import {MatTooltipModule} from "@angular/material/tooltip";
import {CostDistribution} from "../../market-math";

type Bar = { x: number, y: number, height: number, inProfit: boolean };

const WIDTH = 72;
const HEIGHT = 24;
const COLUMNS = 37; // 110px / 37 ≈ 3px per bar incl. a 1px gap

/**
 * Mini "positions cost distribution": where current holders bought (x = price, low → high),
 * teal = bought below today's price (in profit), orange = above (underwater).
 * Solid line = current price, dashed line = average holder cost.
 */
@Component({
  selector: "app-cost-distribution-cell",
  standalone: true,
  imports: [NgIf, NgForOf, MatIconModule, MatTooltipModule],
  templateUrl: "./cost-distribution-cell.component.html",
  styleUrls: ["./cost-distribution-cell.component.scss"]
})
export class CostDistributionCellComponent {
  readonly width = WIDTH;
  readonly height = HEIGHT;

  bars: Bar[] = [];
  priceX = 0;
  costX = 0;
  private _distribution: CostDistribution | null = null;

  @Input() set distribution(value: CostDistribution | null) {
    this._distribution = value;
    this.layout();
  }

  get distribution(): CostDistribution | null {
    return this._distribution;
  }

  /**
   * What the cell shows: the share of owners in profit in whole percent. The heading says "Holders in profit", and
   * "Could add" writes the same figure the same way; the words stay for a screen reader (`profitText`).
   */
  get shortText(): string {
    return this._distribution ? `${Math.round(this._distribution.profitRatio)}%` : '—';
  }

  get profitText(): string {
    return this._distribution ? `${this._distribution.profitRatio.toFixed(1)}% in profit` : '—';
  }

  get costText(): string {
    const d = this._distribution;
    if (!d) {
      return '';
    }
    const vs = Math.round((d.averageCost / d.price - 1) * 100);
    return `avg cost ${d.averageCost.toFixed(2)} (${vs > 0 ? '+' : ''}${vs === 0 ? 0 : vs}%)`;
  }

  get isUnderwater(): boolean {
    return !!this._distribution && this._distribution.profitRatio < 10;
  }

  get tooltip(): string {
    const d = this._distribution;
    if (!d) {
      return 'Not enough price history';
    }
    const vs = (d.averageCost / d.price - 1) * 100;
    return [
      `Holder cost distribution (estimated from the last year of daily prices and volume)`,
      `${d.profitRatio.toFixed(1)}% of shares were bought below today's price ${d.price.toFixed(2)} and are in profit.`,
      `Average holder cost: ${d.averageCost.toFixed(2)} (${vs > 0 ? '+' : ''}${vs.toFixed(1)}% from here).`,
      '',
      'Teal = bought below today\'s price (in profit), orange = bought above it. Solid line = price, dashed = average cost.',
      'Context only: in a 2022–2026 backtest this did not predict dip outcomes on its own, so the Signal does not score it.',
    ].join('\n');
  }

  private layout(): void {
    const d = this._distribution;
    this.bars = [];
    if (!d) {
      return;
    }
    const perColumn = Math.ceil(d.weights.length / COLUMNS);
    const columns: { weight: number, mid: number }[] = [];
    for (let c = 0; c * perColumn < d.weights.length; c++) {
      const slice = d.weights.slice(c * perColumn, (c + 1) * perColumn);
      const weight = slice.reduce((a, b) => a + b, 0);
      const mid = d.low + (c * perColumn + slice.length / 2) * d.step;
      columns.push({weight, mid});
    }
    const max = Math.max(...columns.map(c => c.weight), 1e-9);
    const columnWidth = WIDTH / columns.length;
    this.bars = columns.map((c, i) => {
      const height = Math.max(c.weight > 0 ? 1 : 0, (c.weight / max) * (HEIGHT - 2));
      return {x: i * columnWidth, y: HEIGHT - height, height, inProfit: c.mid <= d.price};
    });
    const span = d.weights.length * d.step;
    const toX = (price: number) => Math.min(WIDTH - 1, Math.max(1, ((price - d.low) / span) * WIDTH));
    this.priceX = toX(d.price);
    this.costX = toX(d.averageCost);
  }

  barWidth(): number {
    return Math.max(1, WIDTH / Math.max(this.bars.length, 1) - 1);
  }

  trackByIndex(i: number): number {
    return i;
  }
}
