import {Component, Input, OnInit} from "@angular/core";
import {MatTooltipModule} from "@angular/material/tooltip";

@Component({
  selector: "app-symbol-name-cell",
  standalone: true,
  imports: [
    MatTooltipModule
  ],
  templateUrl: "./symbol-name-cell.component.html",
  styleUrls: ["./symbol-name-cell.component.scss"]
})
export class SymbolNameCellComponent implements OnInit {

  @Input() name!: string

  constructor() {
  }

  ngOnInit(): void {
  }


}
