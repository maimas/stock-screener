import {ChangeDetectionStrategy, Component, Input} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";

/** A piece of a phrase: words, or a figure. */
export type FigPart = { text: string, fig: boolean };

/**
 * A figure in a phrase: a percentage ("+21.1%", "−4.2%", "38.3%"), a dollar amount ("$12,400.50", "−$2,583") or a
 * share of a count ("4 in 10"). Counts of days or weeks and dates stay in the words: they say when, not how much.
 */
const FIGURE = /[+−-]?\d(?:[\d,]*\d)?(?:\.\d+)?%|[+−-]?\$\d(?:[\d,]*\d)?(?:\.\d+)?|\b\d+ in \d+\b/g;

/** A phrase cut into its figures and the words between them, every character kept in order. */
export function figuresOf(text: string): FigPart[] {
  const parts: FigPart[] = [];
  let from = 0;
  for (const match of text.matchAll(FIGURE)) {
    const at = match.index ?? 0;
    if (at > from) {
      parts.push({text: text.slice(from, at), fig: false});
    }
    parts.push({text: match[0], fig: true});
    from = at + match[0].length;
  }
  if (from < text.length) {
    parts.push({text: text.slice(from), fig: false});
  }
  return parts;
}

/**
 * A phrase of a stock's details with its figures set apart: `<app-fig-text [text]="value"></app-fig-text>` in place
 * of `{{ value }}`. The text is exactly the one given (the phrases stay where they are written and tested); each
 * figure is strong and does not wrap, so the eye lands on the number and a sign never ends a line alone.
 * The owner, 2026-11-26: "important info needs to catch the eye".
 */
@Component({
  selector: "app-fig-text",
  standalone: true,
  imports: [NgIf, NgForOf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-container *ngFor="let part of parts"><b class="fig" *ngIf="part.fig; else words">{{ part.text }}</b><ng-template #words>{{ part.text }}</ng-template></ng-container>`,
  styles: [`.fig { font-weight: 600; color: var(--ink); white-space: nowrap; }`],
})
export class FigTextComponent {
  parts: FigPart[] = [];

  @Input() set text(text: string | null | undefined) {
    this.parts = figuresOf(text ?? '');
  }
}
