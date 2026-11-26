import {Injectable} from "@angular/core";
import {Observable, Subject} from "rxjs";
import {Stock} from "../api/microsoft-money.service";

/**
 * When the newest price among these stocks is from: the time the source last updated a quote, or the time of its
 * last trade when it gives no update time. Unknown when no stock says either.
 */
export function latestQuoteTime(stocks: Stock[]): Date | undefined {
  const times = stocks
    .map(stock => new Date(stock.quote?.timeLastUpdated || stock.quote?.timeLastTraded || '').getTime())
    .filter(time => Number.isFinite(time));
  return times.length ? new Date(Math.max(...times)) : undefined;
}

/**
 * What the top bar and the page tell each other about the prices: the bar shows how fresh they are and whether
 * they are loading, and asks for them to be loaded again; the page does the loading. The bar is part of the frame
 * around every page and the prices belong to the one page that loads them, so neither can hold this for the other.
 */
@Injectable({providedIn: 'root'})
export class PriceStatusService {
  /** How many lists are still loading their prices. */
  pending = 0;
  /** When the newest price on the page is from; unknown until one has loaded. */
  latest?: Date;
  /**
   * When the prices were last loaded in full. Outside market hours a reload brings the same prices, and "Prices as
   * of" stays as it was: without this the reader could not tell that the reload had happened.
   */
  checked?: Date;
  /**
   * The last try to load prices did not get them all: the page still shows the ones it had. The bar says so,
   * because a reload that fails and says nothing leaves the reader believing the prices are fresh.
   */
  failed = false;

  private readonly reloads = new Subject<void>();
  /** Emits each time the prices are asked for again. */
  readonly reload$: Observable<void> = this.reloads.asObservable();

  /** Asks the page to load every price again. */
  reload(): void {
    this.reloads.next();
  }
}
