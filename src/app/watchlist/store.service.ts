import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {catchError, map, Observable, of} from "rxjs";

/**
 * What the store answered for one key:
 *  - available with a value: what the database holds;
 *  - available without one: the store is answering and nothing is saved under that key yet (`damaged` when a record
 *    is there but cannot be read);
 *  - not available: the store is not answering, so the copy in the browser is all there is.
 */
export type Stored = { available: true, value: unknown | undefined, damaged?: boolean } | { available: false };

/** Every answer of the store carries this name, so another server answering on the same path is not mistaken for it. */
const STORE = 'watchlist';

/**
 * What the database keeps for the app (your lists, the daily log), reached through its /store route
 * (tools/store/store-server.js; the development server answers it from memory, proxy.conf.js). It never fails
 * loudly: when the store is not answering the page keeps working from the copy in the browser. Portfolios have
 * their own service, which also checks the book.
 */
@Injectable({providedIn: 'root'})
export class StoreService {
  constructor(private http: HttpClient) {
  }

  load(key: string): Observable<Stored> {
    return this.http.get<any>(`/store/${key}`).pipe(
      map((body): Stored => {
        if (!body || body.store !== STORE) {
          return {available: false};
        }
        const value = body.value === null || body.value === undefined ? undefined : body.value;
        return body.damaged ? {available: true, value: undefined, damaged: true} : {available: true, value};
      }),
      catchError(() => of<Stored>({available: false}))
    );
  }

  /** Replaces the record. Emits whether it was written. */
  save(key: string, value: unknown): Observable<boolean> {
    return this.http.put<any>(`/store/${key}`, value).pipe(
      map(body => !!body && body.store === STORE && body.saved === true),
      catchError(() => of(false))
    );
  }

  /**
   * Merges a change into the record (objects are merged key by key; a key sent as null is removed). Used where the
   * page is not the only writer: the daily log is also written by the recorder. Emits whether it was merged.
   */
  merge(key: string, change: object): Observable<boolean> {
    return this.http.patch<any>(`/store/${key}`, change).pipe(
      map(body => !!body && body.store === STORE && body.saved === true),
      catchError(() => of(false))
    );
  }
}
