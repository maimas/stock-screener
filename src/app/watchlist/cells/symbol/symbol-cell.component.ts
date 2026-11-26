import {Component, Input, OnInit} from "@angular/core";
import {NgIf} from "@angular/common";
import {MatTooltipModule} from "@angular/material/tooltip";

@Component({
  selector: "app-symbol-cell",
  standalone: true,
  imports: [
    NgIf,
    MatTooltipModule
  ],
  templateUrl: "./symbol-cell.component.html",
  styleUrls: ["./symbol-cell.component.scss"]
})
export class SymbolCellComponent implements OnInit {

  @Input() symbol!: string
  /** The data source's id of the stock. Kept for the pages that set it; the link that used it is in the stock's details. */
  @Input() id!: string
  @Input() sector!: string
  /** The user has recorded a position in this stock, in any of their portfolios. */
  @Input() held = false
  /**
   * In which portfolios, as a sentence ("You hold this in Savings and Brokerage."): what the tag says to a screen
   * reader, and a line of the cell's mouse-over. Empty when the page does not say.
   */
  @Input() heldIn = ''

  /** The mouse-over of the cell: the company and its sector, then where the stock is held. */
  get tip(): string {
    return this.held && this.heldIn ? [this.sector, this.heldIn].filter(it => !!it).join('\n') : this.sector;
  }

  constructor() {
  }

  ngOnInit(): void {
  }


}
