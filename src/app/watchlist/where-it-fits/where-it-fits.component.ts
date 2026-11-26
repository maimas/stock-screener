import {Component, Input} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {FITS_NO_PORTFOLIO, FITS_NOTE, FITS_NOT_MARKED, FITS_TITLE} from "../recommendations";

/**
 * "Where it fits", in a stock's details on the Watchlist: the size the stock would take in each portfolio, a line
 * a portfolio, as the Portfolio view lists it under "Could add". Only a stock marked DIP BUY gets a size; for any
 * other the section says so instead of working out an amount the tests do not cover.
 */
@Component({
  selector: "app-where-it-fits",
  standalone: true,
  imports: [NgIf, NgForOf],
  templateUrl: "./where-it-fits.component.html",
  styleUrls: ["./where-it-fits.component.scss"]
})
export class WhereItFitsComponent {
  /** "Brokerage: 20.1% ($2,013)", "Retirement: you own it; add 8.4% ($840)": a line for each portfolio. */
  @Input() lines: string[] = [];
  /** Whether the stock is marked DIP BUY now. */
  @Input() marked = false;

  readonly title = FITS_TITLE;
  readonly note = FITS_NOTE;
  readonly notMarked = FITS_NOT_MARKED;
  readonly noPortfolio = FITS_NO_PORTFOLIO;
}
