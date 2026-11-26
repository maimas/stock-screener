import {Component, Input, OnInit} from "@angular/core";
import {MatTooltipModule} from "@angular/material/tooltip";
import {NumberUtils} from "../../../api/number-utils";
import {MatIconModule} from "@angular/material/icon";
import {FlexModule} from "@angular/flex-layout";
import {NgForOf} from "@angular/common";
import {StockForecast} from "../../../api/microsoft-money.service";

@Component({
  selector: "app-debt-to-ebitda",
  standalone: true,
  imports: [
    MatTooltipModule,
    MatIconModule,
    FlexModule,
    NgForOf
  ],
  templateUrl: "./debt-to-ebitda-cell.component.html",
  styleUrls: ["./debt-to-ebitda-cell.component.scss"]
})
export class DebtToEbitdaCellComponent implements OnInit {

  @Input()
  public keyRatios!: any


  get lastPeriod(): any {
    const metrics: any[] = this.keyRatios.companyMetrics
    const last = metrics[metrics.length - 1]
    return last;
  }

  get companyDebtToEbitda(): number {
    if (!this.industryDebtToEbitda || this.industryDebtToEbitda === 0) {
      return 0;
    }
    return NumberUtils.toFixed(this.lastPeriod.debtToEbitda, 2);
  }

  get industry(): string {
    return this.keyRatios.industry;
  }

  get industryDebtToEbitda(): number {
    const last = this.lastPeriod;
    const year = last.year;
    const fiscalPeriodType = last.fiscalPeriodType;
    const metrics: any[] = this.keyRatios.industryMetrics
    const lastIndustry = metrics.find(it => it.year === year && it.fiscalPeriodType === fiscalPeriodType)
    return NumberUtils.toFixed(lastIndustry.debtToEbitda, 2)
  }

  constructor() {
  }

  ngOnInit(): void {
  }

  get tooltip(): string {
    const term = this.companyDebtToEbitda > this.industryDebtToEbitda ? 'above' : 'below';
    return `Debt to EBITDA ${this.companyDebtToEbitda}% is ${term} the ${this.industry} industry average ${this.industryDebtToEbitda}%`
  }

  get indicatorColor(): string {
    return this.companyDebtToEbitda < this.industryDebtToEbitda ? 'black' : 'red'
  }

}
