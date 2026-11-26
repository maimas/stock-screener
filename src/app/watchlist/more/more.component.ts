import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy} from "@angular/core";
import {NgIf} from "@angular/common";
import {Subscription} from "rxjs";
import {SaysComponent} from "../says/says.component";
import {Cut, firstSentence} from "./first-sentence";
import {MoreService} from "./more.service";

/** How much of a first sentence names its button: enough to tell it from the others, not the whole of it. */
const LABEL_LENGTH = 60;

/**
 * An explanation that shows its first sentence, with "more" at its end to open the rest in place:
 * `<p class="note"><app-more key="could-add.notes" [text]="sizeNote"></app-more></p>` in place of `{{ sizeNote }}`.
 *
 * Nothing of the text is taken away: all of it is in the page, the part after the first sentence hidden until it
 * is asked for, so the paragraph still reads in full to whatever reads the page's text (the sentences stay where
 * they are written and tested). What the reader opened is remembered (`MoreService`).
 *
 * Without a text it is the button alone, at the end of a heading or of a sentence written in the template: what
 * it opens are the elements that carry `appMoreRest` with the same key (a list, further paragraphs). `group` says
 * that there are such elements also when a text is given, so the button shows even after a single sentence.
 *
 * The button's word is drawn by the style sheet and its name is given to a screen reader in words: so the text of
 * the paragraph it stands in is the explanation and nothing else.
 */
@Component({
  selector: "app-more",
  standalone: true,
  imports: [NgIf, SaysComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-container *ngIf="text !== undefined"><app-says [text]="cut.first"></app-says><span class="rest" [hidden]="!open"><app-says [text]="cut.rest"></app-says></span></ng-container><button *ngIf="hasMore" type="button" class="toggle" [attr.aria-expanded]="open" [attr.aria-label]="label" (click)="toggle()"></button>`,
  styleUrls: ["./more.component.scss"],
})
export class MoreComponent implements OnChanges, OnDestroy {
  /** Which explanation this is: what is remembered, and what the elements with `appMoreRest` are opened by. */
  @Input() key = '';
  /** The explanation. Left out when the button stands after words written in the template. */
  @Input() text?: string;
  /** More belongs to this explanation than its own text (elements with `appMoreRest`). */
  @Input() group = false;
  /**
   * What the button opens, in a few words ("the worked example"), where it stands alone after words written in the
   * template. With a text of its own the button is named by the start of that text.
   */
  @Input() what = '';

  cut: Cut = {first: '', rest: ''};
  private readonly changes: Subscription;

  constructor(private readonly more: MoreService, changeDetector: ChangeDetectorRef) {
    this.changes = this.more.changed.subscribe(() => changeDetector.markForCheck());
  }

  ngOnChanges(): void {
    this.cut = firstSentence(this.text ?? '');
  }

  ngOnDestroy(): void {
    this.changes.unsubscribe();
  }

  get open(): boolean {
    return this.more.isOpen(this.key);
  }

  /** There is something to open: more of the text, or the elements that belong to it. */
  get hasMore(): boolean {
    return this.text === undefined || this.group || this.cut.rest !== '';
  }

  /**
   * The button's name for a screen reader. It starts with the word that is drawn on it and says what it opens:
   * a view had eleven of these buttons, all with one name.
   */
  get label(): string {
    const start = this.cut.first.trim();
    const quoted = start.length > LABEL_LENGTH ? `${start.slice(0, start.lastIndexOf(' ', LABEL_LENGTH))}…` : start;
    const of = this.what || (quoted ? `"${quoted}"` : 'this explanation');
    return this.what ? `${this.open ? 'less' : 'more'}: ${of}`
      : this.open ? `less: only the start of ${of}` : `more: the rest of ${of}`;
  }

  toggle(): void {
    this.more.toggle(this.key);
  }
}
