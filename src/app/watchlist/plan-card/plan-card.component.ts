import {Component, EventEmitter, Input, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {asks, PlanItem, PlanStep, saidInRows, StepKind, toDoVerbs} from "../plan";
import {testedStrip} from "../tested-strip";
import {COULD_ADD} from "../recommendations";

/** How the line about what changed starts on a day nothing did (whats-new.ts writes it). */
const NOTHING_CHANGED = 'Nothing changed';

/** The box's name as the plan's sentences write it: in quotes. */
const BOX_NAME = `"${COULD_ADD}"`;

/**
 * The lines of "Your plan today": the tested plan applied to the portfolio being shown. They are not a box of
 * their own: the page puts them inside that portfolio's box (positions-card), under its cash and limit and above
 * the table of what it holds. Deliberately the plainest thing on the page: what there is to do today, by name,
 * then a verb, the stocks with their amounts and one short line a step. Nothing opens or expands.
 *
 * A step that only says where a stock you own stands (keep, no opinion) is not a line here: the table under these
 * lines says it once, in that stock's own row.
 *
 * The evidence behind the steps is in one place, "How the plan was tested" at the bottom of the page, which the
 * last line leads to.
 */
@Component({
  selector: "app-plan-card",
  standalone: true,
  imports: [NgIf, NgForOf],
  templateUrl: "./plan-card.component.html",
  styleUrls: ["./plan-card.component.scss"]
})
export class PlanCardComponent {
  /** The whole plan for the portfolio being shown. */
  @Input() steps: PlanStep[] = [];
  /** Prices are still arriving. Until every list has loaded the steps are not shown: half the prices give a wrong plan. */
  @Input() loading = false;
  /**
   * What stands in place of the plan when it cannot be worked out (no price arrived; the saved portfolios could
   * not be read): a sentence, with "Try again" under it. Empty otherwise.
   */
  @Input() instead = '';
  /** "Try again" under that sentence. */
  @Output() retry = new EventEmitter<void>();
  /** Open a stock's row details. */
  @Output() open = new EventEmitter<string>();
  /** Show how the plan was tested (the box at the bottom of the page). */
  @Output() tests = new EventEmitter<void>();
  /** Show the "Could add" box, which the BUY line points to: on a laptop it is two screens down. */
  @Output() couldAdd = new EventEmitter<void>();

  /**
   * What the plan did in its test, as figures with their names: the same strip as the Watchlist shows (the newest
   * test, by the owner's choice), with the loss among the figures. It took the place of one sentence, which gave
   * the average and the market's and no loss.
   */
  readonly tested = testedStrip();
  /** With the limits of those figures, on the same quiet line. */
  readonly disclaimer = 'Not advice; no guarantee.';

  trackByLabel(_: number, figure: { label: string }): string {
    return figure.label;
  }

  /** The lines to show: none while prices are still arriving, and never the steps the table says row by row. */
  get shownSteps(): PlanStep[] {
    return this.loading ? [] : this.steps.filter(step => !saidInRows(step));
  }

  /**
   * "To do today: SELL SOME, BUY." / "Nothing to do today." What the plan expects is named with the words its
   * filled marks carry, so each can be found in the lines under it; a count would say only that something is.
   */
  get headline(): string {
    const verbs = toDoVerbs(this.steps);
    return verbs.length === 0 ? 'Nothing to do today.' : `To do today: ${verbs.join(', ')}.`;
  }

  /**
   * The verbs the lead names, each with the kind of its step: the page sets each in the colour of its own mark in
   * the lines under the lead. The same steps, in the same order, as `headline` names.
   */
  get leadVerbs(): { verb: string, kind: StepKind }[] {
    return this.steps.filter(asks).map(({verb, kind}) => ({verb, kind}));
  }

  /**
   * The plan has no step at all: nothing is owned and nothing on the page is worth buying. One sentence then says
   * so, in place of the count. A plan whose steps are all in the table is not empty.
   */
  get empty(): boolean {
    return !this.loading && this.steps.length === 0;
  }

  /** Whether a step asks for something. Those wear a filled mark, so what the line above names can be found at a glance. */
  asks(step: PlanStep): boolean {
    return asks(step);
  }

  showTests(): void {
    this.tests.emit();
  }

  /**
   * For the line that says what changed since the last day in the log: whether anything did. The lead can read
   * the same for weeks; this is the line that differs from day to day, so it is set firmer on a day something
   * changed (it names a stock, or says the market turned) and quieter on a day nothing did. Nothing for any
   * other line.
   */
  newsOf(step: PlanStep): 'changed' | 'unchanged' | undefined {
    if (step.kind !== 'news') {
      return undefined;
    }
    return step.items.length > 0 || !step.text.startsWith(NOTHING_CHANGED) ? 'changed' : 'unchanged';
  }

  /**
   * A step's sentence in three parts when it names the "Could add" box in quotes: what stands before the name, the
   * name as written, and what follows. The page shows the name as a jump to that box; the sentence reads the same.
   */
  boxNamedIn(step: PlanStep): { before: string, name: string, after: string } | null {
    const at = step.text.indexOf(BOX_NAME);
    return at < 0 ? null : {before: step.text.slice(0, at), name: BOX_NAME, after: step.text.slice(at + BOX_NAME.length)};
  }

  trackByKind(_: number, step: PlanStep): string {
    return step.kind;
  }

  /**
   * The verbs of the lead are worked out on every look: each is known again by its step, so that the page keeps
   * the node it drew. Without it they were built anew on every key press.
   */
  trackByVerb(_: number, verb: { verb: string, kind: StepKind }): string {
    return `${verb.kind} ${verb.verb}`;
  }

  trackBySymbol(_: number, item: PlanItem): string {
    return item.symbol;
  }
}
