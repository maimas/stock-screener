import {Observable, of, Subject} from "rxjs";
import {ReadingRequest, ReadingState} from "../reading";

/** Stands in for the Claude Code on this computer in tests: what is kept per stock, what was asked, and the answers a test sends. */
export class FakeReadings {
  installed = true;
  kept: Record<string, ReadingState> = {};
  asked: ReadingRequest[] = [];
  followed: string[] = [];
  answers = new Subject<ReadingState>();

  available(): Observable<boolean> {
    return of(this.installed);
  }

  state(symbol: string): Observable<ReadingState> {
    return of(this.kept[symbol] ?? {state: 'none'});
  }

  read(request: ReadingRequest): Observable<ReadingState> {
    this.asked.push(request);
    return this.answers;
  }

  follow(symbol: string): Observable<ReadingState> {
    this.followed.push(symbol);
    return this.answers;
  }
}
