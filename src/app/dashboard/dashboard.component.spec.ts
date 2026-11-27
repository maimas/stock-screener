import {ComponentFixture, TestBed} from "@angular/core/testing";
import {ActivatedRoute, convertToParamMap, ParamMap, Router} from "@angular/router";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {By} from "@angular/platform-browser";
import {BehaviorSubject} from "rxjs";
import {DashboardComponent} from "./dashboard.component";
import {WatchlistTableComponent} from "../watchlist/watchlist-table.component";

describe('DashboardComponent (the one page behind both addresses, /portfolio and /watchlist)', () => {
  let view: BehaviorSubject<ParamMap>;
  let query: BehaviorSubject<ParamMap>;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    localStorage.clear();
    view = new BehaviorSubject(convertToParamMap({view: 'portfolio'}));
    query = new BehaviorSubject(convertToParamMap({}));
    navigate = jasmine.createSpy('navigate');
    TestBed.configureTestingModule({
      imports: [DashboardComponent, HttpClientTestingModule, NoopAnimationsModule],
      providers: [{provide: ActivatedRoute, useValue: {paramMap: view, queryParamMap: query}}, {provide: Router, useValue: {navigate}}],
    });
  });

  function create(): ComponentFixture<DashboardComponent> {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  const pageOf = (fixture: ComponentFixture<DashboardComponent>) =>
    fixture.debugElement.query(By.directive(WatchlistTableComponent)).componentInstance as WatchlistTableComponent;

  it('shows the view the address names, and the portfolio\'s for a name it does not know', () => {
    const fixture = create();
    expect(pageOf(fixture).shows).toBe('portfolio');
    view.next(convertToParamMap({view: 'watchlist'}));
    fixture.detectChanges();
    expect(pageOf(fixture).shows).toBe('watchlist');
    view.next(convertToParamMap({view: 'something-else'}));
    fixture.detectChanges();
    expect(pageOf(fixture).shows).toBe('portfolio');
  });

  it('keeps the page that is there when the address changes to the other view: no price is loaded again', () => {
    const fixture = create();
    const page = pageOf(fixture), http = TestBed.inject(HttpTestingController);
    expect(http.match(() => true).length).withContext('the page loads its prices on opening').toBeGreaterThan(0);
    view.next(convertToParamMap({view: 'watchlist'}));
    fixture.detectChanges();
    expect(pageOf(fixture)).withContext('the same page, not a new one').toBe(page);
    expect(http.match(() => true).length).withContext('asked again on the switch').toBe(0);
  });

  it('goes to the other address when the page asks for the other view', () => {
    const fixture = create();
    pageOf(fixture).go.emit('watchlist');
    expect(navigate).toHaveBeenCalledOnceWith(['/', 'watchlist']);
  });

  /** The address is written a moment after the page says which stock is open: after the change of view under way. */
  const settled = () => new Promise<void>(done => setTimeout(done));

  // A stock had no address: nothing could be bookmarked, and a reload of the page closed its details.
  it('hands the page the stock the address names, in capitals as the lists write it', () => {
    const fixture = create();
    expect(pageOf(fixture).stock).toBeUndefined();
    query.next(convertToParamMap({stock: ' acme '}));
    fixture.detectChanges();
    expect(pageOf(fixture).stock).toBe('ACME');
  });

  it('writes the stock whose details are open into the address, in place of the one there, and takes it out again', async () => {
    view.next(convertToParamMap({view: 'watchlist'}));
    const fixture = create();
    pageOf(fixture).stockShown.emit('ACME');
    await settled();
    expect(navigate.calls.mostRecent().args).toEqual([['/', 'watchlist'], {queryParams: {stock: 'ACME'}, replaceUrl: true}]);
    pageOf(fixture).stockShown.emit(undefined);
    await settled();
    expect(navigate.calls.mostRecent().args).toEqual([['/', 'watchlist'], {queryParams: {}, replaceUrl: true}]);
  });

  // Found by a review: a stock opened from the plan, closed, did not go back to the plan. Closing it takes the stock
  // out of the address and asks for the portfolio's view at once; the address of the Watchlist was written last.
  it('goes back to the portfolio\'s view when a stock is closed and the page asks for it in the same moment', async () => {
    view.next(convertToParamMap({view: 'watchlist'}));
    const fixture = create();
    pageOf(fixture).stockShown.emit(undefined);
    pageOf(fixture).go.emit('portfolio');
    await settled();
    expect(navigate.calls.mostRecent().args).toEqual([['/', 'portfolio']]);
    expect(navigate.calls.allArgs().filter(args => args[0][1] === 'watchlist')).withContext('no address of the Watchlist after it').toEqual([]);
  });

  it('leaves the address of the portfolio\'s view as it is', async () => {
    const fixture = create();
    pageOf(fixture).stockShown.emit('ACME');
    await settled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
