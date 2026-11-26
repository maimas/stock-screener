import {Component, Input, OnChanges} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";
import {Stock} from "../../api/microsoft-money.service";
import {MoreRestDirective} from "../more/more-rest.directive";
import {Business, BUSINESS_HOW_TO_READ, BUSINESS_NOTE, businessOf, BusinessRow, hasBusiness, similarLine} from "./business";

/**
 * "The business" in a stock's details: what the company keeps of its sales and earns on the money in it, each
 * beside its industry's figure; and, in the sentences the details' control opens, what the company does and the
 * companies the data source lists beside it. All of it arrives with the request the page already makes; nothing
 * is fetched for it. The owner asked to see it ("show the MSN moat info") after research found that none of it
 * should change a mark: it is context, said in rows, with no verdict.
 */
@Component({
  selector: "app-business-facts",
  standalone: true,
  imports: [NgIf, NgForOf, MatTooltipModule, MoreRestDirective],
  templateUrl: "./business-facts.component.html",
  styleUrls: ["./business-facts.component.scss"],
})
export class BusinessFactsComponent implements OnChanges {
  @Input() stock?: Stock;

  readonly note = BUSINESS_NOTE;
  readonly howToRead = BUSINESS_HOW_TO_READ;
  /** Worked out when the stock changes and kept: the rows are not built anew on every look at the page. */
  business: Business = {rows: [], similar: [], more: 0, does: ''};
  similarLine = '';
  shown = false;

  ngOnChanges(): void {
    this.business = businessOf(this.stock);
    this.similarLine = similarLine(this.business.similar, this.business.more);
    this.shown = hasBusiness(this.business);
  }

  trackByLabel(_: number, row: BusinessRow): string {
    return row.label;
  }
}
