import {BehaviorSubject, Observable, of, Subject} from "rxjs";
import {Stock} from "../../api/microsoft-money.service";
import {GroupRequest, parseViews, ViewRequest, ViewsState} from "../claude-view";
import {ViewStep} from "../claude-view.service";

/** Stands in for the views of Claude Code in tests: what is known, what was asked about, and the steps a test sends. */
export class FakeClaudeViews {
  installed = true;
  started = 0;
  asked: ViewRequest[][] = [];
  /** The groups that went with each list asked about. */
  groups: GroupRequest[][] = [];
  /** The stocks of the reader's lists other than the one under test. */
  elsewhere: Stock[] = [];
  private lists = new Map<object, () => Stock[]>();
  steps = new Subject<ViewStep>();
  readonly state$ = new BehaviorSubject<ViewsState>({views: {}, history: {}, failed: {}});

  available(): Observable<boolean> {
    return of(this.installed);
  }

  start(): void {
    this.started++;
  }

  register(owner: object, stocks: () => Stock[]): void {
    this.lists.set(owner, stocks);
  }

  unregister(owner: object): void {
    this.lists.delete(owner);
  }

  get registered(): number {
    return this.lists.size;
  }

  listed(): Stock[] {
    return [...[...this.lists.values()].flatMap(stocks => stocks()), ...this.elsewhere];
  }

  askAbout(list: ViewRequest[], groups: GroupRequest[] = []): Observable<ViewStep> {
    this.asked.push(list);
    this.groups.push(groups);
    return this.steps;
  }

  /** What the server would say, as the page would know it. */
  knows(body: object): void {
    this.state$.next(parseViews(body));
  }
}

/** A view as the server keeps it. */
export function keptView(word: string, short = 'Results due next week', why = 'It reports its results next week.'): object {
  return {view: word, short, why, sources: [], asked: '2026-11-14T15:00:00.000Z'};
}
