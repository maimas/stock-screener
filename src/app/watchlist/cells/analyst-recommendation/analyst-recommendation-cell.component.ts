import {Component, Input} from "@angular/core";
import {FlexModule} from "@angular/flex-layout";
import {NgForOf, NgIf} from "@angular/common";
import {Estimate} from "../../../api/microsoft-money.service";
import {DemoMaterialModule} from "../../../demo-material-module";

type RatingSegment = {
  label: string
  count: number
  percent: number
  color: string
  textColor: string
}

/**
 * The data provider scores ratings on a 1–5 scale
 * (1 = Strong Buy, 2 = Buy, 3 = Hold, 4 = Underperform, 5 = Sell);
 * `recommendationRate` is the analysts' weighted average on that scale.
 */
/**
 * The five parts of the bar run from red (Sell) to green (Strong Buy), and the word the ratings come to wears the
 * colour of its side. They were grey for a while ("what analysts say cannot be tested"); the owner asked for the
 * colours back on 2026-11-26. The tooltip still says that the rating cannot be tested.
 */
const CONSENSUS_LABELS: Record<string, { label: string, color: string, textColor: string, labelColor: string }> = {
  strongbuy: {label: 'Strong Buy', color: '#1b7f4b', textColor: '#fff', labelColor: 'var(--gain)'},
  buy: {label: 'Buy', color: '#a8d5b8', textColor: '#12402a', labelColor: 'var(--gain)'},
  hold: {label: 'Hold', color: '#d5dbdf', textColor: '#2c383f', labelColor: 'var(--ink-2)'},
  underperform: {label: 'Underperform', color: '#f3b4b0', textColor: '#5c1512', labelColor: 'var(--loss)'},
  sell: {label: 'Sell', color: '#c62828', textColor: '#fff', labelColor: 'var(--loss)'},
};

@Component({
  selector: "app-analyst-recommendation",
  standalone: true,
  imports: [
    FlexModule,
    NgIf,
    NgForOf,
    DemoMaterialModule
  ],
  templateUrl: "./analyst-recommendation-cell.component.html",
  styleUrls: ["./analyst-recommendation-cell.component.scss"]
})
export class AnalystRecommendationCellComponent {
  @Input() estimate?: Estimate

  /** The stock's own analyst consensus (not the industry consensus). */
  get consensus(): string {
    const key = (this.estimate?.recommendation ?? '').toLowerCase();
    return CONSENSUS_LABELS[key]?.label ?? '';
  }

  get consensusColor(): string {
    const key = (this.estimate?.recommendation ?? '').toLowerCase();
    return CONSENSUS_LABELS[key]?.labelColor ?? 'inherit';
  }

  /** Bearish → bullish, so the bar reads left (sell) to right (buy). */
  get segments(): RatingSegment[] {
    const r = this.estimate?.analystRecommendation;
    const counts = [
      {count: r?.sell ?? 0, ...CONSENSUS_LABELS['sell']},
      {count: r?.underperform ?? 0, ...CONSENSUS_LABELS['underperform']},
      {count: r?.hold ?? 0, ...CONSENSUS_LABELS['hold']},
      {count: r?.buy ?? 0, ...CONSENSUS_LABELS['buy']},
      {count: r?.strongBuy ?? 0, ...CONSENSUS_LABELS['strongbuy']},
    ];
    const total = counts.reduce((sum, it) => sum + it.count, 0);
    if (total === 0) {
      return [];
    }
    return counts
      .filter(it => it.count > 0)
      .map(it => ({...it, percent: Math.round((it.count / total) * 100)}));
  }

  trackByLabel(_: number, segment: RatingSegment): string {
    return segment.label;
  }

  get tooltip(): string {
    if (!this.estimate) {
      return '';
    }
    const total = this.segments.reduce((sum, it) => sum + it.count, 0);
    const rate = this.estimate.recommendationRate;
    const rateText = Number.isFinite(rate) ? `, average score ${rate.toFixed(2)} (1 = Strong Buy … 5 = Sell)` : '';
    return `${this.consensus || 'No consensus'} from ${total} analysts${rateText}`;
  }
}
