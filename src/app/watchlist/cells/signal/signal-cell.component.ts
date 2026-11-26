import {Component, Input} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatIconModule} from "@angular/material/icon";
import {MatTooltipModule} from "@angular/material/tooltip";
import {Signal, SignalVerdict} from "../../signal";

/** Why a row has no verdict: a fund, a company too young for the tested rule, or no earnings data. */
export type NoVerdict = 'fund' | 'too-new' | 'no-data';

export const VERDICT_CLASS: Record<SignalVerdict, string> = {
  'DIP BUY': 'dip',
  'WATCH': 'watch',
  'PASS': 'pass',
};

const NO_VERDICT: Record<NoVerdict, { label: string, text: string }> = {
  'fund': {label: 'FUND', text: "Funds have no profit of their own, so the mark, which rests on a company's growth, does not apply."},
  'too-new': {
    label: 'TOO NEW',
    text: 'Too young for the tested rule, which needs 8 reported quarters and a year of prices. No mark rather than an untested one.',
  },
  'no-data': {label: 'NO DATA', text: "The history of the company's results is missing or incomplete at the data source, so there is no mark."},
};

/** The verdict pill. The full reasoning opens under the row; the hover text is only the one-line answer. */
@Component({
  selector: "app-signal-cell",
  standalone: true,
  imports: [NgIf, MatIconModule, MatTooltipModule],
  templateUrl: "./signal-cell.component.html",
  styleUrls: ["./signal-cell.component.scss"]
})
export class SignalCellComponent {
  @Input() signal: Signal = null;
  @Input() noVerdict: NoVerdict = 'no-data';

  get verdictClass(): string {
    return this.signal ? VERDICT_CLASS[this.signal.verdict] : 'none';
  }

  get noVerdictLabel(): string {
    return NO_VERDICT[this.noVerdict].label;
  }

  get dipText(): string {
    const below = this.signal?.belowHigh;
    return below === undefined || below < 1 ? '' : `−${below.toFixed(0)}%`;
  }

  get tooltip(): string {
    if (!this.signal) {
      return NO_VERDICT[this.noVerdict].text;
    }
    return [
      `${this.signal.verdict}: ${this.signal.headline}`,
      this.signal.earningsSoon ? 'The company reports its results within 2 weeks: the price may swing and the growth numbers will change.' : '',
      'Open the row for the evidence, the risks and the context.',
    ].filter(it => !!it).join('\n\n');
  }
}
