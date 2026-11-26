import {fakeAsync, flushMicrotasks, TestBed} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {WatchlistTableComponent} from "./watchlist-table.component";
import {PriceStatusService} from "./price-status.service";
import {stockIdPath} from "../api/msn-requests";

describe('WatchlistTableComponent: the page and the top bar', () => {
  beforeEach(() => {
    // Nothing kept from an earlier test: the page then starts from its six starting lists.
    localStorage.clear();
    TestBed.configureTestingModule({imports: [WatchlistTableComponent, HttpClientTestingModule, NoopAnimationsModule]});
  });

  /** How many times the page has asked the data source for this stock since the last look. */
  const askedFor = (symbol: string) => TestBed.inject(HttpTestingController).match(request => request.url === stockIdPath(symbol)).length;

  it('loads every price again when the top bar asks for it', () => {
    TestBed.createComponent(WatchlistTableComponent).detectChanges();
    expect(askedFor('AAPL')).withContext('on opening the page').toBe(1);
    expect(askedFor('SCHD')).withContext('a stock of the last list').toBe(1);
    TestBed.inject(PriceStatusService).reload();
    expect(askedFor('AAPL')).withContext('after "Reload prices"').toBe(1);
    expect(askedFor('SCHD')).toBe(1);
  });

  // The bar is drawn before the page inside it. Changing what the bar shows while the page is still being built
  // would change a screen that is half drawn (Angular reports that as an error), so the page tells it just after.
  it('tells the top bar how many lists are still loading, once the page has been built and not in the middle of it', fakeAsync(() => {
    const status = TestBed.inject(PriceStatusService);
    TestBed.createComponent(WatchlistTableComponent).detectChanges();
    expect(status.pending).withContext('while the page is being built').toBe(0);
    flushMicrotasks();
    expect(status.pending).withContext('the six starting lists, none answered yet').toBe(6);
  }));

  // Found by a review of the page: a reload that failed said nothing, and the old prices looked fresh.
  it('tells the top bar when the prices could not be loaded, so that it can say the ones shown are old', fakeAsync(() => {
    const status = TestBed.inject(PriceStatusService), http = TestBed.inject(HttpTestingController);
    TestBed.createComponent(WatchlistTableComponent).detectChanges();
    flushMicrotasks();
    expect(status.failed).withContext('while the first prices are on their way').toBeFalse();
    // The source does not answer: every request fails, also the ones that follow from a failed one.
    for (let round = 0; round < 6; round++) {
      http.match(() => true).filter(request => !request.cancelled).forEach(request => !request.cancelled && request.error(new ProgressEvent('error')));
      flushMicrotasks();
    }
    expect(status.pending).toBe(0);
    expect(status.failed).toBeTrue();
  }));

  it('stops listening to the top bar once the page is gone', () => {
    const fixture = TestBed.createComponent(WatchlistTableComponent);
    fixture.detectChanges();
    askedFor('AAPL');
    fixture.destroy();
    TestBed.inject(PriceStatusService).reload();
    expect(askedFor('AAPL')).toBe(0);
  });
});
