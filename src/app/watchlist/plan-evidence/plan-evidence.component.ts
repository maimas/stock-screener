import {Component, Input} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {MoreComponent} from "../more/more.component";
import {MoreRestDirective} from "../more/more-rest.directive";
import {MatCardModule} from "@angular/material/card";
import {PlanStep} from "../plan";
import {EvidenceBlock, PLAN_BLOCKS} from "../evidence";

/**
 * "How the plan was tested": what the plan is and how it did when tested, then the evidence behind each step of
 * today's plan, caveats included, under the plan card's own verbs. It is kept off the plan card, which stays a
 * verb and a sentence a step, and sits at the bottom of the page where the plan card's last line leads.
 */
@Component({
  selector: "app-plan-evidence",
  standalone: true,
  imports: [NgForOf, NgIf, MatCardModule, MoreComponent, MoreRestDirective],
  templateUrl: "./plan-evidence.component.html",
  styleUrls: ["./plan-evidence.component.scss"]
})
export class PlanEvidenceComponent {
  @Input() steps: PlanStep[] = [];
  /** Prices are still arriving, so today's steps are not known yet. */
  @Input() loading = false;

  /**
   * What the plan is and how it did, next to the market: a paragraph a thought, and a small table wherever a test
   * has like figures to set side by side (evidence.ts). The app's own account, unless a test hands in another.
   */
  @Input() blocks: readonly EvidenceBlock[] = PLAN_BLOCKS;

  /** The evidence behind each step of today's plan, in the plan's order. */
  get reasons(): { verb: string, why: string }[] {
    return this.loading ? [] : this.steps.map(step => ({verb: step.verb, why: step.why}));
  }

  trackByVerb(_: number, reason: { verb: string }): string {
    return reason.verb;
  }

  /**
   * What a paragraph is about, when it begins by saying so: a few words and a colon ("How many:"), or a short
   * question ("Does that make money?"). Nothing for a paragraph that starts with a sentence.
   */
  leadIn(part: string): string {
    const end = part.search(/: |\? /);
    const opening = end < 0 ? '' : part.slice(0, end);
    return opening && opening.length <= 28 && !/[.?!,:]/.test(opening) ? part.slice(0, end + 1) : '';
  }

  /** The paragraph after those words (the whole of it when it has none). */
  rest(part: string): string {
    const about = this.leadIn(part);
    return about ? part.slice(about.length) : part;
  }

  trackByIndex(index: number): number {
    return index;
  }

  /**
   * A click reached a button of THE PLAN's account ("more" at the end of its first paragraph, "less" at the end
   * of its last). By then the button has done its work. When that closed the account from its end, the paragraph
   * the button stands in is hidden and the keyboard would be left on nothing: it goes to the "more" the account
   * is opened with.
   */
  closedFromEnd(event: Event): void {
    const pressed = event.currentTarget as HTMLElement;
    if (pressed.closest('p')?.hidden) {
      pressed.closest('dd')?.querySelector<HTMLElement>('p.lead button')?.focus();
    }
  }
}
