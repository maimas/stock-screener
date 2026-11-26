import {BehaviorSubject, Observable, of, Subject} from "rxjs";
import {parseViews, ViewRequest, ViewsState} from "../claude-view";
import {ViewStep} from "../claude-view.service";

/** Stands in for the views of Claude Code in tests: what is known, what was asked about, and the steps a test sends. */
export class FakeClaudeViews {
  installed = true;
  started = 0;
  asked: ViewRequest[][] = [];
  steps = new Subject<ViewStep>();
  readonly state$ = new BehaviorSubject<ViewsState>({views: {}, history: {}, failed: {}});

  available(): Observable<boolean> {
    return of(this.installed);
  }

  start(): void {
    this.started++;
  }

  askAbout(list: ViewRequest[]): Observable<ViewStep> {
    this.asked.push(list);
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
