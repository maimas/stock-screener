import {Component, Input} from "@angular/core";

@Component({
  selector: "app-percent-change-cell",
  standalone: true,
  imports: [],
  templateUrl: "./percent-change-cell.component.html",
  styleUrls: ["./percent-change-cell.component.scss"]
})
export class PercentChangeCellComponent {

  @Input()
  public percent?: number | null

  /** Neutral values (e.g. dividend yield) are shown without a +/- sign or gain/loss colour. */
  @Input()
  public neutral: boolean = false

  /**
   * Shown plainly: with its sign, but in the quiet ink and not in the colour of a gain or a loss. For a change that
   * is context (a list's average, a stock's past year): green and red are kept for the reader's own money and for
   * what a mark rests on.
   */
  @Input()
  public plain: boolean = false

  /** Decimals shown. Two for one stock's change; one is enough for an average. */
  @Input()
  public digits: number = 2

  get hasValue(): boolean {
    return this.percent !== null && this.percent !== undefined && Number.isFinite(this.percent);
  }

  get priceColor(): string {
    if (!this.hasValue || this.neutral || this.plain) {
      return 'var(--ink-2)';
    }
    const rounded = Number(this.percent!.toFixed(this.digits));
    if (rounded === 0) {
      return 'var(--ink-3)';
    }
    return rounded > 0 ? 'var(--gain)' : 'var(--loss)';
  }

  get value(): string {
    if (!this.hasValue) {
      return '—';
    }
    const fixed = this.percent!.toFixed(this.digits);
    // A change that rounds to nothing has no sign: "-0.0%" stood in the lists for a fall of a few hundredths.
    if (Number(fixed) === 0) {
      return `${(0).toFixed(this.digits)}%`;
    }
    const sign = !this.neutral && Number(fixed) > 0 ? '+' : '';
    // The true minus sign, as in the columns of money: a hyphen is shorter and stood beside it on the same screen.
    return `${sign}${fixed.replace('-', '−')}%`;
  }
}
