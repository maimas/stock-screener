import {ComponentFixture, fakeAsync, flush, TestBed, tick} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController, TestRequest} from "@angular/common/http/testing";
import {By} from "@angular/platform-browser";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {MatSnackBar} from "@angular/material/snack-bar";
import {of, Subject} from "rxjs";
import {WatchlistTableComponent} from "./watchlist-table.component";
import {PageView} from "./page-view";
import {CouldAddComponent} from "./could-add/could-add.component";
import {makeStock} from "./testing/fixtures";

describe('WatchlistTableComponent: the two views of the one page', () => {
  beforeEach(() => {
    // Nothing kept from an earlier test: the page starts from its starting lists and one empty portfolio.
    localStorage.clear();
    TestBed.configureTestingModule({imports: [WatchlistTableComponent, HttpClientTestingModule, NoopAnimationsModule]});
  });

  /** The page as the address /portfolio opens it: the view is given from the start, as the routed page gives it. */
  function create(): ComponentFixture<WatchlistTableComponent> {
    const fixture = TestBed.createComponent(WatchlistTableComponent);
    fixture.componentRef.setInput('shows', 'portfolio');
    fixture.detectChanges();
    return fixture;
  }

  function show(fixture: ComponentFixture<WatchlistTableComponent>, view: PageView): void {
    fixture.componentRef.setInput('shows', view);
    fixture.detectChanges();
  }

  const part = (fixture: ComponentFixture<WatchlistTableComponent>, selector: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLElement;
  const tags = (el: HTMLElement) => Array.from(el.children).map(it => it.tagName.toLowerCase());
  const say = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('opens on the portfolio\'s view: the plan box, "Could add", then how the plan was tested', () => {
    const fixture = create();
    expect(part(fixture, '.view-portfolio').hidden).toBeFalse();
    expect(part(fixture, '.view-watchlist').hidden).toBeTrue();
    expect(tags(part(fixture, '.view-portfolio'))).toEqual(['app-positions-card', 'app-could-add', 'app-plan-evidence']);
  });

  // Found by a review of the page: the box stood in the first screen while the prices loaded and then dropped by
  // hundreds of pixels, as the boxes over it grew.
  it('keeps "How the plan was tested" out of sight while the first prices arrive', () => {
    const fixture = create(), page = fixture.componentInstance;
    const box = () => part(fixture, '.view-portfolio > app-plan-evidence');
    expect(page.working).toBeTrue();
    expect(box().classList.contains('arriving')).toBeTrue();
    expect(getComputedStyle(box()).visibility).toBe('hidden');
  });

  it('keeps the watchlist\'s view in the page while it is hidden: what is marked, the lists and the new-list button', () => {
    const fixture = create();
    const classes = Array.from(part(fixture, '.view-watchlist').children).map(it => it.tagName === 'DIV' ? `.${it.className}` : it.tagName.toLowerCase());
    expect(classes).toEqual(['app-dip-candidates', '.lists-bar', '.lists']);
    // "New list" is at the top, on the line of "Your lists", not under the last list at the bottom of the page.
    expect(part(fixture, '.lists-bar .new-list button')).toBeTruthy();
  });

  it('shows the watchlist\'s view when the address asks for it, and loads no price again', () => {
    const fixture = create(), http = TestBed.inject(HttpTestingController);
    expect(http.match(() => true).length).withContext('on opening').toBeGreaterThan(0);
    show(fixture, 'watchlist');
    expect(part(fixture, '.view-portfolio').hidden).toBeTrue();
    expect(part(fixture, '.view-watchlist').hidden).toBeFalse();
    show(fixture, 'portfolio');
    expect(part(fixture, '.view-portfolio').hidden).toBeFalse();
    expect(http.match(() => true).length).withContext('asked again on a switch').toBe(0);
  });

  it('starts a view at its top', () => {
    const fixture = create();
    const scrolled = spyOn(window, 'scrollTo');
    show(fixture, 'watchlist');
    expect(scrolled).toHaveBeenCalledTimes(1);
  });

  it('asks for the watchlist when a stock is opened from the portfolio\'s view: its details are there', () => {
    const fixture = create();
    const asked: PageView[] = [];
    fixture.componentInstance.go.subscribe(view => asked.push(view));
    fixture.componentInstance.showStock('ACME');
    expect(asked).toEqual(['watchlist']);
  });

  it('opens that stock once the watchlist is shown, without jumping to the top first', fakeAsync(() => {
    const fixture = create();
    const scrolled = spyOn(window, 'scrollTo');
    fixture.componentInstance.showStock('ACME');
    show(fixture, 'watchlist');
    flush();
    expect(scrolled).not.toHaveBeenCalled();
    // Going back puts the reader where they were when they opened the stock (see the tests of the way back)...
    show(fixture, 'portfolio');
    flush();
    expect(scrolled).toHaveBeenCalledTimes(1);
    // ...and the switch after that is an ordinary one again: to the top.
    show(fixture, 'watchlist');
    expect(scrolled).toHaveBeenCalledTimes(2);
    expect(scrolled.calls.mostRecent().args[0] as unknown).toEqual({top: 0});
  }));

  it('asks for nothing when a stock is opened on the watchlist itself', fakeAsync(() => {
    const fixture = create();
    show(fixture, 'watchlist');
    const asked: PageView[] = [];
    fixture.componentInstance.go.subscribe(view => asked.push(view));
    fixture.componentInstance.showStock('ACME');
    flush();
    expect(asked).toEqual([]);
  }));

  // Looking a stock up from "Could add" or "What you own" moves the reader to the other view. The details then
  // offer the way back, and the reader lands where they were, not at the top.
  it('offers the way back to the plan in the details of a stock opened from the portfolio\'s view, and to it alone', () => {
    const fixture = create(), page = fixture.componentInstance;
    expect(page.backFrom('ACME')).withContext('nothing was opened').toBe('');
    page.showStock('ACME');
    show(fixture, 'watchlist');
    expect(page.backFrom('ACME')).toBe('Back to your plan');
    expect(page.backFrom('ZED')).withContext('another stock, opened here').toBe('');
  });

  it('returns to where the reader was on the portfolio\'s view, by the link or by the browser\'s Back', fakeAsync(() => {
    const fixture = create(), page = fixture.componentInstance;
    const asked: PageView[] = [];
    page.go.subscribe(view => asked.push(view));
    spyOnProperty(window, 'scrollY').and.returnValue(640);
    page.showStock('ACME');
    show(fixture, 'watchlist');
    flush();
    const scrolled = spyOn(window, 'scrollTo');

    page.backToPlan();
    expect(asked).toEqual(['watchlist', 'portfolio']);
    show(fixture, 'portfolio');
    flush();
    expect(scrolled.calls.mostRecent().args[0] as unknown).toEqual({top: 640});
    expect(page.backFrom('ACME')).withContext('the way back is used up').toBe('');
  }));

  it('starts at the top again when the watchlist is opened by its tab: there is nothing to go back to', fakeAsync(() => {
    const fixture = create(), page = fixture.componentInstance;
    show(fixture, 'watchlist');
    page.showStock('ACME');
    flush();
    expect(page.backFrom('ACME')).toBe('');
  }));

  // Folded, "Dip candidates" is a narrow strip and the lists get the room; the page lays the lists out by it.
  it('folds "Dip candidates" when its box asks for it, says so to the layout, and remembers it in this browser', () => {
    const fixture = create(), page = fixture.componentInstance;
    const view = part(fixture, '.view-watchlist');
    expect(page.paneFolded).withContext('open to start with').toBeFalse();
    expect([view.classList.contains('pane-folded'), view.classList.contains('key-columns')]).toEqual([false, true]);

    page.foldPane(true);
    fixture.detectChanges();
    expect(view.classList.contains('pane-folded')).toBeTrue();
    expect(part(fixture, 'app-dip-candidates mat-card').classList.contains('folded')).toBeTrue();
    expect(TestBed.createComponent(WatchlistTableComponent).componentInstance.paneFolded).withContext('the next visit starts folded').toBeTrue();

    // Side by side, each list is told its column, so that it can stand right under the one above it there.
    const columns = Array.from(view.querySelectorAll<HTMLElement>('.lists > section.list')).map(list => list.style.gridColumnStart);
    expect(columns.slice(0, 2)).withContext('the first two lists start the two columns').toEqual(['1', '2']);
    expect(columns.every(column => column === '1' || column === '2')).toBeTrue();

    page.setView('all');
    fixture.detectChanges();
    expect(view.classList.contains('key-columns')).withContext('with every column the lists stay one under the other').toBeFalse();
    page.foldPane(false);
    expect(TestBed.createComponent(WatchlistTableComponent).componentInstance.paneFolded).toBeFalse();
  });

  // The BUY line says: see "Could add". In a laptop window that box is two screens down.
  it('brings the "Could add" box into view, and the keyboard to it, when the plan\'s line asks for it', () => {
    const fixture = create();
    const box = part(fixture, 'app-could-add');
    const scrolled = spyOn(box, 'scrollIntoView');
    fixture.componentInstance.showCouldAdd();
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(box);
  });

  // What comes after "New list" is typing its name: the field is ready for it without a second click.
  it('puts the keyboard into the name field when "New list" opens its form', () => {
    const fixture = create();
    show(fixture, 'watchlist');
    (part(fixture, '.new-list button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(part(fixture, '#new-list-name'));
  });

  // The new list stands first, right under the form that made it, ready to be named again or filled.
  it('puts a new list first, open for changes, where the button that made it is', () => {
    const fixture = create(), page = fixture.componentInstance;
    show(fixture, 'watchlist');
    page.newListTitle = 'Ideas to read about';
    page.addNewList();
    fixture.detectChanges();
    expect(page.watchLists[0].title).toBe('Ideas to read about');
    expect(page.editingListId).toBe(page.watchLists[0].id);
    expect(fixture.nativeElement.querySelector('.lists .list')?.textContent).toContain('Ideas to read about');
  });

  // Found by a review of the page: "Reload prices" took the plan away for the seconds a reload takes. The lines,
  // the "to do" on the portfolios' buttons and the rows of "Could add" vanished, the page jumped, and a form that
  // was open was thrown away with what had been typed.
  it('keeps the plan on the page while prices that are already there are loaded again', () => {
    const fixture = create(), page = fixture.componentInstance;
    expect(page.working).withContext('before the first prices').toBeTrue();
    page.loaded = true;
    page.pending = 0;
    expect(page.working).toBeFalse();
    page.pending = 6;
    expect(page.working).withContext('a reload: every list still shows its old rows').toBeFalse();
    page.pending = 0;
    expect(page.working).toBeFalse();
  });

  it('puts the keyboard back on "New list" when its form is cancelled', fakeAsync(() => {
    const fixture = create();
    show(fixture, 'watchlist');
    (part(fixture, '.new-list button') as HTMLButtonElement).click();
    fixture.detectChanges();
    fixture.componentInstance.cancelNewList();
    fixture.detectChanges();
    tick();
    expect(document.activeElement).toBe(part(fixture, '.lists-bar .new-list button'));
    flush();
  }));

  // The owner: "the fact that watchlist is mapping to a random portfolio is odd". On the Watchlist a stock is
  // "held" when any portfolio holds it, whichever one the other view shows, and the tag says in which.
  it('counts a stock as held when any portfolio holds it, and says in which', () => {
    const fixture = create(), page = fixture.componentInstance;
    page.book.portfolios[0].positions['ACME'] = {symbol: 'ACME', shares: 2, price: 50};
    const first = page.book.portfolios[0].name;
    page.addPortfolio('Savings');
    const stock = {quote: {symbol: 'ACME'}} as never;
    expect(page.isHeld(stock)).withContext('held in the portfolio that is not shown').toBeTrue();
    expect(page.heldWhere(stock)).toBe(`You hold this in ${first}.`);
    expect(page.isHeld({quote: {symbol: 'ZED'}} as never)).toBeFalse();
    fixture.detectChanges();
    expect(part(fixture, '.lists-bar .held-in')).withContext('no line about one portfolio any more').toBeNull();
  });

  it('names the view in the browser\'s tab', () => {
    const fixture = create();
    expect(document.title).toBe('Portfolio · Stock Screener');
    show(fixture, 'watchlist');
    expect(document.title).toBe('Watchlist · Stock Screener');
  });

  describe('where the portfolios are saved, as the store answers on opening', () => {
    const answerTheLoad = (answer: object) => {
      const fixture = create(), page = fixture.componentInstance;
      TestBed.inject(HttpTestingController).match(request => request.url === '/store/portfolios' && request.method === 'GET')
        .forEach(request => request.flush(answer));
      fixture.detectChanges();
      return page;
    };

    it('says the database when it answers', () => {
      expect(answerTheLoad({store: 'watchlist', value: null}).savedIn).toBe('database');
    });

    it('says memory when the answer says nothing is kept, as the development server does', () => {
      expect(answerTheLoad({store: 'watchlist', value: null, lasting: false}).savedIn).toBe('memory');
    });

    it('says the browser when nothing answers', () => {
      const fixture = create(), page = fixture.componentInstance;
      TestBed.inject(HttpTestingController).match(request => request.url === '/store/portfolios' && request.method === 'GET')
        .forEach(request => request.flush('down', {status: 503, statusText: 'Service Unavailable'}));
      expect(page.savedIn).toBe('browser');
    });

    describe('after a change is saved', () => {
      const changeAndAnswerTheSave = (answer: (request: TestRequest) => void) => {
        const page = answerTheLoad({store: 'watchlist', value: null});
        const http = TestBed.inject(HttpTestingController);
        // What opening itself saved is answered as the database would, so only the change is under test.
        http.match(request => request.url === '/store/portfolios' && request.method === 'PUT')
          .forEach(request => request.flush({store: 'watchlist', saved: true}));
        page.addPortfolio('Savings');
        const saves = http.match(request => request.url === '/store/portfolios' && request.method === 'PUT');
        expect(saves.length).withContext('one save for the change').toBe(1);
        answer(saves[0]);
        return page;
      };

      it('says the database when the store kept it', () => {
        expect(changeAndAnswerTheSave(save => save.flush({store: 'watchlist', saved: true})).savedIn).toBe('database');
      });

      it('says memory when the store kept it but says it keeps nothing past its end, as the development server does', () => {
        expect(changeAndAnswerTheSave(save => save.flush({store: 'watchlist', saved: true, lasting: false})).savedIn).toBe('memory');
      });

      it('says the browser when the store did not answer the save', () => {
        expect(changeAndAnswerTheSave(save => save.flush('down', {status: 503, statusText: 'Service Unavailable'})).savedIn).toBe('browser');
      });
    });

    it('tells, when the saved portfolios cannot be read, that the copy of this browser is shown and what the next change does', () => {
      const page = answerTheLoad({store: 'watchlist', value: {v: 2, active: 'p1', portfolios: [{id: 'p1', name: ''}]}});
      expect(page.notice?.text).toBe('The portfolios saved in the database could not be read, so the copy kept in this browser is shown. ' +
        'Your next change replaces them; the unreadable version is kept in the database as the one before.');
    });
  });

  describe('the daily copy of the records, as the page reads its outcome', () => {
    const answerWith = (value: unknown) => {
      const fixture = create(), page = fixture.componentInstance;
      TestBed.inject(HttpTestingController).match(request => request.url === '/store/copy-status' && request.method === 'GET')
        .forEach(request => request.flush({store: 'watchlist', value}));
      fixture.detectChanges();
      return page;
    };

    it('says, among the notes that need attention, that a copy could not be made', () => {
      expect(answerWith({triedAt: '2026-11-23T22:00:00.000Z', ok: false, message: 'no room'}).evidenceText).toContain(
        'The daily copy of your records could not be made on Nov 23. Check that Docker can write to the folder that holds your data.');
    });

    it('says nothing when the copy was made, or there is no record of one', () => {
      expect(answerWith({triedAt: '2026-11-23T22:00:00.000Z', ok: true, file: 'copy.json'}).evidenceText).toBe('');
      expect(answerWith(null).evidenceText).toBe('');
    });
  });

  // Thirty stocks in seven lists, each sorted by itself: a symbol had to be looked for down every list.
  // Found by a review of the page: on a day the data source or the database did not answer, the Portfolio view
  // was at its weakest. It said "Working it out" for good, or read like a first run to an owner with holdings.
  describe('when there is no plan to show', () => {
    const state = (page: WatchlistTableComponent, state: object) => Object.assign(page as unknown as object, state);

    it('says in the plan box that no price arrived, once the first load has failed and nothing is under way', () => {
      const fixture = create(), page = fixture.componentInstance;
      expect(page.noPrices).withContext('still loading').toBeFalse();
      state(page, {loading: 0});
      (page as unknown as { failedLists: Set<string> }).failedLists.add('any');
      fixture.detectChanges();
      expect(page.noPrices).toBeTrue();
      expect(say(part(fixture, 'app-plan-card .instead p'))).toBe('Today\'s prices could not be loaded: the data source did not answer. Without them there is no plan to show.');
      expect(say(part(fixture, 'app-could-add .empty.instead'))).toBe('Today\'s prices could not be loaded: the data source did not answer.');
      expect(part(fixture, 'app-plan-card .waiting')).toBeNull();
      const loadAll = spyOn(page, 'loadAll');
      part(fixture, 'app-plan-card .instead button').click();
      expect(loadAll).toHaveBeenCalledTimes(1);
    });

    // Found by a review of the page: on a day without prices the Watchlist said so in every list, six alerts and
    // six buttons. It is said once, above the lists.
    it('says once above the lists that no price arrived, with one "Try again"', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      expect(part(fixture, '.lists-failed')).withContext('while loading').toBeNull();
      state(page, {loading: 0});
      (page as unknown as { failedLists: Set<string> }).failedLists.add('any');
      fixture.detectChanges();
      const line = part(fixture, '.lists-failed');
      expect(line.getAttribute('role')).toBe('alert');
      expect(say(line.querySelector('p'))).toBe('Today\'s prices could not be loaded: the data source did not answer.');
      const loadAll = spyOn(page, 'loadAll');
      line.querySelector('button')!.click();
      expect(loadAll).toHaveBeenCalledTimes(1);
    });

    // Seen on the page: after "Try again" had loaded every price, the bar still said that prices could not be
    // loaded. The list of what is held outside the lists had failed with the others and was then no longer shown.
    it('no longer counts a list as failed once it is not shown', () => {
      const fixture = create(), page = fixture.componentInstance;
      const inside = page as unknown as { failedLists: Set<string>, showLists(): void };
      inside.failedLists.add(page.heldOutside.id);
      inside.showLists();
      expect(inside.failedLists.size).toBe(0);
    });

    it('does not read like a first run when the saved portfolios could not be read and this browser has none', () => {
      const fixture = create(), page = fixture.componentInstance;
      state(page, {savedIn: 'browser'});
      fixture.detectChanges();
      expect(page.portfoliosUnread).toBeTrue();
      expect(say(part(fixture, 'app-plan-card .instead p'))).toContain('Your saved portfolios could not be read: the database is not answering. Start the app with "docker compose up -d", then try again. What is shown here is an empty portfolio kept in this browser only.');
      expect(part(fixture, 'app-plan-card .steps')).withContext('no START HERE').toBeNull();
    });

    it('does not count the development server as unread: its store answered, it only keeps nothing', () => {
      const fixture = create(), page = fixture.componentInstance;
      state(page, {savedIn: 'memory'});
      fixture.detectChanges();
      expect(page.portfoliosUnread).toBeFalse();
      expect(page.planTrouble).toBe('');
    });

    it('shows the plan as usual when the store is not answering but this browser has the holdings', () => {
      const fixture = create(), page = fixture.componentInstance;
      state(page, {savedIn: 'browser'});
      page.book.portfolios[0].positions['ACME'] = {symbol: 'ACME', shares: 2, price: 50};
      fixture.detectChanges();
      expect(page.portfoliosUnread).toBeFalse();
      expect(page.planTrouble).toBe('');
    });
  });

  // Found by a review of the page: a reload that failed kept the rows' old prices, as the bar says, but took the
  // market's figures off the page without a word (the GOOD TIME line of the plan, "Market since").
  it('keeps the market\'s last figures when a reload brings none', () => {
    const fixture = create(), page = fixture.componentInstance;
    const inside = page as unknown as { microsoftMoneyService: { getMarket(): unknown }, loadMarket(): void, indexNow?: number };
    spyOn(inside.microsoftMoneyService, 'getMarket').and.returnValues(of({spy: 600, vix: 30}), of({}));
    inside.loadMarket();
    expect([inside.indexNow, !!page.fear]).toEqual([600, true]);
    inside.loadMarket();
    expect([inside.indexNow, !!page.fear]).withContext('nothing came: the last figures stay').toEqual([600, true]);
  });

  // Found by a review of the page: a click on a heading reordered one list, and the others stayed as they were.
  it('orders every list by the column that was clicked in one of them, and remembers it for a list shown later', () => {
    const fixture = create(), page = fixture.componentInstance;
    expect(page.listSort).withContext('to begin with: the marks, DIP BUY first').toEqual({active: 'signal', direction: 'desc'});
    const tables = [{sortTo: jasmine.createSpy('sortTo')}, {sortTo: jasmine.createSpy('sortTo')}];
    (page as unknown as { tables: unknown }).tables = tables;
    page.sortLists({active: 'oneYear', direction: 'asc'});
    tables.forEach(table => expect(table.sortTo).toHaveBeenCalledOnceWith('oneYear', 'asc'));
    expect(page.listSort).toEqual({active: 'oneYear', direction: 'asc'});
  });

  // Found by a review of the page: each stock opened from the plan stays open on the watchlist, and they could
  // only be closed one by one.
  describe('the details that are open', () => {
    it('offers to close them all once two or more are open, and tells the address', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      spyOnProperty(page, 'openDetails', 'get').and.returnValue(3);
      fixture.detectChanges();
      const button = part(fixture, '.lists-bar .close-all');
      expect(say(button)).toBe('Close all 3 open details');
      page.rowToggled({row: {quote: {symbol: 'ACME'}} as never, open: true});
      const said: (string | undefined)[] = [];
      page.stockShown.subscribe(symbol => said.push(symbol));
      button.click();
      expect(said).withContext('no stock is open any more').toEqual([undefined]);
    });

    it('offers nothing of the kind for one open stock: its own button and its foot close it', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      spyOnProperty(page, 'openDetails', 'get').and.returnValue(1);
      fixture.detectChanges();
      expect(part(fixture, '.lists-bar .close-all')).toBeNull();
    });
  });

  // Found by a review of the page: a stock had no address. The bar stayed at /watchlist with details open, nothing
  // could be bookmarked, and a reload of the page closed whatever was open.
  describe('the address of a stock', () => {
    const complete = (page: WatchlistTableComponent) => {
      (page as unknown as { wasComplete: boolean }).wasComplete = true;
      (page as unknown as { openFromAddress(): void }).openFromAddress();
    };
    const told = (page: WatchlistTableComponent) => {
      const said: (string | undefined)[] = [];
      page.stockShown.subscribe(symbol => said.push(symbol));
      return said;
    };

    it('follows the details that are open: the stock that was opened last, and nothing once it is closed', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      const said = told(page);
      page.findable = [{symbol: 'ACME', name: 'Acme Tools Inc'}, {symbol: 'ZED', name: 'Zed Energy Corp'}];
      page.findText = 'acme';
      page.findStock();
      page.rowToggled({row: {quote: {symbol: 'ZED'}} as never, open: true});
      page.rowToggled({row: {quote: {symbol: 'ACME'}} as never, open: false});
      expect(said).withContext('closing another row than the one named changes nothing').toEqual(['ACME', 'ZED']);
      page.rowToggled({row: {quote: {symbol: 'ZED'}} as never, open: false});
      expect(said).toEqual(['ACME', 'ZED', undefined]);
    });

    it('opens the stock the address names, once the lists have their prices and not before', () => {
      const fixture = create(), page = fixture.componentInstance;
      const open = spyOn(page as unknown as { openStock(symbol: string): void }, 'openStock');
      show(fixture, 'watchlist');
      page.findable = [{symbol: 'ACME', name: 'Acme Tools Inc'}];
      fixture.componentRef.setInput('stock', 'ACME');
      fixture.detectChanges();
      expect(open).withContext('its row is not there yet').not.toHaveBeenCalled();
      complete(page);
      expect(open).toHaveBeenCalledOnceWith('ACME');
      complete(page);
      expect(open).withContext('once').toHaveBeenCalledTimes(1);
    });

    it('says why nothing opened for a stock that is in no list, and takes it out of the address', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      const said = told(page);
      page.findable = [{symbol: 'ACME', name: 'Acme Tools Inc'}];
      fixture.componentRef.setInput('stock', 'GONE');
      fixture.detectChanges();
      complete(page);
      fixture.detectChanges();
      expect(say(part(fixture, '.find-problem'))).toBe('"GONE" is not in your lists. "Edit list" on a list adds a stock.');
      expect(said).toEqual([undefined]);
    });

    it('names the open stock again when the reader comes back to the watchlist from the other view', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      page.rowToggled({row: {quote: {symbol: 'ACME'}} as never, open: true});
      show(fixture, 'portfolio');
      const said = told(page);
      show(fixture, 'watchlist');
      expect(said).toEqual(['ACME']);
    });
  });

  describe('"Find a stock", above the lists', () => {
    it('stands in the line of "Your lists", named for a screen reader, and offers the stocks of the lists while typing', () => {
      const fixture = create(), page = fixture.componentInstance;
      page.findable = [{symbol: 'ACME', name: 'Acme Tools Inc'}, {symbol: 'ZED', name: 'Zed Energy Corp'}];
      fixture.detectChanges();
      const form = part(fixture, '.lists-bar form.find')!;
      expect(form.getAttribute('role')).toBe('search');
      expect(say(form.querySelector('label'))).toBe('Find a stock in your lists, by its symbol or its company\'s name');
      expect(form.querySelector('input')!.getAttribute('placeholder')).toContain('Find a stock');
      expect(Array.from(form.querySelectorAll('datalist option')).map(option => [option.getAttribute('value'), say(option)]))
        .toEqual([['ACME', 'Acme Tools Inc'], ['ZED', 'Zed Energy Corp']]);
    });

    it('says so beside the field when nothing in the lists fits, keeps what was typed, and takes the sentence back on the next key', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      page.findable = [{symbol: 'ACME', name: 'Acme Tools Inc'}];
      page.findText = 'nope';
      page.findStock();
      fixture.detectChanges();
      expect(say(part(fixture, '.find-problem'))).toBe('"nope" is not in your lists. "Edit list" on a list adds a stock.');
      expect(page.findText).toBe('nope');
      part(fixture, '#find-stock')!.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(say(part(fixture, '.find-problem'))).toBe('');
    });

    it('empties the field once the stock is found, ready for the next one', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      page.findable = [{symbol: 'ACME', name: 'Acme Tools Inc'}];
      page.findText = 'acme tools';
      page.findStock();
      expect([page.findText, page.findProblem, page.findNote]).toEqual(['', '', '']);
    });

    it('names the other stocks when what was typed fits several, and takes that back on the next key', () => {
      const fixture = create(), page = fixture.componentInstance;
      show(fixture, 'watchlist');
      page.findable = [{symbol: 'ACME', name: 'North Tools Inc'}, {symbol: 'TLS', name: 'North Toolmakers'}, {symbol: 'ZED', name: 'Zed Energy Corp'}];
      page.findText = 'north';
      page.findStock();
      fixture.detectChanges();
      expect(say(part(fixture, '.find-note'))).toBe('"north" also fits TLS.');
      part(fixture, '#find-stock')!.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(say(part(fixture, '.find-note'))).toBe('');
    });

    it('takes the keyboard on "/" on the watchlist\'s view, and not while something is being typed elsewhere', () => {
      const fixture = create();
      show(fixture, 'watchlist');
      const field = part(fixture, '#find-stock') as HTMLInputElement;
      const key = (target: EventTarget) => {
        const event = new KeyboardEvent('keydown', {key: '/', bubbles: true, cancelable: true});
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(key(document.body)).withContext('the key is used up').toBeTrue();
      expect(document.activeElement).toBe(field);
      field.blur();
      (part(fixture, '.new-list button') as HTMLButtonElement).click();
      fixture.detectChanges();
      const name = part(fixture, '#new-list-name') as HTMLInputElement;
      expect(key(name)).withContext('a "/" typed into a name is a "/"').toBeFalse();
      expect(document.activeElement).toBe(name);
    });

    // Found by a review of the page: the one shortcut did nothing on the portfolio's view.
    it('leads to the watchlist on "/" from the portfolio\'s view, with the keyboard in the field once it is shown', fakeAsync(() => {
      const fixture = create(), page = fixture.componentInstance;
      const asked: PageView[] = [];
      page.go.subscribe(view => asked.push(view));
      const event = new KeyboardEvent('keydown', {key: '/', bubbles: true, cancelable: true});
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBeTrue();
      expect(asked).toEqual(['watchlist']);
      show(fixture, 'watchlist');
      flush();
      expect(document.activeElement).toBe(part(fixture, '#find-stock'));
    }));
  });

  // The notice with its Undo stands in the plan box, and that box is hidden while the watchlist is shown.
  it('offers to take a removal back where it was made: on the watchlist\'s view, in a message of its own', () => {
    const fixture = create(), page = fixture.componentInstance;
    const undo = new Subject<void>();
    const opened = spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open').and.returnValue({onAction: () => undo} as any);
    page.savePosition({symbol: 'ACME', shares: 10, price: 100});
    show(fixture, 'watchlist');

    page.removePosition('ACME');
    expect(page.portfolio.positions['ACME']).toBeUndefined();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.calls.mostRecent().args.slice(0, 2)).toEqual(['Removed ACME from what you own.', 'Undo']);

    undo.next();
    expect(page.portfolio.positions['ACME']).withContext('back after Undo').toEqual(jasmine.objectContaining({shares: 10, price: 100}));
  });

  // A purchase is recorded where the stock's details are: on the watchlist's view. The holding and the cash change
  // in one save, a sentence says both, and one Undo takes both back.
  it('records a purchase with its money: the holding and the cash in one step, said in words, with one Undo', () => {
    const fixture = create(), page = fixture.componentInstance;
    const undo = new Subject<void>();
    const opened = spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open').and.returnValue({onAction: () => undo} as any);
    page.saveSettings({cash: 5000, lossBudgetPercent: 10});
    page.savePosition({symbol: 'ACME', shares: 10, price: 100});
    show(fixture, 'watchlist');

    page.recordTrade({symbol: 'ACME', holding: {symbol: 'ACME', shares: 40, price: 70}, cashChange: -1800, text: 'Bought 30 more shares of ACME at 60.00.'});
    expect(page.portfolio.positions['ACME']).toEqual(jasmine.objectContaining({shares: 40, price: 70}));
    expect(page.portfolio.cash).toBe(3200);
    expect(opened.calls.mostRecent().args.slice(0, 2)).toEqual(['Bought 30 more shares of ACME at 60.00. Cash is now $3,200.', 'Undo']);

    undo.next();
    expect(page.portfolio.positions['ACME']).withContext('the holding is back').toEqual(jasmine.objectContaining({shares: 10, price: 100}));
    expect(page.portfolio.cash).withContext('and so is the cash').toBe(5000);
  });

  it('says when a trade left the cash as it was, and takes a stock out when all of it was sold', () => {
    const fixture = create(), page = fixture.componentInstance;
    page.saveSettings({cash: 5000, lossBudgetPercent: 10});
    page.savePosition({symbol: 'ACME', shares: 10, price: 100});
    page.recordTrade({symbol: 'ACME', holding: {symbol: 'ACME', shares: 6, price: 100}, cashChange: 0, text: 'Sold 4 shares of ACME.'});
    fixture.detectChanges();
    expect(say(part(fixture, 'app-positions-card .notice'))).toContain('Sold 4 shares of ACME. Cash was left as it was.');
    expect(page.portfolio.cash).toBe(5000);

    page.recordTrade({symbol: 'ACME', cashChange: 570.5, text: 'Sold all you held of ACME at 95.08.'});
    expect(page.portfolio.positions['ACME']).toBeUndefined();
    expect(page.portfolio.cash).toBe(5570.5);
  });

  // "Edit" in a stock's details replaces what is recorded. It was the one overwrite without a way back, beside
  // three forms that have one.
  it('says a correction of a holding in a sentence and lets it be taken back', () => {
    const fixture = create(), page = fixture.componentInstance;
    page.savePosition({symbol: 'ACME', shares: 10, price: 100});
    page.savePosition({symbol: 'ACME', shares: 12.5, price: 96});
    fixture.detectChanges();
    expect(say(part(fixture, 'app-positions-card .notice'))).toContain('ACME is now recorded as 12.5 shares at 96.00.');
    page.undoChange();
    expect(page.portfolio.positions['ACME']).withContext('as it was before the correction').toEqual(jasmine.objectContaining({shares: 10, price: 100}));
  });

  // A purchase entered in "Could add" is said where the reader is when the plan box, which holds the notice, is not
  // on screen (in a window that shows the two boxes one under the other).
  it('says a purchase entered in "Could add" in a message of its own when the plan box is out of sight', () => {
    const fixture = create(), page = fixture.componentInstance;
    const opened = spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open').and.returnValue({onAction: () => new Subject<void>()} as any);
    const box = document.querySelector('app-positions-card') as HTMLElement;
    const place = spyOn(box, 'getBoundingClientRect');
    const trade = {symbol: 'ACME', holding: {symbol: 'ACME', shares: 4, price: 50}, cashChange: 0, text: 'Added 4 shares of ACME at 50.00.'};

    place.and.returnValue({top: 80} as DOMRect);
    page.recordTrade(trade, true);
    expect(opened).withContext('the notice in the plan box is in view').not.toHaveBeenCalled();

    place.and.returnValue({top: -900} as DOMRect);
    page.recordTrade({...trade, holding: {symbol: 'ACME', shares: 8, price: 50}, text: 'Bought 4 more shares of ACME at 50.00.'}, true);
    expect(String(opened.calls.mostRecent().args[0])).toMatch(/^Bought 4 more shares of ACME at 50\.00\./);
    expect(opened.calls.mostRecent().args[1]).toBe('Undo');
  });

  // Several purchases recorded together (the stocks ticked in "Could add"): one save, one sentence, one Undo.
  it('records several purchases in one step: every holding and the cash, named in one sentence, with one Undo for all', () => {
    const fixture = create(), page = fixture.componentInstance;
    page.saveSettings({cash: 5000, lossBudgetPercent: 10});
    page.savePosition({symbol: 'ZED', shares: 50, price: 30});
    page.recordTrades([
      {symbol: 'ACME', holding: {symbol: 'ACME', shares: 40, price: 50}, cashChange: -2000, text: 'Added 40 shares of ACME at 50.00.'},
      {symbol: 'ZED', holding: {symbol: 'ZED', shares: 100, price: 25}, cashChange: -1000, text: 'Bought 50 more shares of ZED at 20.00.'},
      {symbol: 'TOOL', holding: {symbol: 'TOOL', shares: 5, price: 10}, cashChange: -50, text: 'Added 5 shares of TOOL at 10.00.'},
    ]);
    fixture.detectChanges();
    expect(Object.keys(page.portfolio.positions).sort()).toEqual(['ACME', 'TOOL', 'ZED']);
    expect(page.portfolio.positions['ZED']).toEqual(jasmine.objectContaining({shares: 100, price: 25}));
    expect(page.portfolio.cash).toBe(1950);
    expect(say(part(fixture, 'app-positions-card .notice'))).toContain('Recorded 3 purchases: ACME, ZED and TOOL. Cash is now $1,950.');

    page.undoChange();
    expect(Object.keys(page.portfolio.positions)).withContext('all three taken back').toEqual(['ZED']);
    expect(page.portfolio.positions['ZED']).toEqual(jasmine.objectContaining({shares: 50, price: 30}));
    expect(page.portfolio.cash).toBe(5000);
  });

  it('says a removal made on the portfolio\'s view in the plan box only: its notice is in view there', () => {
    const fixture = create(), page = fixture.componentInstance;
    const opened = spyOn(fixture.debugElement.injector.get(MatSnackBar), 'open');
    page.savePosition({symbol: 'ACME', shares: 10, price: 100});
    page.removePosition('ACME');
    fixture.detectChanges();
    expect(opened).not.toHaveBeenCalled();
    expect(say(part(fixture, 'app-positions-card .notice'))).toContain('Removed ACME from what you own.');
  });

  it('tells "Could add" which portfolio is shown, and that it is still working while prices arrive', () => {
    const fixture = create();
    expect(say(part(fixture, 'app-could-add h2'))).toBe('Could add');
    expect(say(part(fixture, 'app-could-add p.empty'))).toBe('Working it out from today\'s prices.');
    expect(fixture.componentInstance.shownName).toBe(fixture.componentInstance.book.portfolios[0].name);
  });

  // "Could add" splits the shown portfolio's cash between the stocks the user ticks. The page hands it that cash,
  // what the sizes were worked out from, and the stocks that are owned and can be added to.
  it('hands "Could add" what it splits the cash from', () => {
    const fixture = create(), page = fixture.componentInstance;
    const sizing = {portfolioValue: 10_000, limitPercent: 10, holdings: []};
    const additions = [{symbol: 'ACME', sharePercent: 4, dollars: 400, loss: 124, gain: 224, capped: false}];
    page.portfolio = {...page.portfolio, cash: 1000};
    page.sizing = sizing;
    page.additions = additions;
    page.couldAddNames = {ACME: 'Acme Tools Inc'};
    fixture.detectChanges();
    const box = fixture.debugElement.query(By.directive(CouldAddComponent)).componentInstance as CouldAddComponent;
    expect(box.cash).toBe(1000);
    expect(box.sizing).toBe(sizing);
    expect(box.additions).toBe(additions);
    expect(box.names).withContext('the names of its companies, for the symbols').toEqual({ACME: 'Acme Tools Inc'});
  });

  // How far the stocks of the shown portfolio are one bet: said from what each is worth today and from the year of
  // prices the page has loaded, in place of the sentence that quoted a figure for the last month.
  it('works out for "What you own" how far the stocks of the shown portfolio are one bet', () => {
    const fixture = create(), page = fixture.componentInstance;
    // Two stocks whose prices go up and down on the same days, by the same amounts.
    const closes = [100];
    for (let i = 0; i < 252; i++) {
      closes.push(closes[i] * (1 + [0.02, 0.02, -0.02, -0.02][i % 4]));
    }
    const loaded = (page as unknown as { stocksBySymbol: Map<string, unknown> }).stocksBySymbol;
    ['ACME', 'ZED'].forEach(symbol => loaded.set(symbol, makeStock({symbol, price: 100, closes})));
    page.savePosition({symbol: 'ACME', shares: 10, price: 100});
    page.savePosition({symbol: 'ZED', shares: 10, price: 100});
    expect(page.positionsTogether).toBe('Both of your stocks are in Technology. Over the past year your stocks moved like one bet.');

    // A third holding whose quote did not load: the sentence would be about two stocks under a headline of three.
    // NO PRICE says what to do; until then the sentence is not shown.
    page.savePosition({symbol: 'GONE', shares: 5, price: 20});
    expect(page.positionsTogether).withContext('a holding has no price').toBe('');
  });

  it('saves the level for taking a profit with the portfolio, and takes a save without one as "no level"', () => {
    const fixture = create(), page = fixture.componentInstance;
    page.saveSettings({cash: 5000, lossBudgetPercent: 10, takeProfitPercent: 15});
    expect(page.portfolio.takeProfitPercent).toBe(15);
    page.saveSettings({cash: 5000, lossBudgetPercent: 10});
    expect(page.portfolio.takeProfitPercent).toBeUndefined();
  });

  // The box splits only the cash above what the portfolio keeps outside stocks: the page hands it that amount.
  it('hands "Could add" the dollars the shown portfolio keeps outside stocks', () => {
    const fixture = create(), page = fixture.componentInstance;
    const box = () => fixture.debugElement.query(By.directive(CouldAddComponent)).componentInstance as CouldAddComponent;
    expect(box().keep ?? undefined).withContext('no share set').toBeUndefined();
    page.positions = {...page.positions, reserve: {percent: 20, dollars: 2000, cash: 1000, short: 1000, cashPercent: 10, atLeast: false}};
    fixture.detectChanges();
    expect(box().keep).toBe(2000);
  });

  // The third setting of a portfolio, beside its cash and its limit: the share to keep outside stocks.
  it('saves the share to keep outside stocks with the cash and the limit, and takes it away again', () => {
    const fixture = create(), page = fixture.componentInstance;
    page.saveSettings({cash: 5000, lossBudgetPercent: 10, reservePercent: 20});
    expect([page.portfolio.cash, page.portfolio.lossBudgetPercent, page.portfolio.reservePercent]).toEqual([5000, 10, 20]);
    page.savePosition({symbol: 'ACME', shares: 10, price: 100});
    expect(page.portfolio.reservePercent).withContext('kept when something else of the portfolio changes').toBe(20);
    page.saveSettings({cash: 5000, lossBudgetPercent: 10});
    expect(page.portfolio.reservePercent).withContext('the field was emptied').toBeUndefined();
  });

  // The ticks in the box belong to a portfolio, whatever its name: the box is told which one it is. And a holding
  // whose price did not load is held all the same: the box counts it when it says how many stocks would be held.
  it('tells "Could add" which portfolio it is, and how many of its holdings have no price today', () => {
    const fixture = create(), page = fixture.componentInstance;
    const box = () => fixture.debugElement.query(By.directive(CouldAddComponent)).componentInstance as CouldAddComponent;
    expect(box().portfolioId).toBe(page.book.portfolios[0].id);
    expect(box().unpriced).toBe(0);
    page.savePosition({symbol: 'ACME', shares: 10, price: 100});   // no price arrives for it in this test
    fixture.detectChanges();
    expect(box().unpriced).toBe(1);
    // Another portfolio is shown: the box is told its id, and that it holds nothing without a price.
    page.addPortfolio('Savings');
    fixture.detectChanges();
    expect(page.book.portfolios.length).toBe(2);
    expect(box().portfolioId).withContext('the one being shown now').toBe(page.book.portfolios[1].id);
    expect(box().unpriced).toBe(0);
  });
});
