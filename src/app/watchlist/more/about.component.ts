import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy} from "@angular/core";
import {Subscription} from "rxjs";
import {MoreService} from "./more.service";

let made = 0;

/**
 * The one place a box keeps its explanations: a small control, "How to read this", and under it, once asked for,
 * the sentences that explain the box (what a column is, what a letter means, what was tested and what was not):
 *
 *     <app-about key="dip.about">
 *       <p class="note">{{ tiedNote }}</p>
 *       <p class="note">{{ orderNote }}</p>
 *     </app-about>
 *
 * The owner, of a page where every explanation already showed its first sentence only: "there is too much text and
 * not much signal". A box had up to six such first sentences, each with its own "more". Here they are out of the
 * eye's way together, one click from where they belong, and what the reader opened is remembered (`MoreService`),
 * like a single "more".
 *
 * Nothing is taken away: the sentences are in the page while the control is closed (hidden, so neither the eye nor
 * a screen reader meets them before they are asked for), and stay where they are written and tested.
 */
@Component({
  selector: "app-about",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="about-toggle" [attr.aria-expanded]="open" [attr.aria-controls]="id" (click)="toggle()">{{ label }}</button>
<div class="about-body" [id]="id" [hidden]="!open"><ng-content></ng-content></div>`,
  styleUrls: ["./about.component.scss"],
})
export class AboutComponent implements OnDestroy {
  /** Which box's explanations these are: what is remembered. */
  @Input() key = '';
  /** The words on the control. They say what is behind it, so that it can be passed over by who knows the box. */
  @Input() label = 'How to read this';

  readonly id = `about-${++made}`;
  private readonly changes: Subscription;

  constructor(private readonly more: MoreService, changeDetector: ChangeDetectorRef) {
    this.changes = this.more.changed.subscribe(() => changeDetector.markForCheck());
  }

  ngOnDestroy(): void {
    this.changes.unsubscribe();
  }

  /** Whether the explanations are shown. Read from outside too: a link elsewhere in a box can open them (see `toggle`). */
  get open(): boolean {
    return this.more.isOpen(this.key);
  }

  /** Opens or closes them. Called from outside too, by a link that leads to what is behind the control. */
  toggle(): void {
    this.more.toggle(this.key);
  }
}
