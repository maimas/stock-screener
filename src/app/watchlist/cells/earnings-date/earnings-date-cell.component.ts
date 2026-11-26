import {Component, Input} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";

/** Reports within this many days are highlighted: prices often move sharply around earnings. */
const SOON_DAYS = 14;

export type ReportedEarnings = { date?: Date, daysAgo?: number, surprisePercent?: number };

@Component({
  selector: "app-earnings-date-cell",
  standalone: true,
  imports: [NgIf, MatTooltipModule],
  templateUrl: "./earnings-date-cell.component.html",
  styleUrls: ["./earnings-date-cell.component.scss"]
})
export class EarningsDateCellComponent {
  /** Next expected report (future). */
  @Input() date?: Date;
  @Input() days?: number;
  /** Most recent report, shown when no future date is known yet (e.g. a company that just reported). */
  @Input() reported?: ReportedEarnings;

  get isSoon(): boolean {
    return this.days !== undefined && this.days <= SOON_DAYS;
  }

  get showReported(): boolean {
    return !this.date && !!this.reported?.date && this.reported.daysAgo !== undefined;
  }

  get dateText(): string {
    if (this.date) {
      return this.format(this.date);
    }
    if (this.showReported) {
      return `Reported ${this.format(this.reported!.date!)}`;
    }
    return '—';
  }

  get subText(): string {
    if (this.date && this.days !== undefined) {
      const when = this.days === 0 ? 'today' : this.days === 1 ? 'tomorrow' : `in ${this.days} days`;
      return this.isSoon ? `${when} · re-check after` : when;
    }
    if (this.showReported && this.reported!.surprisePercent !== undefined) {
      const s = this.reported!.surprisePercent;
      return s >= 0 ? `beat by ${s.toFixed(1)}%` : `missed by ${Math.abs(s).toFixed(1)}%`;
    }
    return '';
  }

  get missed(): boolean {
    return this.showReported && (this.reported!.surprisePercent ?? 0) < 0;
  }

  get tooltip(): string {
    if (this.date) {
      const full = this.date.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'});
      const warning = this.isSoon ? '\nPrices often swing sharply around a report.' : '';
      return `Next quarterly results expected ${full}.${warning}\n` +
        'The report changes the growth numbers, so the mark may change afterwards.';
    }
    if (this.showReported) {
      const ago = this.reported!.daysAgo!, surprise = this.reported!.surprisePercent;
      const result = surprise === undefined ? 'how it compared with what analysts expected is not known'
        : `profit per share ${surprise >= 0 ? 'beat' : 'missed'} what analysts expected by ${Math.abs(surprise).toFixed(1)}%`;
      return `Last reported ${ago} day${ago === 1 ? '' : 's'} ago; ${result}.\n` +
        'The next date is not announced yet.';
    }
    return 'No date for the next results is known.';
  }

  private format(date: Date): string {
    return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  }
}
