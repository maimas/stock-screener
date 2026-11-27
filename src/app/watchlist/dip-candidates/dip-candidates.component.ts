import {ORDER_NOTE} from "../recommendations";
import {groupBrief, NO_GROUPS, TIED_NOTE, TIED_TITLE, TiedGroup, TiedGroups} from "../tied-groups";
import {AboutComponent} from "../more/about.component";
import {MoreService} from "../more/more.service";
import {ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {Subscription} from "rxjs";
import {MatCardModule} from "@angular/material/card";
import {MatTooltipModule} from "@angular/material/tooltip";
import {DIP_PERCENT, MarketFear} from "../signal";
import {CARD_NOTE, FEAR_HIGH_SHORT} from "../evidence";
import {testedStrip} from "../tested-strip";

/** A stock marked DIP BUY, as the page describes it to its other parts (the plan, "Could add"). */
export type DipCandidate = {
  symbol: string
  /** The company's name, when it is known. */
  name?: string
  /** How far the price is below its highest of the past year, in %. A DIP BUY is one because it dropped, so it is known. */
  belowHigh: number
  /** The growth figure the stock is marked on: "profit +21%" or "sales +27%". */
  growthText: string
  /** Became a DIP BUY today, on a stock the daily log already knew. */
  isNew: boolean
  /** Reports its results within 2 weeks. */
  earningsSoon: boolean
  /** In any of the user's portfolios. */
  held: boolean
  /** In which, as a sentence ("You hold this in Savings."). */
  heldIn?: string
  /** Why it is marked, in one sentence. */
  headline: string
};

/** How many stocks on the page carry each mark, and how many have none (funds, companies too new to judge). */
export type MarkCounts = { dipBuy: number, watch: number, pass: number, none: number };

/** What the reader's choice to see the groups is kept under, with the page's other opened explanations. */
const GROUPS_KEY = 'dip.groups';

/**
 * "Dip candidates": the box at the top of the Watchlist that holds the table of the stocks marked DIP BUY.
 *
 * The owner, of the box as it was (a pane beside the lists with a small table of its own and paragraphs about it):
 * "maybe that can be a table on the top where it becomes a table like the other ones but more polished in terms of
 * prose". So the table is the lists' own table, handed in by the page (the same columns, order, AI column and
 * details as any list), and this box is its frame, three short lines:
 *
 *  - the title, with the three marks and how many stocks carry each, and which stocks were marked today;
 *  - where the market stands and how fearful it is;
 *  - what the mark was worth in the tests, as figures, the risk among them.
 *
 * What the box used to say in sentences is behind "How to read this"; which stocks move together (the letters of
 * the table's "Group" column) is behind "Groups". The table can be put away ("Hide the table"), which leaves the
 * three lines: on a day with twenty marks the lists begin a screen further down.
 *
 * The page hands in two things: `<app-claude-ask>` (the button that asks the AI about these stocks, set on the line
 * of the title as a list has it) and the table.
 */
@Component({
  selector: "app-dip-candidates",
  standalone: true,
  imports: [NgIf, NgForOf, MatCardModule, MatTooltipModule, AboutComponent],
  templateUrl: "./dip-candidates.component.html",
  styleUrls: ["./dip-candidates.component.scss"]
})
export class DipCandidatesComponent implements OnDestroy {
  /** How many stocks carry each mark: `dipBuy` is how many rows the table has. */
  @Input() marks: MarkCounts = {dipBuy: 0, watch: 0, pass: 0, none: 0};
  /** The stocks that became a DIP BUY today (their symbols), on stocks the daily log already knew. */
  @Input() fresh: string[] = [];
  /** What is said in place of the loading bars when no price arrived at all; empty otherwise. */
  @Input() instead = '';
  /** "Try again" under that sentence. */
  @Output() retry = new EventEmitter<void>();
  /** The first prices are in: until then the box only says that it is loading. */
  @Input() loaded = false;
  /** Where the market stands against its highest of the past year, as a sentence without its full stop. */
  @Input() indexLine = '';
  /** How fearful the market is, from the VIX. */
  @Input() fear?: MarketFear;
  /** How much the candidates are one bet: shared sector and how closely they have moved together. Behind "How to read this". */
  @Input() oneBet = '';
  /**
   * Which of the candidates moved together over the past year, as groups under a letter. The sentence about one
   * bet says that they are nearer to one; the owner asked which of them are tied, to be able to use it.
   */
  @Input() tied: TiedGroups = NO_GROUPS;
  /** The live record of the mark since the daily log began, and what the daily recorder last did. */
  @Input() trackText = '';
  @Input() recorderText = '';
  /** Set when the last re-run of the backtests needs a look. */
  @Input() evidenceText = '';

  /**
   * The table is put away: the three lines stay (the marks' counts, the market, the tested figures with their
   * risk), and the lists begin right under them. The page keeps the choice and hands it in.
   */
  @Input() folded = false;
  @Output() foldedChange = new EventEmitter<boolean>();

  /** Save the daily log as a file. */
  @Output() exportLog = new EventEmitter<void>();
  /** Asked for by the link that skips the box: the keyboard goes on to the lists. */
  @Output() skipToLists = new EventEmitter<void>();

  readonly tiedTitle = TIED_TITLE;
  readonly tiedNote = TIED_NOTE;
  /** Behind "How to read this": that an order by a column is the reader's own view, and that the page ranks nothing. */
  readonly orderNote = ORDER_NOTE;
  readonly dipPercent = DIP_PERCENT;
  readonly fearHighShort = FEAR_HIGH_SHORT;
  /** What each of the three marks means, a sentence each: on the mark, and first behind "How to read this". */
  readonly meanings = {
    dipBuy: `The price dropped ${DIP_PERCENT}% or more from its highest of the past year while the business keeps growing.`,
    watch: 'Growing, but no such drop yet.',
    pass: 'Not growing enough.',
  } as const;
  /** How stocks marked DIP BUY did in tests, in one paragraph: behind "How to read this". */
  readonly cardNote = CARD_NOTE;
  /**
   * The tested result as figures, the risk among them (`testedStrip`, shared with any other view that shows them).
   * The same numbers as the sentence (`cardNote`), which keeps the full account behind "How to read this".
   */
  readonly tested = testedStrip();
  /** Bars drawn while the first prices are arriving. */
  readonly placeholders = [1, 2, 3];
  /** The element the "Groups" control opens, for a screen reader. */
  readonly groupsId = 'dip-groups';

  private readonly changes: Subscription;

  constructor(private readonly more: MoreService, changeDetector: ChangeDetectorRef) {
    this.changes = this.more.changed.subscribe(() => changeDetector.markForCheck());
  }

  ngOnDestroy(): void {
    this.changes.unsubscribe();
  }

  /** What the count of stocks without a mark stands for: on that count, and in the page for a screen reader. */
  get unmarkedText(): string {
    const none = this.marks.none;
    return `${none} more ${none === 1 ? 'has' : 'have'} no mark: funds, and companies with too little history to judge.`;
  }

  /** Whether the reader asked to see which stocks move together: remembered like every opened explanation. */
  get groupsOpen(): boolean {
    return this.more.isOpen(GROUPS_KEY);
  }

  toggleGroups(): void {
    this.more.toggle(GROUPS_KEY);
  }

  /** "3 stocks, all Technology". */
  briefOf(group: TiedGroup): string {
    return groupBrief(group);
  }

  trackByLetter(_: number, group: TiedGroup): string {
    return group.letter;
  }

  skip(event: Event): void {
    event.preventDefault();
    this.skipToLists.emit();
  }
}
