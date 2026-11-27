import {Component, Input} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {MoreRestDirective} from "../more/more-rest.directive";
import {FitCases} from "../fit-cases";
import {FITS_NO_PORTFOLIO, FITS_NOTE, FITS_TITLE} from "../recommendations";

/**
 * "Where it fits", in a stock's details on the Watchlist: the size the stock would take in each portfolio, a line
 * a portfolio, as the Portfolio view lists it under "Could add". Only a stock marked DIP BUY gets a size, so the
 * page shows this section under those stocks only: under any other it stood as a heading over "No size: it is not
 * marked DIP BUY.", and the owner had that removed.
 */
@Component({
  selector: "app-where-it-fits",
  standalone: true,
  imports: [NgIf, NgForOf, MoreRestDirective],
  templateUrl: "./where-it-fits.component.html",
  styleUrls: ["./where-it-fits.component.scss"]
})
export class WhereItFitsComponent {
  /** "Brokerage: 20.1% ($2,013)", "Retirement: you own it; add 8.4% ($840)": a line for each portfolio. */
  @Input() lines: string[] = [];
  /** What its size in the portfolio being shown could lose or make; left out for a stock that has no size there. */
  @Input() cases?: FitCases;

  readonly title = FITS_TITLE;
  readonly note = FITS_NOTE;
  readonly noPortfolio = FITS_NO_PORTFOLIO;
}
