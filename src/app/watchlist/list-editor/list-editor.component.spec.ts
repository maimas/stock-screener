import {TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {ListEditorComponent} from "./list-editor.component";

// Found by a review of the page: "Delete list" stood a few pixels from "Move up" and "Move down" and deleted the
// list at once, while deleting a portfolio asks first.
describe('ListEditorComponent: deleting the list', () => {
  function shown() {
    TestBed.configureTestingModule({imports: [ListEditorComponent, NoopAnimationsModule]});
    const fixture = TestBed.createComponent(ListEditorComponent);
    Object.assign(fixture.componentInstance, {list: {id: 'l1', title: 'Tools', symbols: ['ACME', 'ZED']}, first: true, last: false});
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const press = (label: string) => {
      (Array.from(el.querySelectorAll('button')).find(it => it.textContent?.trim() === label) as HTMLButtonElement).click();
      fixture.detectChanges();
    };
    const removed: number[] = [];
    fixture.componentInstance.removeList.subscribe(() => removed.push(1));
    return {el, press, removed};
  }

  it('asks in place, naming the list, with the answer that keeps it first', () => {
    const {el, press, removed} = shown();
    press('Delete list');
    expect(removed).withContext('nothing is deleted by the first click').toEqual([]);
    expect(el.querySelector('.ask .question')!.textContent).toBe('Delete the list Tools?');
    expect(Array.from(el.querySelectorAll('.ask button')).map(it => it.textContent?.trim())).toEqual(['Keep it', 'Delete it']);
  });

  it('keeps the list on "Keep it", and puts "Delete list" back', () => {
    const {el, press, removed} = shown();
    press('Delete list');
    press('Keep it');
    expect(removed).toEqual([]);
    expect(el.querySelector('.ask')).toBeNull();
    expect(Array.from(el.querySelectorAll('button')).some(it => it.textContent?.trim() === 'Delete list')).toBeTrue();
  });

  it('deletes it on "Delete it"', () => {
    const {press, removed} = shown();
    press('Delete list');
    press('Delete it');
    expect(removed).toEqual([1]);
  });
});
