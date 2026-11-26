import {TestBed} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {PortfolioStoreService, StoredBook} from "./portfolio-store.service";
import {activeOf, emptyBook, PortfolioBook, renamePortfolio, stamped, withActive} from "./portfolio-book";
import {withPosition} from "./positions";

const NVDA = {symbol: 'NVDA', shares: 10, price: 100, day: '2026-11-01'};
const named = renamePortfolio(emptyBook(), emptyBook().active, 'Brokerage');
const BOOK: PortfolioBook = stamped(withActive(named, withPosition(activeOf(named), NVDA)), new Date('2026-11-21T10:00:00Z'));

describe('PortfolioStoreService (the portfolios kept in the database, reached through the /store route)', () => {
  let store: PortfolioStoreService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    store = TestBed.inject(PortfolioStoreService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('load', () => {
    it('returns the book kept in the database', () => {
      let result: StoredBook | undefined;
      store.load().subscribe(it => result = it);
      http.expectOne('/store/portfolios').flush({store: 'watchlist', value: BOOK});
      expect(result).toEqual({available: true, book: BOOK});
    });

    it('says the store is there but empty before anything was saved', () => {
      let result: StoredBook | undefined;
      store.load().subscribe(it => result = it);
      http.expectOne('/store/portfolios').flush({store: 'watchlist', value: null});
      expect(result).toEqual({available: true, book: undefined});
    });

    it('says the store is unavailable when the server does not answer', () => {
      let result: StoredBook | undefined;
      store.load().subscribe(it => result = it);
      http.expectOne('/store/portfolios').flush('gateway down', {status: 504, statusText: 'Gateway Timeout'});
      expect(result).toEqual({available: false});
    });

    it('says the store is unavailable when something else answers in its place (a dev server without the store)', () => {
      let result: StoredBook | undefined;
      store.load().subscribe(it => result = it);
      http.expectOne('/store/portfolios').flush({title: 'some other page'});
      expect(result).toEqual({available: false});
    });

    it('flags a record the store itself could not read', () => {
      let result: StoredBook | undefined;
      store.load().subscribe(it => result = it);
      http.expectOne('/store/portfolios').flush({store: 'watchlist', value: null, damaged: true});
      expect(result).toEqual({available: true, book: undefined, damaged: true});
    });

    it('flags a record whose content is not a book, rather than loading part of it', () => {
      let result: StoredBook | undefined;
      store.load().subscribe(it => result = it);
      http.expectOne('/store/portfolios').flush({store: 'watchlist', value: {v: 2, active: 'p1', portfolios: [{id: 'p1', name: ''}]}});
      expect(result).toEqual({available: true, book: undefined, damaged: true});
    });
  });

  describe('lasting', () => {
    it('is true until an answer says otherwise', () => {
      expect(store.lasting).toBeTrue();
      store.load().subscribe();
      http.expectOne('/store/portfolios').flush({store: 'watchlist', value: BOOK});
      expect(store.lasting).toBeTrue();
    });

    it('turns false when an answer to a load says the store keeps nothing (the development server)', () => {
      store.load().subscribe();
      http.expectOne('/store/portfolios').flush({store: 'watchlist', value: null, lasting: false});
      expect(store.lasting).toBeFalse();
    });

    it('turns false when the answer carries a saved book as well', () => {
      store.load().subscribe();
      http.expectOne('/store/portfolios').flush({store: 'watchlist', value: BOOK, lasting: false});
      expect(store.lasting).toBeFalse();
    });

    // Once the store has said it keeps nothing, a later answer that is silent about it does not take that back.
    it('does not turn true again when a later answer says nothing about it', () => {
      store.save(BOOK).subscribe();
      http.expectOne('/store/portfolios').flush({store: 'watchlist', saved: true, lasting: false});
      store.load().subscribe();
      http.expectOne('/store/portfolios').flush({store: 'watchlist', value: BOOK});
      expect(store.lasting).toBeFalse();
    });

    it('turns false when an answer to a save says so', () => {
      store.save(BOOK).subscribe();
      http.expectOne('/store/portfolios').flush({store: 'watchlist', saved: true, lasting: false});
      expect(store.lasting).toBeFalse();
    });

    it('stays true when the answer carries no such field', () => {
      store.save(BOOK).subscribe();
      http.expectOne('/store/portfolios').flush({store: 'watchlist', saved: true});
      expect(store.lasting).toBeTrue();
    });

    it('is not changed by something else answering in place of the store', () => {
      store.load().subscribe();
      http.expectOne('/store/portfolios').flush({title: 'some other page', lasting: false});
      expect(store.lasting).toBeTrue();
    });
  });

  describe('save', () => {
    it('sends the book to the store and confirms it was written', () => {
      let saved: boolean | undefined;
      store.save(BOOK).subscribe(it => saved = it);
      const request = http.expectOne('/store/portfolios');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual(BOOK);
      request.flush({store: 'watchlist', saved: true});
      expect(saved).toBe(true);
    });

    it('reports failure, without throwing, when the store cannot be reached', () => {
      let saved: boolean | undefined;
      store.save(BOOK).subscribe(it => saved = it);
      http.expectOne('/store/portfolios').flush('not found', {status: 404, statusText: 'Not Found'});
      expect(saved).toBe(false);
    });

    it('reports failure when the answer does not come from the store', () => {
      let saved: boolean | undefined;
      store.save(BOOK).subscribe(it => saved = it);
      http.expectOne('/store/portfolios').flush({ok: true});
      expect(saved).toBe(false);
    });
  });
});
