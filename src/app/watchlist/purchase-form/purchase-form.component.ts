import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild} from "@angular/core";
import {NgIf} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {MatButtonModule} from "@angular/material/button";
import {FocusWhenShownDirective} from "../focus-when-shown.directive";
import {PriceDirective} from "../price.directive";
import {money, shareCount} from "../format";
import {Trade} from "../position-panel/position-panel.component";
import {Position, purchaseProblem, withPurchase} from "../positions";
import {
  cashAfter, CHECK_FIRST, coveredByCash, keptShareCaution, leftAsItIs, overCash, purchaseCaution, purchaseTrade, startFrom
} from "../purchase-words";

/**
 * What the form is, said as its first line, and what "Add" in a row is, said where the pointer rests on it. A form
 * with a quantity, a price, today's date and a total looks like an order ticket, and in "Could add" the word "add"
 * otherwise means buying: so both say that this is a record of something done.
 */
export const RECORDS_ONLY = 'This records a purchase you have made. Nothing is bought here.';
export const ADD_TIP = 'Record a purchase you made. Nothing is bought here.';

/** What the reader had typed into the form, kept by the page while the form of another row is open. */
export interface PurchaseDraft {
  shares: number | null;
  paid: number | null;
  day: string;
  viaCash: boolean;
  cashChosen: boolean;
}

/**
 * A purchase recorded where the stock is listed, without a trip to its details: in a row of "Could add". The form
 * arrives filled in with the amount that row gives the stock (its size, or what the cash gives it once it is
 * ticked) at today's price, so that a purchase made as the page says takes one click; every field can be changed
 * to what was really bought.
 *
 * It records a purchase that was made. It does not place an order and it picks no stock: the page shows it for the
 * row the reader asked for.
 *
 * What it hands the page is the same thing a stock's details hand it (`Trade`): the holding that results and what
 * the purchase does to the cash, saved in one step and taken back in one step. For a stock that is held already
 * the purchase is added to the holding and the price paid is averaged (`withPurchase`).
 */
@Component({
  selector: "app-purchase-form",
  standalone: true,
  imports: [NgIf, FormsModule, MatButtonModule, FocusWhenShownDirective, PriceDirective],
  templateUrl: "./purchase-form.component.html",
  styleUrls: ["./purchase-form.component.scss"]
})
export class PurchaseFormComponent implements OnChanges, AfterViewInit {
  @Input() symbol = '';
  /** What is held of the stock already, when it is held: the purchase is added to it. */
  @Input() held?: Position;
  /** Today's price: what the price paid starts from, and what the amount is turned into shares at. */
  @Input() price?: number;
  /** The amount the form starts from, in dollars: what the row gives the stock. None while the row has no size. */
  @Input() dollars?: number;
  @Input() today = '';
  /** The cash recorded for the portfolio, when there is any record of it: the purchase can be taken out of it. */
  @Input() cash?: number;
  /** The dollars the user keeps outside stocks, when they set such a share: a purchase that takes the cash under it is pointed out. */
  @Input() keep?: number | null;

  /**
   * What the reader had typed for this stock when the form was closed by opening another row's: the form comes back
   * as it was left. Opening a second row used to drop what was typed in the first without a word.
   */
  @Input() draft?: PurchaseDraft;

  /**
   * The name of the portfolio the purchase is recorded into. The form says it in its first line and in the box
   * about the cash: with several portfolios, one of which may be pretend money, the name on the page can be
   * scrolled out of sight, and a purchase recorded into the wrong one bends the sizes of two.
   */
  @Input() portfolio = '';

  @Output() trade = new EventEmitter<Trade>();
  @Output() cancel = new EventEmitter<void>();
  /** What the form holds, after each change by the reader: the page keeps it for this stock. */
  @Output() typed = new EventEmitter<PurchaseDraft>();

  @ViewChild('sharesField') private sharesField?: ElementRef<HTMLInputElement>;

  shares: number | null = null;
  paid: number | null = null;
  day = '';
  /** The purchase is settled against the portfolio's cash (the box in the form). */
  viaCash = false;
  /** The reader set that box themself: from then on it no longer follows the numbers. */
  cashChosen = false;
  /** Set once the reader tried to save, so a problem is only pointed out after they had a chance to fill the form. */
  attempted = false;
  /**
   * Set once the reader changed a field. From then on a problem is said while they type, where it can be put right
   * at once, and not only after "Record this purchase".
   */
  touched = false;
  /** The form came back as the reader had left it, not filled in from the row: its first line says so. */
  filledFromDraft = false;
  /** Which stock the form was last filled for, so that prices arriving again do not wipe what is being typed. */
  private filledFor = '';

  ngOnChanges(): void {
    if (this.symbol !== this.filledFor) {
      this.filledFor = this.symbol;
      this.fill();
    }
  }

  /**
   * The form can be saved as it arrives, and the suggested number of shares is rarely the number bought. So it
   * arrives selected: the first key typed replaces it. (After the form has written its numbers into the fields,
   * which it does a moment after it appears.)
   */
  ngAfterViewInit(): void {
    Promise.resolve().then(() => this.sharesField?.nativeElement.select());
  }

  /** The form's first line: what it is. */
  get what(): string {
    return this.portfolio ? `This records a purchase you have made in ${this.portfolio}. Nothing is bought here.` : RECORDS_ONLY;
  }

  /** The box about the cash, naming whose cash it is. */
  get cashLabel(): string {
    return this.portfolio ? `Paid from the cash of ${this.portfolio} (${this.cashShown})` : `Paid from this portfolio's cash (${this.cashShown})`;
  }

  /** Where the numbers in the form come from, and that they are a start: said over the fields. */
  get intro(): string {
    return this.draft && this.filledFromDraft ? 'This is what you typed before. Cancel starts again from the row.'
      : this.startShares() === null ? 'Enter what you bought.'
      : `Filled in from this row: ${money(this.dollars)} at today's price of ${this.price!.toFixed(2)}. Change it to what you bought.`;
  }

  /** "$1,000": the cash recorded, as the box in the form names it. */
  get cashShown(): string {
    return money(this.cash);
  }

  private get purchase(): { shares?: number, price?: number, day?: string } {
    return {shares: this.shares ?? undefined, price: this.paid ?? undefined, day: this.day || undefined};
  }

  private get cost(): number {
    return (this.shares ?? 0) * (this.paid ?? 0);
  }

  get problem(): string | undefined {
    return purchaseProblem(this.purchase, this.today) ?? overCash(this.cost, this.cash, this.viaCash);
  }

  /**
   * Whether a field is the one with the problem, once the problem is said: it is then marked (a red edge, and
   * "invalid" to a screen reader) and tied to the sentence that says what is wrong.
   */
  wrong(field: 'shares' | 'paid'): 'true' | null {
    const value = field === 'shares' ? this.shares : this.paid;
    return this.shownProblem && !(typeof value === 'number' && value > 0) ? 'true' : null;
  }

  /** The problem, once there is a reason to say it: the reader changed a field, or tried to save. */
  get shownProblem(): string | undefined {
    return this.attempted || this.touched ? this.problem : undefined;
  }

  /**
   * What looks like a slip of a finger (a price far from today's, an amount several times the row's), said while
   * it is typed. It stops nothing. Empty beside a problem, which says more.
   */
  get caution(): string {
    const said = this.problem ? '' : purchaseCaution(this.purchase, {todayPrice: this.price, rowDollars: this.dollars, today: this.today});
    return said ? `${said} ${CHECK_FIRST}` : '';
  }

  /** What the purchase would do to the share kept outside stocks, when it takes the cash under it. Stops nothing. */
  get keptNote(): string {
    return this.problem ? '' : keptShareCaution(this.cost, {cash: this.cash, keep: this.keep, viaCash: this.viaCash});
  }

  /**
   * What the purchase being entered comes to, said before anything is saved: what it costs, or for a stock that is
   * held the holding that results, and what it does to the cash. Empty until it can be worked out.
   */
  get result(): string {
    const p = this.purchase;
    if (this.problem || p.shares === undefined || p.price === undefined) {
      return '';
    }
    const cash = cashAfter(this.cost, this.cash, this.viaCash) + leftAsItIs(this.cost, this.cash, this.viaCash);
    if (!this.held) {
      return `That is ${money(this.cost)}.${cash}`;
    }
    const after = withPurchase(this.held, {shares: p.shares, price: p.price, day: p.day});
    return `You would then hold ${shareCount(after.shares)} share${after.shares === 1 ? '' : 's'} at an average price of ` +
      `${after.price.toFixed(2)}.${cash}`;
  }

  submit(): void {
    this.attempted = true;
    const p = this.purchase;
    if (this.problem || p.shares === undefined || p.price === undefined) {
      return;
    }
    this.trade.emit(purchaseTrade(this.symbol, this.held, {shares: p.shares, price: p.price, day: p.day}, this.viaCash));
    this.attempted = false;
    this.touched = false;
  }

  /** The amount of the row at today's price, in shares to four decimals (rounded down); nothing when either is missing. */
  private startShares(): number | null {
    return startFrom(this.dollars, this.price).shares;
  }

  private fill(): void {
    this.attempted = false;
    this.touched = false;
    if (this.draft) {
      ({shares: this.shares, paid: this.paid, day: this.day, viaCash: this.viaCash, cashChosen: this.cashChosen} = this.draft);
      this.touched = true;
      this.filledFromDraft = true;
      return;
    }
    const start = startFrom(this.dollars, this.price);
    this.shares = start.shares;
    this.paid = start.paid;
    this.day = this.today;
    // Taken out of the cash when the cash recorded covers what is filled in. A size is often more than the cash (no
    // size depends on it): the form then arrives with the box unticked, so that it can be saved as it stands.
    this.cashChosen = false;
    this.viaCash = coveredByCash(this.cost, this.cash);
  }

  /** A field was changed: the box about the cash follows the new sum, unless the reader set it themself. */
  changed(): void {
    this.touched = true;
    if (!this.cashChosen) {
      this.viaCash = coveredByCash(this.cost, this.cash);
    }
    // Handed to the page, which keeps it for this stock while another row's form is open.
    this.typed.emit({shares: this.shares, paid: this.paid, day: this.day, viaCash: this.viaCash, cashChosen: this.cashChosen});
  }
}
