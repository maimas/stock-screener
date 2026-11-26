import {Injectable} from "@angular/core";
import {HttpClient, HttpErrorResponse} from "@angular/common/http";
import {catchError, concat, concatMap, map, Observable, of, switchMap, take, takeWhile, timer} from "rxjs";
import {parseViews, ViewRequest, ViewsState} from "./claude-view";
import {POLL_MS, ReadingService} from "./reading.service";

/** A list of ten stocks takes about five minutes; the page asks how it is going for at most twenty. */
export const MAX_VIEW_POLLS = 600;

/** Why a list was not taken: Claude is busy with another list, cannot be reached, or the server did not take it. */
export type ViewRefusal = { refused: 'busy' | 'not-installed' | 'failed' };

/** One step of asking about a list: where things stand, or why the list was not taken. */
export type ViewStep = ViewsState | ViewRefusal;

export function isRefusal(step: ViewStep): step is ViewRefusal {
  return 'refused' in step;
}

const STORE = 'watchlist';
const NOTHING: ViewsState = {views: {}, history: {}, failed: {}};

/**
 * Asks the Claude Code on this computer for its view of the stocks of a list, through the app's own server
 * (tools/claude/view-routes.js). The server asks stock by stock and goes on when the page is closed; the page asks
 * every two seconds where things stand, so rows fill in as their answers arrive. Like the store and the readings, it
 * never fails loudly: where Claude Code cannot be reached the page does not offer the button.
 */
@Injectable({providedIn: 'root'})
export class ClaudeViewService {
  constructor(private http: HttpClient, private readings: ReadingService) {
  }

  /** Whether Claude Code can be asked here: the same look-up, made once, as for the readings. */
  available(): Observable<boolean> {
    return this.readings.available();
  }

  /** The views that are kept, which list is being asked about, and which stocks got no answer. */
  views(): Observable<ViewsState> {
    return this.http.get<unknown>('/claude/views').pipe(
      map(parseViews),
      catchError(() => of<ViewsState>({...NOTHING})),
    );
  }

  /**
   * Asks about a list. Emits where things stand as soon as the list was taken, then again every two seconds until
   * the last stock is through; or, once, why the list was not taken.
   */
  ask(list: ViewRequest[]): Observable<ViewStep> {
    return this.http.post<unknown>('/claude/views', {list}).pipe(
      map((body): ViewStep => {
        const it = body as any;
        const taken = !!it && typeof it === 'object' && it.store === STORE && it.state === 'asking' ? parseViews(it) : undefined;
        return taken?.queue ? taken : {refused: 'failed'};
      }),
      // "Busy" and "not installed" arrive as errors that carry the server's answer.
      catchError((error: HttpErrorResponse) => {
        const said = error.error as any;
        const reason = said?.state === 'busy' ? 'busy' : said?.reason === 'not-installed' ? 'not-installed' : 'failed';
        return of<ViewStep>({refused: reason});
      }),
      switchMap(first => isRefusal(first) ? of(first) : concat(of(first), this.follow())),
    );
  }

  /** Follows the list being asked about: where things stand every two seconds, ending with how it ended. */
  follow(): Observable<ViewsState> {
    return timer(POLL_MS, POLL_MS).pipe(
      take(MAX_VIEW_POLLS),
      concatMap(() => this.views()),
      takeWhile(state => !!state.queue, true),
    );
  }
}
