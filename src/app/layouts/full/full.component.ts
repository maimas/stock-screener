import {Component} from '@angular/core';
import {PriceStatusService} from '../../watchlist/price-status.service';

/**
 * The frame around the page: a slim bar across the top, then the page.
 * The bar holds what is about the whole page and nothing else: the app's name, how fresh the prices are, and the
 * one way to load them again. The page tells it both through PriceStatusService.
 */
@Component({
  selector: 'app-full-layout',
  templateUrl: 'full.component.html',
  styleUrls: ['full.component.scss']
})
export class FullComponent {
  /** The time last shown, with the text made from it, so the text is not made again on every look at the bar. */
  private shown?: { time: number, text: string };

  constructor(public status: PriceStatusService) {
  }

  /** "Skip to the page": the keyboard goes into the page, past the bar, without the address changing. */
  skip(event: Event): void {
    event.preventDefault();
    document.getElementById('page')?.focus();
  }

  /** Prices are being loaded: the button says so and waits. */
  get loading(): boolean {
    return this.status.pending > 0;
  }

  /** The last try to load prices failed, and nothing is loading now: the bar says so and offers another try. */
  get failed(): boolean {
    return this.status.failed && !this.loading;
  }

  /** What the bar says then: that the prices could not be loaded, and how old the ones on the page are. */
  get failedText(): string {
    return this.asOf ? `Prices could not be reloaded. Showing those of ${this.asOf}.` : 'Prices could not be loaded.';
  }

  /** "11:41 PM": when the page last loaded the prices in full. Empty until it has. */
  get checked(): string {
    const at = this.status.checked;
    if (!at) {
      return '';
    }
    if (this.checkedShown?.time !== at.getTime()) {
      this.checkedShown = {time: at.getTime(), text: at.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})};
    }
    return this.checkedShown.text;
  }

  private checkedShown?: { time: number, text: string };

  /** "Nov 24, 06:03 PM": when the newest price on the page is from. Empty until one has loaded. */
  get asOf(): string {
    const latest = this.status.latest;
    if (!latest) {
      return '';
    }
    if (this.shown?.time !== latest.getTime()) {
      this.shown = {
        time: latest.getTime(),
        text: latest.toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}),
      };
    }
    return this.shown.text;
  }
}
