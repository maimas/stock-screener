import {Component, Input, OnChanges} from "@angular/core";
import {DemoMaterialModule} from "src/app/demo-material-module";
import {Stock} from "../../api/microsoft-money.service";
import {NgForOf, NgIf} from "@angular/common";
import {PercentChangeCellComponent} from "../cells/percent-change/percent-change-cell.component";

/**
 * The header of one watchlist: its name, what it is made of (a one-line sector count) and, in one quiet line, the
 * average price change of its stocks over six periods. Whatever the page puts inside the element (the "Edit list"
 * button) is shown at the end of the heading line. How fresh the prices are is said once for the whole page, in
 * the bar across the top.
 */
/** The group of the stocks that are funds: they have no sector of their own. */
const FUNDS = 'Funds';

@Component({
  selector: "app-sector-distribution-widget",
  standalone: true,
  imports: [DemoMaterialModule, NgIf, NgForOf, PercentChangeCellComponent],
  templateUrl: "./sector-distribution-widget.component.html",
  styleUrls: ["./sector-distribution-widget.component.scss"]
})
export class SectorDistributionWidgetComponent implements OnChanges {
  @Input() name!: string
  @Input() stocks: Stock[] = []
  /**
   * Whether the line of average price changes is shown. It is context no mark uses, six figures a list, so the
   * page shows it with "All columns" only; the heading is then one line.
   */
  @Input() showChanges = true

  /** "4 Utilities · 1 fund · 1 Industrials", largest group first. */
  sectorSummary = '';
  summary: Summary = {
    return1Day: null,
    return1Week: null,
    return1Month: null,
    return3Month: null,
    return6Month: null,
    returnYTD: null,
    return1Year: null,
  };

  /** The list's average price change over six periods, shortest first, each named in words. */
  get changes(): { label: string, value: number | null }[] {
    const s = this.summary;
    return [
      {label: '1 day', value: s.return1Day}, {label: '1 week', value: s.return1Week}, {label: '1 month', value: s.return1Month},
      {label: '3 months', value: s.return3Month}, {label: '6 months', value: s.return6Month}, {label: '1 year', value: s.return1Year},
    ];
  }

  trackByLabel(_: number, change: { label: string }): string {
    return change.label;
  }

  ngOnChanges(): void {
    // Funds are counted in words ("1 fund", "3 funds"): "ETF" was the one abbreviation of the default view that
    // nothing explained.
    this.sectorSummary = this.countBySector()
      .map(it => it.sector === FUNDS ? `${it.count} ${it.count === 1 ? 'fund' : 'funds'}` : `${it.count} ${it.sector}`).join(' · ');
    // Equal-weighted average across the watchlist; stocks missing a value are skipped
    // (rather than counted as 0 or turning the whole average into NaN).
    this.summary = {
      return1Day: this.average(it => it.quote?.priceChangePercent),
      return1Week: this.average(it => it.quote?.return1Week),
      return1Month: this.average(it => it.quote?.return1Month),
      return3Month: this.average(it => it.quote?.return3Month),
      return6Month: this.average(it => it.quote?.return6Month),
      returnYTD: this.average(it => it.quote?.returnYTD),
      return1Year: this.average(it => it.quote?.return1Year),
    };
  }

  /**
   * The middle value of the list (the mean of the two middle ones for an even count): what the page calls
   * "typical". It was the plain average, which one stock with an extreme year ruled.
   */
  private average(pick: (stock: Stock) => number | undefined): number | null {
    const values = this.stocks
      .map(pick)
      .filter((it): it is number => it !== null && it !== undefined && Number.isFinite(it))
      .sort((a, b) => a - b);
    if (values.length === 0) {
      return null;
    }
    const half = Math.floor(values.length / 2);
    return values.length % 2 ? values[half] : (values[half - 1] + values[half]) / 2;
  }

  private countBySector(): Sector[] {
    const counts = new Map<string, number>();
    for (const stock of this.stocks) {
      // Funds have no company sector; bucket them instead of silently dropping them.
      const sector = stock.equity?.company?.sector
        || (stock.quote?.securityType?.toLowerCase() === 'etf' ? FUNDS : 'Unclassified');
      counts.set(sector, (counts.get(sector) ?? 0) + 1);
    }
    return Array.from(counts, ([sector, count]) => ({sector, count}))
      .sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
  }
}

export type Sector = {
  sector: string,
  count: number,
}

export type Summary = {
  return1Day: number | null
  return1Week: number | null
  return1Month: number | null
  return3Month: number | null
  return6Month: number | null
  returnYTD: number | null
  return1Year: number | null
}
