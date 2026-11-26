import {Component, Input} from "@angular/core";
import {FlexModule} from "@angular/flex-layout";
import {NgIf} from "@angular/common";
import {OwnershipSummary} from "../../../api/microsoft-money.service";
import {DemoMaterialModule} from "../../../demo-material-module";

@Component({
  selector: "app-ownership",
  standalone: true,
  imports: [
    FlexModule,
    NgIf,
    DemoMaterialModule
  ],
  templateUrl: "./ownership-cell.component.html",
  styleUrls: ["./ownership-cell.component.scss"]
})
export class OwnershipCellComponent {
  @Input() ownership?: OwnershipSummary

  get hasData(): boolean {
    const value = this.ownership?.institutionalOwnershipPercent;
    return value !== null && value !== undefined && Number.isFinite(value);
  }

  /** Reported filings can sum above 100% (double counting); clamp so the bar stays meaningful. */
  get institutionsPercent(): number {
    return this.round(Math.min(100, Math.max(0, this.ownership!.institutionalOwnershipPercent)));
  }

  get othersPercent(): number {
    return this.round(100 - this.institutionsPercent);
  }

  get tooltip(): string {
    if (!this.hasData) {
      return '';
    }
    const o = this.ownership!;
    const lines = [`Institutions: ${this.institutionsPercent}% of shares`];
    if (Number.isFinite(o.insiderOwnershipPercent)) {
      lines.push(`Insiders: ${this.round(o.insiderOwnershipPercent)}%`);
    }
    if (Number.isFinite(o.top10InstitutesPercent)) {
      lines.push(`Top 10 institutions: ${this.round(o.top10InstitutesPercent)}%`);
    }
    lines.push(`Retail, insiders & others: ${this.othersPercent}%`);
    return lines.join('\n');
  }

  private round(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
