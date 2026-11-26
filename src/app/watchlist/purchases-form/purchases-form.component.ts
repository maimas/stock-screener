import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, QueryList, ViewChildren} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {PriceDirective} from "../price.directive";
import {MatButtonModule} from "@angular/material/button";
import {money} from "../format";
import {Trade} from "../position-panel/position-panel.component";
import {Position, purchaseProblem} from "../positions";
import {
  cashAfter, CHECK_FIRST, coveredByCash, isPositive, keptShareCaution, leftAsItIs, overCash, purchaseCaution, purchaseTrade, startFrom
} from "../purchase-words";

/** One stock the form is opened for: what is held of it, today's price, and the amount its row gives it. */
export type PurchaseLine = { symbol: string, held?: Position, price?: number, dollars?: number };

/** A line as it is typed. */
type Row = PurchaseLine & { shares: number | null, paid: number | null };

/** The form's first line: what it is. The same words as the form for one purchase, in the plural. */
export const RECORDS_SEVERAL = 'This records purchases you have made. Nothing is bought here.';
/** Under it: where the numbers come from, and how a stock is left out. */
export const SEVERAL_INTRO = 'Filled in from the rows you ticked, at today\'s prices. Change each to what you bought; ' +
  'empty the shares of a stock to leave it out.';

/**
 * Several purchases recorded in one step: the stocks ticked in "Could add". The reader ticks the stocks they are
 * thinking of buying, the box splits the cash between them, they buy at their broker, and then they had to open
 * and save a form a stock. This is one form with a line a stock, filled in like the form for one purchase (the
 * amount the reader sees beside each ticked row, at today's price), one day and one box for the cash, saved in one
 * step and taken back in one step.
 *
 * It records purchases that were made. It places no order, and it is opened only for the stocks the reader ticked.
 */
@Component({
  selector: "app-purchases-form",
  standalone: true,
  imports: [NgIf, NgForOf, FormsModule, MatButtonModule, PriceDirective],
  templateUrl: "./purchases-form.component.html",
  styleUrls: ["./purchases-form.component.scss"]
})
export class PurchasesFormComponent implements OnChanges, AfterViewInit {
  /** The ticked stocks, in the order of the table. */
  @Input() lines: PurchaseLine[] = [];
  @Input() today = '';
  /** The cash recorded for the portfolio, when there is any record of it: the purchases can be taken out of it. */
  @Input() cash?: number;
  /** The dollars the user keeps outside stocks, when they set such a share. */
  @Input() keep?: number | null;

  @Output() trades = new EventEmitter<Trade[]>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChildren('sharesField') private sharesFields?: QueryList<ElementRef<HTMLInputElement>>;

  /** The name of the portfolio the purchases are recorded into: said in the first line and in the box about the cash. */
  @Input() portfolio = '';

  /** The reader changed something in the form: the box then keeps it open while a line is left (see could-add). */
  @Output() typed = new EventEmitter<void>();

  get what(): string {
    return this.portfolio ? `This records purchases you have made in ${this.portfolio}. Nothing is bought here.` : RECORDS_SEVERAL;
  }

  /** The box about the cash, naming whose cash it is. */
  get cashLabel(): string {
    return this.portfolio ? `Paid from the cash of ${this.portfolio} (${this.cashShown})` : `Paid from this portfolio's cash (${this.cashShown})`;
  }
  readonly intro = SEVERAL_INTRO;

  rows: Row[] = [];
  day = '';
  viaCash = false;
  /** The reader set that box themself: from then on it no longer follows the numbers. */
  cashChosen = false;
  /** Saving was tried, or a field was changed: from then on a problem is said. */
  attempted = false;
  touched = false;
  /** Which stocks the form was last filled for, so that prices arriving again do not wipe what is being typed. */
  private filledFor = '';

  ngOnChanges(): void {
    const key = this.lines.map(line => line.symbol).join(' ');
    if (key !== this.filledFor && this.touched && this.filledFor !== '') {
      // A row was ticked or unticked while the reader was typing: the lines that stay keep what they hold, a new
      // one is filled in from its row, and nothing else of the form starts again. Unticking a row used to empty
      // the form of everything typed.
      this.filledFor = key;
      const typed = new Map(this.rows.map(row => [row.symbol, row]));
      this.rows = this.lines.map(line => typed.get(line.symbol) ?? {...line, ...startFrom(line.dollars, line.price)});
      if (!this.cashChosen) {
        this.viaCash = coveredByCash(this.total, this.cash);
      }
      return;
    }
    if (key !== this.filledFor) {
      this.filledFor = key;
      // Shares rounded down (`startFrom`): the lines together never come to more than the amounts they start from.
      this.rows = this.lines.map(line => ({...line, ...startFrom(line.dollars, line.price)}));
      this.day = this.today;
      this.attempted = false;
      this.touched = false;
      // Taken out of the cash when the cash recorded covers all that is filled in, as in the form for one purchase.
      this.cashChosen = false;
      this.viaCash = coveredByCash(this.total, this.cash);
    }
  }

  /** A field was changed: the box about the cash follows the new sum, unless the reader set it themself. */
  changed(): void {
    this.touched = true;
    if (!this.cashChosen) {
      this.viaCash = coveredByCash(this.total, this.cash);
    }
    this.typed.emit();
  }

  /**
   * The form opens on a click, and what the reader does next is type: the keyboard goes into the first number of
   * shares, selected, so that the first key replaces the suggestion. As in the form for one purchase.
   */
  ngAfterViewInit(): void {
    Promise.resolve().then(() => {
      const first = this.sharesFields?.first?.nativeElement;
      first?.focus();
      first?.select();
    });
  }

  get cashShown(): string {
    return money(this.cash);
  }

  /** The lines that count: a stock whose shares were emptied is left out. */
  private get entered(): Row[] {
    return this.rows.filter(row => row.shares !== null);
  }

  /** What a line comes to, in dollars, once both of its numbers are there. */
  costOf(row: Row): string {
    return isPositive(row.shares) && isPositive(row.paid) ? money(row.shares * row.paid) : '';
  }

  private get total(): number {
    return this.entered.reduce((sum, row) => sum + (row.shares ?? 0) * (row.paid ?? 0), 0);
  }

  /** What is wrong, said for the first line it is wrong in; or that every line was emptied; or too little cash. */
  get problem(): string | undefined {
    if (this.entered.length === 0) {
      return 'Enter the shares of at least one stock.';
    }
    for (const row of this.entered) {
      const wrong = purchaseProblem({shares: row.shares ?? undefined, price: row.paid ?? undefined, day: this.day || undefined}, this.today);
      if (wrong) {
        return `${row.symbol}: ${wrong}`;
      }
    }
    return overCash(this.total, this.cash, this.viaCash);
  }

  get shownProblem(): string | undefined {
    return this.attempted || this.touched ? this.problem : undefined;
  }

  /** Whether a field of a line that counts is the one with the problem, once the problem is said: it is then marked. */
  wrong(row: Row, field: 'shares' | 'paid'): 'true' | null {
    if (!this.shownProblem || row.shares === null) {
      return null;
    }
    const value = field === 'shares' ? row.shares : row.paid;
    return typeof value === 'number' && value > 0 ? null : 'true';
  }

  /** What all the lines come to, and what that does to the cash. Empty beside a problem. */
  get result(): string {
    if (this.problem) {
      return '';
    }
    const count = this.entered.length;
    // A stock whose shares were emptied is left out, and the form says which: it used to go without a word.
    const out = this.rows.filter(row => row.shares === null).map(row => row.symbol);
    const left = out.length === 0 ? '' : ` ${out.slice(0, -1).join(', ')}${out.length > 1 ? ' and ' : ''}${out[out.length - 1]} ` +
      `${out.length === 1 ? 'is' : 'are'} left out.`;
    return `That is ${money(this.total)} for ${count} stock${count === 1 ? '' : 's'}.${cashAfter(this.total, this.cash, this.viaCash)}` +
      `${leftAsItIs(this.total, this.cash, this.viaCash)}${left}`;
  }

  /** What looks like a slip of a finger in any line, named by its stock. It stops nothing. */
  get caution(): string {
    if (this.problem) {
      return '';
    }
    const said = this.entered.flatMap(row => {
      const line = purchaseCaution({shares: row.shares ?? undefined, price: row.paid ?? undefined, day: this.day || undefined},
        {todayPrice: row.price, rowDollars: row.dollars, today: this.today});
      return line ? [`${row.symbol}: ${line}`] : [];
    });
    return said.length ? `${said.join(' ')} ${CHECK_FIRST}` : '';
  }

  /** What the purchases would do to the share kept outside stocks, when they take the cash under it. Stops nothing. */
  get keptNote(): string {
    return this.problem ? '' : keptShareCaution(this.total, {cash: this.cash, keep: this.keep, viaCash: this.viaCash, several: this.entered.length > 1});
  }

  submit(): void {
    this.attempted = true;
    if (this.problem) {
      return;
    }
    this.trades.emit(this.entered.map(row =>
      purchaseTrade(row.symbol, row.held, {shares: row.shares!, price: row.paid!, day: this.day || undefined}, this.viaCash)));
    this.attempted = false;
    this.touched = false;
  }

  trackBySymbol(_: number, row: Row): string {
    return row.symbol;
  }
}
