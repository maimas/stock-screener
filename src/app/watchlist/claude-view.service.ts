import {Injectable} from "@angular/core";
import {HttpClient, HttpErrorResponse} from "@angular/common/http";
import {
  BehaviorSubject, catchError, concat, concatMap, filter, map, Observable, of, scan, shareReplay, Subscription, switchMap, take, takeWhile, tap, timeout,
  timer,
} from "rxjs";
import {MicrosoftMoneyService, Stock} from "../api/microsoft-money.service";
import {FactsContext, GroupRequest, localDay, parseViews, ViewRequest, ViewsState} from "./claude-view";
import {loadLog} from "./snapshot-log";
import {NO_GROUPS, TiedGroups} from "./tied-groups";
import {POLL_MS, ReadingService} from "./reading.service";

/**
 * A list of ten stocks usually takes about five minutes, and can take three minutes a stock and one more run for each
 * of its groups; the page asks how it is going for at most fifty.
 */
export const MAX_VIEW_POLLS = 1500;
/** As long as a press waits for the state of the market before it goes without it. */
export const MARKET_WAIT_MS = 5000;
/** As many polls in a row may go unanswered (the app restarting, the database away for a moment) before the page stops asking: half a minute. */
export const MAX_FAILED_POLLS = 15;

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
 *
 * What is known is kept here for every part of the page, and a list is followed here too, not by the button that was
 * pressed: the rows go on filling in whatever becomes of that button. An answer that does not come (the app is
 * restarting, the database is away for a moment) changes nothing that is known.
 */
@Injectable({providedIn: 'root'})
export class ClaudeViewService {
  /**
   * What the server last said, kept for every part of the page that shows it (the column's cells, the buttons above
   * the lists): a row then fills in everywhere at once. Nothing until `start` or `askAbout`.
   */
  readonly state$ = new BehaviorSubject<ViewsState>({...NOTHING});
  private started = false;
  private following?: Subscription;
  /** The stocks of each of the reader's own lists, as the list's button names them: never the stocks held outside every list. */
  private readonly lists = new Map<object, () => Stock[]>();
  /** Which stocks of the page move together, as the lists' buttons were last told. */
  private tiedNow: TiedGroups = NO_GROUPS;
  private letters = new Map<string, string>();

  constructor(private http: HttpClient, private readings: ReadingService, private money: MicrosoftMoneyService) {
  }

  /**
   * Loads what is kept, once, however many parts of the page ask for it. What is kept is in the database and needs
   * no Claude Code to be read, so it is shown also where Claude Code cannot be reached right now. A list that is
   * being asked about (the page was opened again meanwhile) goes on being followed.
   */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.lookAgain();
  }

  /**
   * Asks about a list. The one who asked is told once: that the list was taken, or why not (theirs to say; it
   * changes nothing that is known). From then on the rows are told through `state$`.
   */
  askAbout(list: ViewRequest[], groups: GroupRequest[] = []): Observable<ViewStep> {
    const asked = this.post(list, groups).pipe(
      tap(step => {
        if (!isRefusal(step)) {
          // The answer that the list was taken carries no views: the ones already known stay in their rows.
          this.state$.next({...this.state$.value, queue: step.queue});
          this.followOn();
        } else if (step.refused === 'busy') {
          // Something is being asked about that this page does not know of (another window, or a press whose answer
          // was lost): its rows are followed too.
          this.lookAgain();
        }
      }),
      shareReplay(1),
    );
    // The request is the service's own: its answer is taken in, and the list followed, whatever becomes of the
    // part of the page that asked (a stock's details can be closed before the server has answered).
    asked.subscribe();
    return asked;
  }

  /**
   * A list's button says which stocks its list has, for as long as it is on the page. Only stocks named this way are
   * ever sent to be compared with others: the stocks held outside every list have no button, so they are not among them.
   */
  register(owner: object, stocks: () => Stock[]): void {
    this.lists.set(owner, stocks);
  }

  unregister(owner: object): void {
    this.lists.delete(owner);
  }

  /** The page's groups of stocks that move together: a list's button passes them on, for the part that asks about one stock. */
  setTied(tied: TiedGroups): void {
    if (tied !== this.tiedNow) {
      this.tiedNow = tied;
      this.letters = new Map(tied.groups.flatMap(group => group.symbols.map(symbol => [symbol, group.letter] as const)));
    }
  }

  tied(): TiedGroups {
    return this.tiedNow;
  }

  /** The letter the stock's group has on the page today; '' for a stock in no group. */
  letterOf(symbol: string): string {
    return this.letters.get(symbol) ?? '';
  }

  /** Every stock of the reader's own lists, each once. */
  listed(): Stock[] {
    const bySymbol = new Map<string, Stock>();
    this.lists.forEach(stocks => stocks().forEach(stock => {
      const symbol = stock.quote?.symbol;
      if (symbol && !bySymbol.has(symbol)) {
        bySymbol.set(symbol, stock);
      }
    }));
    return [...bySymbol.values()];
  }

  /** What the page knows beside a stock, for its figures: the daily log, the day, the state of the market. */
  context(): Observable<FactsContext> {
    const known = (): FactsContext => ({log: loadLog(), today: localDay(new Date())});
    return this.money.getMarket().pipe(
      timeout(MARKET_WAIT_MS),
      map(market => ({...known(), market})),
      catchError(() => of<FactsContext>({...known(), market: {}})),
    );
  }

  /** Whether Claude Code can be asked here: the same look-up, made once, as for the readings. */
  available(): Observable<boolean> {
    return this.readings.available();
  }

  /** The views that are kept, which list is being asked about, and which stocks got no answer. Nothing when the server does not answer. */
  views(): Observable<ViewsState> {
    return this.look().pipe(map(state => state ?? {...NOTHING}));
  }

  /**
   * Asks about a list and follows it. Emits where things stand as soon as the list was taken, then again every two
   * seconds until the last stock is through; or, once, why the list was not taken.
   */
  ask(list: ViewRequest[]): Observable<ViewStep> {
    return this.post(list, []).pipe(
      switchMap(first => isRefusal(first) ? of(first) : concat(of(first), this.follow())),
    );
  }

  /**
   * Follows the list being asked about: where things stand every two seconds, ending with how it ended. A poll that
   * is not answered is passed over; after half a minute without an answer, or twenty minutes in all, it gives up.
   */
  follow(): Observable<ViewsState> {
    return timer(POLL_MS, POLL_MS).pipe(
      take(MAX_VIEW_POLLS),
      concatMap(() => this.look()),
      scan((so, state) => ({unanswered: state ? 0 : so.unanswered + 1, state}), {unanswered: 0, state: undefined as ViewsState | undefined}),
      takeWhile(so => so.unanswered < MAX_FAILED_POLLS),
      map(so => so.state),
      filter((state): state is ViewsState => !!state),
      takeWhile(state => !!state.queue, true),
    );
  }

  /** What the server says, or nothing when it does not answer or something else answers in its place. */
  private look(): Observable<ViewsState | undefined> {
    return this.http.get<unknown>('/claude/views').pipe(
      map(body => (body as any)?.store === STORE ? parseViews(body) : undefined),
      catchError(() => of(undefined)),
    );
  }

  /** Takes in what the server says now, and follows a list that is being asked about. */
  private lookAgain(): void {
    this.look().subscribe(state => {
      if (state) {
        this.state$.next(state);
        if (state.queue) {
          this.followOn();
        }
      }
    });
  }

  /** Follows the list being asked about into `state$`: one following at a time, whoever started it. */
  private followOn(): void {
    if (this.following && !this.following.closed) {
      return;
    }
    this.following = this.follow().subscribe({
      next: state => this.state$.next(state),
      complete: () => {
        // The end of the list was not seen (twenty minutes, or a server that stayed silent): nobody is told
        // "Asking Claude…" for ever. If the list is still running, the next press says "busy" and it is followed again.
        const {queue, ...known} = this.state$.value;
        if (queue) {
          this.state$.next(known);
        }
      },
    });
  }

  private post(list: ViewRequest[], groups: GroupRequest[]): Observable<ViewStep> {
    return this.http.post<unknown>('/claude/views', groups.length ? {list, groups} : {list}).pipe(
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
    );
  }
}
