import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {catchError, map, Observable, of} from "rxjs";
import {parseBook, PortfolioBook} from "./portfolio-book";

/**
 * What the store answered:
 *  - available with a book: the database's copy;
 *  - available without one: the store is answering and nothing is saved yet (`damaged` when a record is there but
 *    cannot be read as a book);
 *  - not available: the store is not answering, so the copy in the browser is all there is.
 */
export type StoredBook =
  | { available: true, book: PortfolioBook | undefined, damaged?: boolean }
  | { available: false };

const URL = '/store/portfolios';
/** Every answer of the store carries this name, so another server answering on the same path is not mistaken for it. */
const STORE = 'watchlist';

/**
 * The portfolios kept in the database of the app on this computer, reached through its /store route
 * (tools/store/store-server.js; the development server answers it from memory, proxy.conf.js). It never fails
 * loudly: when the store is not answering the page keeps working from the copy in the browser and says so.
 */
@Injectable({providedIn: 'root'})
export class PortfolioStoreService {
  /**
   * Whether what is saved stays saved. True until an answer of the store says it keeps nothing past its own end,
   * which is what the development server's store says: then the page must not tell you your entries are kept.
   */
  lasting = true;

  constructor(private http: HttpClient) {
  }

  load(): Observable<StoredBook> {
    return this.http.get<any>(URL).pipe(
      map((body): StoredBook => {
        if (!body || body.store !== STORE) {
          return {available: false};
        }
        this.noticeLasting(body);
        if (body.value === null || body.value === undefined) {
          return body.damaged ? {available: true, book: undefined, damaged: true} : {available: true, book: undefined};
        }
        const book = parseBook(JSON.stringify(body.value));
        return book ? {available: true, book} : {available: true, book: undefined, damaged: true};
      }),
      catchError(() => of<StoredBook>({available: false}))
    );
  }

  /** Writes the book to the store. Emits whether it was written. */
  save(book: PortfolioBook): Observable<boolean> {
    return this.http.put<any>(URL, book).pipe(
      map(body => {
        if (!body || body.store !== STORE) {
          return false;
        }
        this.noticeLasting(body);
        return body.saved === true;
      }),
      catchError(() => of(false))
    );
  }

  private noticeLasting(body: any) {
    if (body.lasting === false) {
      this.lasting = false;
    }
  }
}
