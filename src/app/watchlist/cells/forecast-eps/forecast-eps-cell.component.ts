import {Component, Input, OnInit} from "@angular/core";
import {MatTooltipModule} from "@angular/material/tooltip";
import {NumberUtils} from "../../../api/number-utils";
import {MatIconModule} from "@angular/material/icon";
import {FlexModule} from "@angular/flex-layout";
import {NgForOf} from "@angular/common";
import {StockForecast} from "../../../api/microsoft-money.service";

@Component({
  selector: "app-forecast-eps",
  standalone: true,
  imports: [
    MatTooltipModule,
    MatIconModule,
    FlexModule,
    NgForOf
  ],
  templateUrl: "./forecast-eps-cell.component.html",
  styleUrls: ["./forecast-eps-cell.component.scss"]
})
export class ForecastEpsCellComponent implements OnInit {

  @Input()
  public forecast!: StockForecast

  epcForecast: number = 0.740
  epc: number = 0.710
  missesInARow: number[] = [1, 2]

  constructor() {
  }

  ngOnInit(): void {
  }

  get tooltip(): string {
    return `Forecast/ECP ${this.epcForecast}/${this.epc}
    Surprise ${this.epsSurprise}
    Misses in a row ${this.missesInARow.length}`
  }

  get epsSurpriseColor(): string {
    return this.epsSurprise > 0 ? 'green' : 'red';
  }

  get epsSurprise(): number {
    const average = (this.epc + this.epcForecast) / 2;
    const absoluteDifference = (this.epc - this.epcForecast);
    const percentDifference = (absoluteDifference / average) * 100;

    return NumberUtils.toFixed(percentDifference, 2);
  }
}
