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

  /**
   * The day of the next report, or of the last one when the next is not announced. The owner asked for less in the
   * tables' cells ("for example the next results column"): what the day is is said in words on the hover.
   */
  get dateText(): string {
    if (this.date) {
      return this.format(this.date);
    }
    if (this.showReported) {
      return this.format(this.reported!.date!);
    }
    return '—';
  }

  /**
   * Beside the day: how soon a report within two weeks is (a report that is weeks away is its day alone; the count
   * is on the hover), or how the last report compared with what analysts expected, in whole percent. What to do
   * about a near report ("look at the mark again after it") is on the hover and on the mark's own flag.
   */
  get subText(): string {
    if (this.date && this.days !== undefined) {
      if (!this.isSoon) {
        return '';
      }
      return this.days === 0 ? 'today' : this.days === 1 ? 'tomorrow' : `in ${this.days} days`;
    }
    if (this.showReported) {
      const s = this.reported!.surprisePercent;
      if (s === undefined) {
        return 'reported';
      }
      return s >= 0 ? `beat ${Math.round(s)}%` : `missed ${Math.round(Math.abs(s))}%`;
    }
    return '';
  }

  get missed(): boolean {
    return this.showReported && (this.reported!.surprisePercent ?? 0) < 0;
  }

  get tooltip(): string {
    if (this.date) {
      const full = this.date.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'});
      const days = this.days === undefined ? '' : this.days === 0 ? ', today' : this.days === 1 ? ', tomorrow' : `, in ${this.days} days`;
      const warning = this.isSoon ? '\nPrices often swing sharply around a report: look at the mark again after it.' : '';
      return `Next quarterly results expected ${full}${days}.${warning}\n` +
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
