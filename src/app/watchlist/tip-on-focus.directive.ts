import {Directive, HostListener} from "@angular/core";
import {MatTooltip} from "@angular/material/tooltip";

/**
 * Shows an element's explanation (its Material tooltip) also when the keyboard focus is inside the element, not
 * only under the pointer. A column heading holds a button that sorts; the explanation of the column is on the
 * heading around it, and Material shows a tooltip only for the element it is on. With this, reaching the button
 * with the Tab key shows what the column means.
 */
@Directive({
  selector: "[matTooltip][appTipOnFocus]",
  standalone: true,
})
export class TipOnFocusDirective {
  constructor(private readonly tip: MatTooltip) {
  }

  @HostListener("focusin")
  show(): void {
    this.tip.show();
  }

  @HostListener("focusout")
  hide(): void {
    this.tip.hide();
  }
}
