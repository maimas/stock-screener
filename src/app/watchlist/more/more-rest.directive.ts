import {Directive, ElementRef, Input, OnChanges, OnDestroy} from "@angular/core";
import {Subscription} from "rxjs";
import {MoreService} from "./more.service";

/**
 * On an element that is the rest of an explanation (a further paragraph, a list): it is in the page and hidden
 * until the explanation with this key is opened by its "more" (`app-more`). With no key the element is always
 * shown, so that the first of a run of paragraphs can carry the attribute like the others.
 */
@Directive({
  selector: "[appMoreRest]",
  standalone: true,
})
export class MoreRestDirective implements OnChanges, OnDestroy {
  @Input("appMoreRest") key = '';
  private readonly changes: Subscription;

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly more: MoreService) {
    this.changes = this.more.changed.subscribe(() => this.show());
  }

  ngOnChanges(): void {
    this.show();
  }

  ngOnDestroy(): void {
    this.changes.unsubscribe();
  }

  private show(): void {
    this.element.nativeElement.hidden = !!this.key && !this.more.isOpen(this.key);
  }
}
