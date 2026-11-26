import {Injectable} from "@angular/core";
import {HttpClient, HttpErrorResponse} from "@angular/common/http";
import {catchError, concat, concatMap, defaultIfEmpty, filter, map, Observable, of, shareReplay, switchMap, take, timer} from "rxjs";
import {parseState, ReadingRequest, ReadingState} from "./reading";

/** A run takes about ten seconds; the page asks how it is going this often, and for this long at most (three minutes). */
export const POLL_MS = 2000;
export const MAX_POLLS = 90;

/**
 * Asks the Claude Code on this computer to read the news about a fall, through the dev server's /claude route
 * (proxy.conf.js, tools/claude/reader-routes.js). Like the store, it never fails loudly: where there is no Claude
 * Code, or the app was started before this existed, the page simply does not offer it.
 */
@Injectable({providedIn: 'root'})
export class ReadingService {
  private installed?: Observable<boolean>;

  constructor(private http: HttpClient) {
  }

  /** Whether Claude Code can be asked here. Looked up once for the whole page. */
  available(): Observable<boolean> {
    return this.installed ??= this.http.get<any>('/claude/status').pipe(
      map(body => !!body && body.store === 'watchlist' && body.claude === true),
      catchError(() => of(false)),
      shareReplay(1),
    );
  }

  /** What is kept for a stock, or going on for it. Opening a stock's details must never show an error: "none" then. */
  state(symbol: string): Observable<ReadingState> {
    return this.http.get<unknown>(`/claude/readings/${encodeURIComponent(symbol)}`).pipe(
      map(parseState),
      catchError(() => of<ReadingState>({state: 'none'})),
    );
  }

  /** Asks for a reading: emits "reading" once it was started, then how it ended. Anything else it emits is the end. */
  read(request: ReadingRequest): Observable<ReadingState> {
    return this.http.post<unknown>('/claude/readings', request).pipe(
      map(parseState),
      // "Busy" and "not installed" arrive as errors that carry the server's answer.
      catchError((error: HttpErrorResponse) => of(parseState(error.error))),
      switchMap(first => first.state === 'reading' ? concat(of(first), this.follow(request.symbol)) : of(first)),
    );
  }

  /** Waits for a run that is going on and emits, once, how it ended. */
  follow(symbol: string): Observable<ReadingState> {
    return timer(POLL_MS, POLL_MS).pipe(
      take(MAX_POLLS),
      concatMap(() => this.state(symbol)),
      filter(state => state.state !== 'reading'),
      take(1),
      // Nothing kept and nothing going on: the run was lost (the app was restarted meanwhile).
      map((state): ReadingState => state.state === 'none' ? {state: 'failed', reason: 'failed'} : state),
      defaultIfEmpty<ReadingState, ReadingState>({state: 'failed', reason: 'timeout'}),
    );
  }
}
