import {Component, ElementRef, EventEmitter, Input, OnChanges, Optional, Output} from "@angular/core";
import {NgIf} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {MatButtonModule} from "@angular/material/button";
import {Stock} from "../../api/microsoft-money.service";
import {afterSale, Position, positionProblem, purchaseProblem, saleProblem, withPurchase} from "../positions";
import {PositionRow} from "../portfolio-view";
import {OWN_TABLE, sizeForBudget, TestedCases} from "../sizing";
import {casesNote} from "../evidence";
import {SaysComponent} from "../says/says.component";
import {FocusWhenShownDirective} from "../focus-when-shown.directive";
import {PriceDirective} from "../price.directive";
import {MoreComponent} from "../more/more.component";
import {money, shareCount, signedMoney, signedPercent, signedWholePercent} from "../format";
import {CHECK_FIRST, coveredByCash, keptShareCaution, leftAsItIs, purchaseCaution, saleCaution} from "../purchase-words";

/**
 * A purchase or a sale as it is handed to the page: the holding that results, what it does to the portfolio's
 * cash, and the sentence that says what was recorded. The page saves both in one step and offers to take it back.
 */
export type Trade = {
  symbol: string
  /** The holding after the trade; left out when every share was sold. */
  holding?: Position
  /** What the trade does to the cash: less than zero for a purchase paid from it, more for a sale, 0 to leave it. */
  cashChange: number
  /** What was done, for the notice: "Bought 30 more shares of ACME at 60.00." */
  text: string
};

/**
 * "What you own of it" inside a row's details: record or edit what you hold in this stock and see how it is doing,
 * with what a tested bad half-year would cost against your limit. For a stock that is held it also takes a purchase
 * ("Bought more") or a sale ("Sold some") by itself and works out the holding that results, so that the reader does
 * not have to add shares up or average a price; "Edit" stays for correcting what is recorded. The typical result and the good case of the same
 * tests are shown beside the bad case, so it is never the only number on the page. How big a stock that is not
 * held could be, in each portfolio, is said by the part of the details next to this one ("Where it fits").
 */
@Component({
  selector: "app-position-panel",
  standalone: true,
  imports: [NgIf, FormsModule, MatButtonModule, SaysComponent, FocusWhenShownDirective, PriceDirective, MoreComponent],
  templateUrl: "./position-panel.component.html",
  styleUrls: ["./position-panel.component.scss"]
})
export class PositionPanelComponent implements OnChanges {
  @Input() stock!: Stock;
  /** The holding in this stock, when there is one. */
  @Input() row?: PositionRow;
  /** What tested DIP BUYs of this volatility did, when the stock is a DIP BUY now. */
  @Input() cases?: TestedCases;
  /** The loss budget for one position, in dollars, once the settings are entered. */
  @Input() budget?: number;
  @Input() today = '';
  /**
   * The name of the portfolio this panel is about, when there is more than one: the heading and the button that
   * adds a holding then say it. Left empty while there is only one portfolio, which needs no name.
   */
  @Input() portfolio = '';

  /**
   * The cash recorded for the portfolio, when there is any record of it. A purchase or a sale can then be settled
   * against it in the same step: otherwise the money would be counted twice, as the stock and as cash, and every
   * size the plan gives would be too large.
   */
  @Input() cash?: number;
  /** The dollars the user keeps outside stocks, when they set such a share: a purchase that takes the cash under it is pointed out. */
  @Input() keep?: number | null;

  /** A correction of what is recorded ("Edit"). */
  @Output() save = new EventEmitter<Position>();
  @Output() remove = new EventEmitter<string>();
  /** A purchase or a sale that happened: the first entry of a stock, "Bought more", "Sold some". */
  @Output() trade = new EventEmitter<Trade>();

  editing = false;
  /** A purchase or a sale of a stock that is held is being entered. */
  recording?: 'bought' | 'sold';
  /** The purchase being entered: this purchase only, not the holding it is added to. */
  boughtShares: number | null = null;
  boughtPrice: number | null = null;
  boughtDay = '';
  /** How many shares were sold, in the sale being entered, and at what price (needed only for the cash). */
  soldShares: number | null = null;
  soldPrice: number | null = null;
  /** The purchase or the sale being entered is settled against the portfolio's cash (the box in the form). */
  viaCash = false;
  /** The reader set that box themself: from then on it no longer follows the numbers. */
  cashChosen = false;
  /** Set once the user tried to save, so a problem is only pointed out after they had a chance to fill the form. */
  attempted = false;
  /**
   * Set once the user changed a field of the form that is open. From then on a problem is said while they type,
   * where it can be put right at once, and not only after the button.
   */
  touched = false;

  /** There is a reason to say a problem: a field was changed, or saving was tried. */
  get telling(): boolean {
    return this.attempted || this.touched;
  }
  shares: number | null = null;
  price: number | null = null;
  day = '';
  /** Which stock and state the form was last filled for, so a data reload does not wipe what is being typed. */
  private filledFor = '';

  ngOnChanges(): void {
    const key = `${this.symbol}|${this.row ? 'held' : 'none'}`;
    if (key !== this.filledFor) {
      this.filledFor = key;
      this.editing = false;
      this.recording = undefined;
      this.fill();
    }
  }

  get symbol(): string {
    return this.stock.quote?.symbol ?? '';
  }

  /**
   * "What you own of it": the name the page uses for a holding. With more than one portfolio it says which one:
   * the panel reads and writes the portfolio chosen on the Portfolio view, and nothing else on the Watchlist says
   * which that is.
   */
  get heading(): string {
    return this.portfolio ? `${OWN_TABLE} of it in ${this.portfolio}` : `${OWN_TABLE} of it`;
  }

  /**
   * The button of the form: "Save" for a correction, and for a stock that is not held the same words as on every
   * other form that records a purchase (it read "Add to what I own": one act had four names on the page).
   */
  get saveLabel(): string {
    return this.row ? 'Save' : 'Record this purchase';
  }

  /** The form with the holding's own numbers is open: a correction of a holding, or the first entry of a stock. */
  get showForm(): boolean {
    return this.row ? this.editing : this.entering;
  }

  /** The first entry of a stock that is not held was asked for ("Enter what you hold"). */
  entering = false;
  /** Under a stock that is not held: the fact first; what entering a holding gives is behind "more". */
  readonly notHeld = 'Not in this portfolio. Enter what you hold to see how it is doing, how it compares with the market, ' +
    'and what a bad half-year could cost.';
  /** What that form is, said as its first line, in the words of the purchase forms of "Could add". */
  readonly recordsOnly = 'This records a purchase you have made. Nothing is bought here.';

  /** "Enter what you hold": opens the form for a stock that is not held, with the keyboard in its first field. */
  startEntering(): void {
    this.fill();
    this.entering = true;
    this.opener = 'first';
    setTimeout(() => this.host?.nativeElement.querySelector<HTMLElement>('input[name="shares"]')?.focus());
  }

  get problem(): string | undefined {
    return positionProblem({shares: this.shares ?? undefined, price: this.price ?? undefined, day: this.day}, this.today)
      ?? (this.row ? undefined : this.overCash((this.shares ?? 0) * (this.price ?? 0)));
  }

  /** For a stock that is not held yet: what the entry does to the cash, said before anything is saved. */
  get firstResult(): string {
    const cost = (this.shares ?? 0) * (this.price ?? 0);
    // The sum first, as in every form that records a purchase: it is the check on what was typed.
    return this.row || this.problem ? '' : `That is ${money(cost)}.${this.cashAfter(-cost)}${leftAsItIs(cost, this.cash, this.viaCash)}`;
  }

  /**
   * What looks like a slip of a finger in the purchase being entered (a price paid today that is far from today's
   * price), said while it is typed, as in the forms of "Could add". It stops nothing.
   */
  /**
   * The same question for a sale whose price is far from today's. Only while the money goes to the cash: that is
   * all the price of a sale is used for.
   */
  get saleSlip(): string {
    return this.recording !== 'sold' || !this.viaCash || this.saleProblem ? ''
      : saleCaution(this.soldPrice ?? undefined, this.stock.quote?.price);
  }

  get slipNote(): string {
    const buying = this.recording === 'bought', first = !this.row;
    if (!buying && !first) {
      return '';
    }
    const typed = buying ? {shares: this.boughtShares ?? undefined, price: this.boughtPrice ?? undefined, day: this.boughtDay || undefined}
      : {shares: this.shares ?? undefined, price: this.price ?? undefined, day: this.day || undefined};
    const wrong = buying ? this.purchaseProblem : this.problem;
    const said = wrong ? '' : purchaseCaution(typed, {todayPrice: this.stock.quote?.price, today: this.today});
    return said ? `${said} ${CHECK_FIRST}` : '';
  }

  /**
   * A field of a purchase was changed: the box about the cash follows the new sum, unless the reader set it
   * themself. The one rule of that box on the page (purchase-words.ts). A sale and a correction have no such rule.
   */
  changed(): void {
    this.touched = true;
    if (this.cashChosen) {
      return;
    }
    if (this.recording === 'bought') {
      this.viaCash = coveredByCash((this.boughtShares ?? 0) * (this.boughtPrice ?? 0), this.cash);
    } else if (!this.row) {
      this.viaCash = coveredByCash((this.shares ?? 0) * (this.price ?? 0), this.cash);
    }
  }

  /**
   * What the purchase being entered would do to the share kept outside stocks, when it is paid from the cash and
   * takes the cash under it: said in the forms of "Could add" too. It stops nothing.
   */
  get keptNote(): string {
    const cost = this.recording === 'bought' ? (this.boughtShares ?? 0) * (this.boughtPrice ?? 0)
      : !this.row ? (this.shares ?? 0) * (this.price ?? 0) : 0;
    const wrong = this.recording === 'bought' ? this.purchaseProblem : this.problem;
    return cost > 0 && !wrong ? keptShareCaution(cost, {cash: this.cash, keep: this.keep, viaCash: this.viaCash}) : '';
  }

  /** "30 shares bought Nov 1, 2026 at 100.00." or, recorded without a date, "56 shares at an average price of 160.70." */
  get holdingText(): string {
    const p = this.row!.view.position;
    const shares = `${shareCount(p.shares)} share${p.shares === 1 ? '' : 's'}`;
    return p.day ? `${shares} bought ${dayText(p.day)} at ${p.price.toFixed(2)}.` : `${shares} at an average price of ${p.price.toFixed(2)}.`;
  }

  get resultText(): string {
    const v = this.row!.view;
    if (v.value === undefined) {
      return 'No current price: the quote did not load.';
    }
    const index = v.indexPercent === undefined ? '.' : `; the market is ${signedPercent(v.indexPercent)} since then.`;
    return `Now worth ${money(v.value)}: ${signedMoney(v.gain)} (${signedPercent(v.gainPercent)})${index}`;
  }

  get timeText(): string {
    const v = this.row!.view;
    if (v.daysHeld === undefined) {
      return 'No purchase date recorded. Add it with Edit to compare with the market since then and to count the weeks the tests followed.';
    }
    if (!v.beyondTested) {
      return `Week ${v.week} of the 26 the tests followed.`;
    }
    const weeks = Math.floor(v.daysHeld / 7);
    // The plan keeps a stock that is marked DIP BUY today whenever it was bought: it must not read as overdue here
    // while the table of what you own says KEEP.
    return this.row!.verdict === 'DIP BUY'
      ? `Held ${weeks} weeks. It is marked DIP BUY today, so the plan counts its 6 months from today.`
      : `Held ${weeks} weeks: longer than the 6 months the tests followed, and after that they disagree.`;
  }

  get weightText(): string {
    const weight = this.row!.view.weightPercent;
    return weight === undefined ? '' : `${weight.toFixed(1)}% of your portfolio.`;
  }

  /** What the tested bad case would cost on the holding, against the loss budget. */
  get riskText(): string {
    const risk = this.row?.risk, cases = this.row?.cases;
    if (!risk || !cases) {
      return '';
    }
    const share = risk.ofPortfolioPercent === undefined ? '' : `, ${risk.ofPortfolioPercent.toFixed(1)}% of your portfolio`;
    const fits = sizeForBudget(this.budget, cases.lossPercent, this.stock.quote?.price);
    const limit = risk.overBudget === undefined ? '.'
      : risk.overBudget ? `. That is over your limit of ${money(this.budget)}: up to ${money(fits?.dollars)} of this stock fits it.`
        : `, within your limit of ${money(this.budget)}.`;
    return `A bad half-year (${signedWholePercent(-cases.lossPercent)}, as bad as 1 in 10 in tests) would cost ` +
      `${signedMoney(-risk.loss)}${share}${limit}`;
  }

  /** The other side of the same tests: what the typical result and the good case would mean for the holding. */
  get rangeText(): string {
    const risk = this.row?.risk, cases = this.row?.cases;
    if (!risk || !cases) {
      return '';
    }
    return `A typical half-year in the same tests (${signedPercent(cases.typicalPercent)}) would mean ${signedMoney(risk.typical)}, ` +
      `and a good one (${signedWholePercent(cases.gainPercent)}) ${signedMoney(risk.gain)}.`;
  }

  /** The whole tested range for this kind of DIP BUY, and how far that evidence reaches. */
  get casesText(): string {
    return this.cases ? casesNote(this.cases.group) : '';
  }

  startEdit(): void {
    this.fill();
    this.editing = true;
    this.opener = 'edit';
    // The form opens on a click and what comes next is typing: the keyboard goes into its first field.
    setTimeout(() => this.host?.nativeElement.querySelector<HTMLElement>('input[name="shares"]')?.focus());
  }

  /** Opens the form for a purchase (starting from today's price and date) or for a sale. */
  startRecording(what: 'bought' | 'sold'): void {
    const price = this.stock.quote?.price;
    this.attempted = false;
    this.touched = false;
    this.boughtShares = null;
    this.boughtPrice = typeof price === 'number' && Number.isFinite(price) ? Number(price.toFixed(2)) : null;
    this.boughtDay = this.today;
    this.soldShares = what === 'sold' ? this.sharesOverLimit() : null;
    this.soldPrice = this.boughtPrice;
    // A purchase is taken out of the cash while the cash recorded covers it; what a sale brings goes to it.
    this.cashChosen = false;
    this.viaCash = what === 'bought' ? coveredByCash(0, this.cash) : this.cash !== undefined;
    this.opener = what;
    this.recording = what;
  }

  /**
   * For a holding whose tested bad half-year would cost more than the limit: how many shares, at today's price,
   * bring it down to what fits (the plan says SELL SOME and gives that amount in dollars; the sum in shares was
   * left to the reader, while the buy side does it for them). Rounded up to four decimals, so that what is left
   * is not a cent over, and never more than is held. Nothing for a holding that fits.
   */
  private sharesOverLimit(): number | null {
    const price = this.stock.quote?.price, view = this.row?.view, cases = this.row?.cases;
    const fits = this.row?.risk?.overBudget ? sizeForBudget(this.budget, cases?.lossPercent, price) : undefined;
    if (!fits || !view || view.value === undefined || !(typeof price === 'number' && price > 0) || view.value <= fits.dollars) {
      return null;
    }
    const shares = Math.ceil((view.value - fits.dollars) / price * 10_000 - 1e-6) / 10_000;
    return Math.min(shares, view.position.shares);
  }

  /** Over the fields of a sale, as the purchase forms have a line over theirs: what to enter and what the page does with it. */
  readonly saleOpening = 'Enter this sale only. The page takes the shares from what you hold; the price you paid for the rest stays as it is.';

  /** Over the fields of a sale that arrived filled in: where the number comes from, and that it is a start. */
  get saleIntro(): string {
    const start = this.recording === 'sold' ? this.sharesOverLimit() : null;
    const fits = start === null ? undefined : sizeForBudget(this.budget, this.row?.cases?.lossPercent, this.stock.quote?.price);
    return start === null || !fits ? ''
      : `Filled in from your limit: selling ${shareCount(start)} share${start === 1 ? '' : 's'} at today's price leaves ` +
      `${money(fits.dollars)} of it, the most that fits. Change it to what you sold.`;
  }

  /** "$5,000": the cash recorded, as the box in the form names it. */
  get cashShown(): string {
    return money(this.cash);
  }

  /** What is wrong when a purchase is to be paid from less cash than is recorded. */
  private overCash(cost: number): string | undefined {
    return this.viaCash && this.cash !== undefined && cost > this.cash + 0.005
      ? `That is ${money(cost)}, more than the ${money(this.cash)} of cash recorded. Untick the box to leave your cash as it is, ` +
      'or correct "Cash" first.' : undefined;
  }

  /** " Cash would go from $5,000 to $3,200.": what the box in the form leads to. Empty when the cash is left alone. */
  private cashAfter(change: number): string {
    return this.viaCash && this.cash !== undefined ? ` Cash would go from ${money(this.cash)} to ${money(this.cash + change)}.` : '';
  }

  stopRecording(): void {
    this.recording = undefined;
    this.attempted = false;
    this.touched = false;
    this.backToOpener();
  }

  /** Which of the buttons under a holding opened the form that is open: the keyboard goes back to it on Cancel or Esc. */
  private opener?: 'bought' | 'sold' | 'edit' | 'first';

  /** Not there when a test makes the panel by hand; the keyboard is then left where it is. */
  constructor(@Optional() private readonly host?: ElementRef<HTMLElement>) {
  }

  /** The form closed without a save: the keyboard goes back to the button that opened it, once that button is back. */
  private backToOpener(): void {
    const opener = this.opener;
    this.opener = undefined;
    if (opener) {
      setTimeout(() => this.host?.nativeElement.querySelector<HTMLElement>(`button[data-opens="${opener}"]`)?.focus());
    }
  }

  private get purchase(): { shares?: number, price?: number, day?: string } {
    return {shares: this.boughtShares ?? undefined, price: this.boughtPrice ?? undefined, day: this.boughtDay || undefined};
  }

  get purchaseProblem(): string | undefined {
    const p = this.purchase;
    return purchaseProblem(p, this.today) ?? this.overCash((p.shares ?? 0) * (p.price ?? 0));
  }

  /**
   * "You would then hold 40 shares at an average price of 70.00.": what the purchase being entered leads to, said
   * before anything is saved. Empty until it can be worked out.
   */
  get purchaseResult(): string {
    const held = this.row?.view.position, p = this.purchase;
    if (!held || this.purchaseProblem || p.shares === undefined || p.price === undefined) {
      return '';
    }
    const after = withPurchase(held, {shares: p.shares, price: p.price, day: p.day});
    return `That is ${money(p.shares * p.price)}. You would then hold ${shareCount(after.shares)} share${after.shares === 1 ? '' : 's'} ` +
      `at an average price of ${after.price.toFixed(2)}.` +
      this.cashAfter(-p.shares * p.price) + leftAsItIs(p.shares * p.price, this.cash, this.viaCash);
  }

  /** Adds the purchase to the holding and hands the page the holding that results, with what it does to the cash. */
  submitPurchase(): void {
    this.attempted = true;
    const held = this.row?.view.position, p = this.purchase;
    if (!held || this.purchaseProblem || p.shares === undefined || p.price === undefined) {
      return;
    }
    this.trade.emit({
      symbol: this.symbol,
      holding: withPurchase(held, {shares: p.shares, price: p.price, day: p.day}),
      cashChange: this.viaCash ? -p.shares * p.price : 0,
      text: `Bought ${shareCount(p.shares)} more share${p.shares === 1 ? '' : 's'} of ${this.symbol} at ${p.price.toFixed(2)}.`,
    });
    this.opener = undefined;   // saved, not cancelled: the page says what was recorded
    this.stopRecording();
  }

  get saleProblem(): string | undefined {
    const held = this.row?.view.position;
    if (!held) {
      return undefined;
    }
    return saleProblem(held, this.soldShares ?? undefined) ?? (this.viaCash && !(typeof this.soldPrice === 'number' && this.soldPrice > 0)
      ? 'Enter the price you sold at, or untick the box to leave your cash as it is.' : undefined);
  }

  /** What would be left after the sale being entered. Empty until it can be worked out. */
  get saleResult(): string {
    const held = this.row?.view.position;
    if (!held || this.saleProblem || this.soldShares === null) {
      return '';
    }
    const after = afterSale(held, this.soldShares);
    return (after ? `You would then hold ${shareCount(after.shares)} share${after.shares === 1 ? '' : 's'}, at the same price paid.`
      : `That is all you hold of it: ${this.symbol} would be taken out of what you own.`) + this.cashAfter(this.soldShares * (this.soldPrice ?? 0));
  }

  /** Records the sale: a smaller holding, or, when every share was sold, the stock taken out (which can be undone). */
  submitSale(): void {
    this.attempted = true;
    const held = this.row?.view.position;
    if (!held || this.saleProblem || this.soldShares === null) {
      return;
    }
    const shares = this.soldShares, price = this.viaCash ? this.soldPrice ?? 0 : 0;
    const after = afterSale(held, shares);
    const sold = after ? `Sold ${shareCount(shares)} share${shares === 1 ? '' : 's'} of ${this.symbol}` : `Sold all you held of ${this.symbol}`;
    this.trade.emit({
      symbol: this.symbol,
      holding: after,
      cashChange: shares * price,
      text: price > 0 ? `${sold} at ${price.toFixed(2)}.` : `${sold}.`,
    });
    this.opener = undefined;
    this.stopRecording();
  }

  cancel(): void {
    this.editing = false;
    this.entering = false;
    this.fill();
    this.backToOpener();
  }

  /**
   * The Esc key in a form: Cancel. The key is then used up, so that the details around the panel do not close with
   * it. In the form for a stock that is not held there is nothing to cancel, and the key goes on to the details.
   */
  escape(event: Event): void {
    if (this.recording) {
      this.stopRecording();
    } else if (this.editing || this.entering) {
      this.cancel();
    } else {
      return;
    }
    event.stopPropagation();
  }

  submit(): void {
    this.attempted = true;
    if (this.problem) {
      return;
    }
    const position: Position = {symbol: this.symbol, shares: this.shares!, price: this.price!};
    if (this.day) {
      position.day = this.day;
    }
    if (this.row) {
      this.save.emit(position);   // a correction of what is recorded: the cash is not touched
    } else {
      this.entering = false;   // recorded: the stock is held from now on, and its own buttons take over
      this.trade.emit({
        symbol: this.symbol,
        holding: position,
        cashChange: this.viaCash ? -position.shares * position.price : 0,
        text: `Added ${shareCount(position.shares)} share${position.shares === 1 ? '' : 's'} of ${this.symbol} at ${position.price.toFixed(2)}.`,
      });
    }
    this.editing = false;
    this.attempted = false;
  }

  /** Fills the form from the holding, or with today's price and date for a new one. */
  private fill(): void {
    this.attempted = false;
    this.touched = false;
    const held = this.row?.view.position;
    const price = this.stock.quote?.price;
    this.shares = held?.shares ?? null;
    this.price = held?.price ?? (typeof price === 'number' && Number.isFinite(price) ? Number(price.toFixed(2)) : null);
    // A holding recorded without a date keeps its date empty; only a new position starts from today.
    this.day = held ? held.day ?? '' : this.today;
    // A stock entered for the first time is paid from the cash while the cash recorded covers it; a correction never is.
    this.cashChosen = false;
    this.viaCash = !held && coveredByCash((this.shares ?? 0) * (this.price ?? 0), this.cash);
  }
}

function dayText(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
}
