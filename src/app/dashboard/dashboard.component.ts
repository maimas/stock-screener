import {Component} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import {map, Observable, tap} from 'rxjs';
import {WatchlistTableComponent} from "../watchlist/watchlist-table.component";
import {PageView, toPageView} from "../watchlist/page-view";

/**
 * The one page behind both addresses, /portfolio and /watchlist. It tells the page which of its two views the
 * address asks for, and changes the address when the page asks for the other view (a stock's details are on the
 * watchlist). The page itself stays: its prices are loaded once.
 *
 * A stock whose details are open on the watchlist is in the address too (/watchlist?stock=ACME), so that a reload
 * of the page, or a bookmark, comes back to it.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AsyncPipe, WatchlistTableComponent],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent {
  /** The view the address names. */
  readonly shows$: Observable<PageView> = this.route.paramMap.pipe(
    map(params => toPageView(params.get('view'))), tap(view => this.view = view));
  /** The stock the address names: the page opens its details. */
  readonly stock$: Observable<string | undefined> = this.route.queryParamMap.pipe(
    map(params => params.get('stock')?.trim().toUpperCase() || undefined));

  private view: PageView = 'portfolio';
  /** The change of address under way: a stock's address is written after it, into the entry it made. */
  private under: Promise<unknown> = Promise.resolve();

  constructor(private route: ActivatedRoute, private router: Router) {
  }

  go(view: PageView): void {
    // The view being gone to, at once: an address of a stock on the Watchlist that is still waiting to be written
    // (a stock was closed in the same moment, on its way back to the plan) is then not written after this change.
    this.view = view;
    this.under = Promise.resolve(this.router.navigate(['/', view]));
  }

  /**
   * A stock's details were opened on the watchlist, or closed: the address says so, in place of the one that was
   * there (no new step for the browser's Back, which still leaves the watchlist in one).
   */
  stockShown(symbol: string | undefined): void {
    this.under = this.under.then(() => this.view === 'watchlist'
      ? this.router.navigate(['/', 'watchlist'], {queryParams: symbol ? {stock: symbol} : {}, replaceUrl: true}) : undefined);
  }
}
