import {ChangeDetectionStrategy, Component, Input} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";

/** A piece of a sentence: plain words, or a signed amount that has to stay on one line. */
export type TextPart = { text: string, keep: boolean };

/** A sign followed by a dollar amount: "+$540", "−$2,583", "-$1,250.75". It ends on a digit, not on a comma after it. */
const SIGNED_AMOUNT = /[+−-]\$\d(?:[\d,]*\d)?(?:\.\d+)?/g;

/**
 * A sentence cut into its signed dollar amounts and the words between them, every character kept in order.
 * A browser may end a line between a sign and the dollar sign after it (both count as something that stands in
 * front of a number), so a sentence could show "... at once: −" and "$2,583" on the next line, where the loss
 * reads as a gain. A percentage ("−46.9%") and an amount without a sign cannot be split that way.
 */
export function partsOf(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let from = 0;
  for (const match of text.matchAll(SIGNED_AMOUNT)) {
    const at = match.index ?? 0;
    if (at > from) {
      parts.push({text: text.slice(from, at), keep: false});
    }
    parts.push({text: match[0], keep: true});
    from = at + match[0].length;
  }
  if (from < text.length) {
    parts.push({text: text.slice(from), keep: false});
  }
  return parts;
}

/**
 * A sentence of the page that may hold signed dollar amounts: `<app-says [text]="line"></app-says>` in place of
 * `{{ line }}`. It shows exactly the text it is given (the sentences themselves stay where they are written and
 * tested); each signed amount is in an element that does not wrap.
 */
@Component({
  selector: "app-says",
  standalone: true,
  imports: [NgIf, NgForOf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-container *ngFor="let part of parts"><span class="keep" *ngIf="part.keep; else words">{{ part.text }}</span><ng-template #words>{{ part.text }}</ng-template></ng-container>`,
  styles: [`.keep { white-space: nowrap; }`],
})
export class SaysComponent {
  parts: TextPart[] = [];

  @Input() set text(text: string | null | undefined) {
    this.parts = partsOf(text ?? '');
  }
}
