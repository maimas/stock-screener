import {TestBed} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {Stored, StoreService} from "./store.service";

describe('StoreService (what the database keeps for the app, reached through its /store route)', () => {
  let store: StoreService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    store = TestBed.inject(StoreService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loaded(key: string, answer: (request: ReturnType<HttpTestingController['expectOne']>) => void): Stored | undefined {
    let result: Stored | undefined;
    store.load(key).subscribe(it => result = it);
    answer(http.expectOne(`/store/${key}`));
    return result;
  }

  describe('load', () => {
    it('returns what is kept in the database', () => {
      expect(loaded('watchlists', request => request.flush({store: 'watchlist', value: {v: 1, lists: []}})))
        .toEqual({available: true, value: {v: 1, lists: []}});
    });

    it('says the store is there but has nothing for that key yet', () => {
      expect(loaded('log', request => request.flush({store: 'watchlist', value: null}))).toEqual({available: true, value: undefined});
    });

    it('flags a file the store could not read', () => {
      expect(loaded('log', request => request.flush({store: 'watchlist', value: null, damaged: true})))
        .toEqual({available: true, value: undefined, damaged: true});
    });

    it('says the store is unavailable when the server does not answer', () => {
      expect(loaded('log', request => request.flush('gateway down', {status: 504, statusText: 'Gateway Timeout'}))).toEqual({available: false});
    });

    it('says the store is unavailable when something else answers in its place (a dev server without the store)', () => {
      expect(loaded('log', request => request.flush({title: 'some other page'}))).toEqual({available: false});
    });
  });

  describe('save', () => {
    it('replaces the file and says it was written', () => {
      let saved: boolean | undefined;
      store.save('watchlists', {v: 1, lists: []}).subscribe(it => saved = it);
      const request = http.expectOne('/store/watchlists');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({v: 1, lists: []});
      request.flush({store: 'watchlist', saved: true});
      expect(saved).toBe(true);
    });

    it('says it was not written when the store is not running', () => {
      let saved: boolean | undefined;
      store.save('watchlists', {v: 1, lists: []}).subscribe(it => saved = it);
      http.expectOne('/store/watchlists').flush('not found', {status: 404, statusText: 'Not Found'});
      expect(saved).toBe(false);
    });
  });

  describe('merge', () => {
    it('sends only the change, to be merged into the file', () => {
      let saved: boolean | undefined;
      const change = {days: {'2026-11-21': {s: {NVDA: {p: 125.53, v: 'D'}}}}};
      store.merge('log', change).subscribe(it => saved = it);
      const request = http.expectOne('/store/log');
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual(change);
      request.flush({store: 'watchlist', saved: true});
      expect(saved).toBe(true);
    });

    it('says it was not merged when the store refuses: an older store that cannot merge, or a file it cannot read', () => {
      let saved: boolean | undefined;
      store.merge('log', {days: {}}).subscribe(it => saved = it);
      http.expectOne('/store/log').flush({store: 'watchlist', error: 'Only GET and PUT.'}, {status: 405, statusText: 'Method Not Allowed'});
      expect(saved).toBe(false);
    });
  });
});
