import {Injectable} from "@angular/core";
import {Observable, Subject} from "rxjs";

/** Where the explanations the reader opened are kept in this browser: a list of their keys. */
export const MORE_STORAGE_KEY = 'explanations.open';

/**
 * Which explanations the reader has opened. An explanation on the page shows its first sentence; "more" opens the
 * rest in place, and the page remembers it (the owner's choice: the page was correct and careful, and had to be
 * read at length before it could be taken in). Kept in this browser, like the choice of columns and the fold:
 * an explanation opened once stays open on the next visit, and one that is the same under every stock is open
 * under every stock.
 */
@Injectable({providedIn: 'root'})
export class MoreService {
  private readonly opened = new Set<string>(kept());
  private readonly changes = new Subject<void>();
  /** Fires after an explanation was opened or closed. */
  readonly changed: Observable<void> = this.changes.asObservable();

  isOpen(key: string): boolean {
    return this.opened.has(key);
  }

  toggle(key: string): void {
    if (!this.opened.delete(key)) {
      this.opened.add(key);
    }
    try {
      localStorage.setItem(MORE_STORAGE_KEY, JSON.stringify([...this.opened].sort()));
    } catch {
      // A browser that keeps nothing: the choice lasts as long as the page.
    }
    this.changes.next();
  }
}

function kept(): string[] {
  try {
    const keys = JSON.parse(localStorage.getItem(MORE_STORAGE_KEY) ?? '[]');
    return Array.isArray(keys) ? keys.filter((it): it is string => typeof it === 'string') : [];
  } catch {
    return [];
  }
}
