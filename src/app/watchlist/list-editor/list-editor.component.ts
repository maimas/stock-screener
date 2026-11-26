import {Component, ElementRef, EventEmitter, Input, OnChanges, Optional, Output, SimpleChanges} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {MatButtonModule} from "@angular/material/button";
import {WatchlistDef} from "../watchlists";

/**
 * Everything that can be changed about one list, in one place under its heading: its name, its place on the
 * page, the stocks in it, and deleting it. The page checks a new symbol with the data source before adding it.
 */
@Component({
  selector: "app-list-editor",
  standalone: true,
  imports: [NgIf, NgForOf, FormsModule, MatButtonModule],
  templateUrl: "./list-editor.component.html",
  styleUrls: ["./list-editor.component.scss"]
})
export class ListEditorComponent implements OnChanges {
  @Input() list!: WatchlistDef;
  /** First or last on the page: it cannot move further that way. */
  @Input() first = false;
  @Input() last = false;
  /** A symbol typed here is being checked with the data source. */
  @Input() checking = false;
  /** Why the last symbol typed was not added. */
  @Input() problem = '';

  @Output() addSymbol = new EventEmitter<string>();
  @Output() removeSymbol = new EventEmitter<string>();
  @Output() rename = new EventEmitter<string>();
  @Output() move = new EventEmitter<-1 | 1>();
  @Output() removeList = new EventEmitter<void>();

  /** Not there when a test makes the editor by hand; the keyboard is then left where it is. */
  constructor(@Optional() private readonly host?: ElementRef<HTMLElement>) {
  }

  /** "Delete list" was pressed: the question stands in its place until it is answered. */
  asking = false;

  /** Opens the question, with the keyboard on the answer that keeps the list. */
  ask(): void {
    this.asking = true;
    setTimeout(() => this.host?.nativeElement.querySelector<HTMLElement>('.ask .keep')?.focus());
  }
  @Output() done = new EventEmitter<void>();

  title = '';
  symbol = '';

  ngOnChanges(changes: SimpleChanges): void {
    const list = changes['list'];
    if (list) {
      const before: WatchlistDef | undefined = list.previousValue;
      if (before?.id !== this.list.id || before.title !== this.list.title) {
        this.title = this.list.title;
      }
      // The symbol went in: clear the field for the next one. (It stays when the add was refused, to be corrected.)
      if (before && before.id === this.list.id && this.list.symbols.length > before.symbols.length) {
        this.symbol = '';
      }
    }
  }

  get canRename(): boolean {
    const title = this.title.trim();
    return !!title && title !== this.list.title;
  }

  submitTitle(): void {
    if (this.canRename) {
      this.rename.emit(this.title);
    }
  }

  submitSymbol(): void {
    if (this.symbol.trim() && !this.checking) {
      this.addSymbol.emit(this.symbol);
    }
  }

  trackBySymbol(_: number, symbol: string): string {
    return symbol;
  }
}
