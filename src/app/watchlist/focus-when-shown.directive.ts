import {AfterViewInit, Directive, ElementRef} from "@angular/core";

/**
 * Puts the keyboard into a field the moment the field appears. For a small form that opens on a click ("New list"):
 * what the reader does next is type, so the field is ready for it without a second click.
 * Only for a field that appears because the reader asked for it: on a field that is there when the page opens it
 * would take the keyboard away from wherever it was.
 */
@Directive({
  selector: "[appFocusWhenShown]",
  standalone: true,
})
export class FocusWhenShownDirective implements AfterViewInit {
  constructor(private readonly field: ElementRef<HTMLElement>) {
  }

  ngAfterViewInit(): void {
    this.field.nativeElement.focus();
  }
}
