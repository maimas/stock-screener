import {Component} from "@angular/core";
import {ComponentFixture, TestBed} from "@angular/core/testing";
import {firstSentence} from "./first-sentence";
import {MoreComponent} from "./more.component";
import {MoreRestDirective} from "./more-rest.directive";
import {MORE_STORAGE_KEY, MoreService} from "./more.service";

// The owner's choice for the page's explanations: each shows its first sentence, "more" opens the rest in place,
// and the page remembers what was opened. Nothing is deleted.
describe('firstSentence (an explanation cut after its first sentence)', () => {
  const LONG = 'A stock whose price swings more gets a smaller size. No size is more than fits your limit, and none depends on your cash.';

  it('cuts after the first full stop that ends a sentence, every character kept', () => {
    const cut = firstSentence(LONG);
    expect(cut.first).toBe('A stock whose price swings more gets a smaller size.');
    expect(cut.first + cut.rest).toBe(LONG);
  });

  it('is not misled by a decimal point, a bracket or a quotation mark at the end of the sentence', () => {
    const figures = 'In tests such stocks gained +9.3% on average (the market: +10.2%). That is no more than the market made over the same weeks, on that list.';
    expect(firstSentence(figures).first).toBe('In tests such stocks gained +9.3% on average (the market: +10.2%).');
    const quoted = 'The column is called "Size." It says how much of the portfolio the stock would be, in dollars and as a share of it.';
    expect(firstSentence(quoted).first).toBe('The column is called "Size."');
  });

  it('takes a question that opens the paragraph as its first sentence, and a lead-in with a colon as part of it', () => {
    const asked = 'Does that make money? On 202 stocks never used before, such stocks gained +9.3% on average over 6 months.';
    expect(firstSentence(asked).first).toBe('Does that make money?');
    const led = 'How many: three or more rather than one. In a separate test three bought in the same month typically ended higher.';
    expect(firstSentence(led).first).toBe('How many: three or more rather than one.');
  });

  it('cuts a very long first sentence at its colon, and leaves a lead-in with a colon alone', () => {
    const long = '"Sector (you own)" and "Moves with yours" say what you already own that is like the stock: its sector with, in brackets, ' +
      'how many of your stocks are in it, and whether its price has moved closely with theirs (0.5 or more, where 0 is not at all and 1 is exactly together). ' +
      'The figures for the past year and the last month show where the pointer rests on that cell.';
    const cut = firstSentence(long);
    expect(cut.first).toBe('"Sector (you own)" and "Moves with yours" say what you already own that is like the stock:');
    expect(cut.first + cut.rest).toBe(long);
    const led = 'How many: ' + 'three or more rather than one, which a separate test on stocks that dropped looked at over a good many years and found steadier, '.repeat(2) +
      'in every period. And a second sentence that is long enough to be worth hiding behind the button.';
    expect(firstSentence(led).first.startsWith('How many: three')).withContext('the colon of a lead-in is no place to cut').toBeTrue();
  });

  it('leaves a single sentence whole, and a second sentence of a few words in sight with the first', () => {
    expect(firstSentence('One sentence only, however long it may be, with a figure like 4.5 in it.')).toEqual(
      {first: 'One sentence only, however long it may be, with a figure like 4.5 in it.', rest: ''});
    expect(firstSentence('Growing, but no such drop yet. Not advice.').rest).toBe('');
    expect(firstSentence('').first).toBe('');
  });
});

describe('MoreComponent and appMoreRest (the first sentence, and "more" for the rest)', () => {
  const NOTE = 'A stock whose price swings more gets a smaller size. No size is more than fits your limit, and none depends on your cash.';

  @Component({
    standalone: true,
    imports: [MoreComponent, MoreRestDirective],
    template: `
      <p class="note"><app-more key="test.note" [text]="note" [group]="group"></app-more></p>
      <p class="second" appMoreRest="test.note">A second paragraph of the same explanation.</p>
      <p class="always" appMoreRest="">Always shown.</p>
      <h3 class="title">For example<app-more key="test.example" what="the worked example"></app-more></h3>
      <ul class="lines" appMoreRest="test.example"><li>a line</li></ul>`,
  })
  class HostComponent {
    note = NOTE;
    group = true;
  }

  beforeEach(() => localStorage.removeItem(MORE_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(MORE_STORAGE_KEY));

  function shown(): { fixture: ComponentFixture<HostComponent>, el: HTMLElement } {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return {fixture, el: fixture.nativeElement as HTMLElement};
  }

  const button = (el: HTMLElement, within: string) => el.querySelector<HTMLButtonElement>(`${within} button.toggle`)!;

  it('shows the first sentence and hides the rest, with all of the text still in the paragraph', () => {
    const {el} = shown();
    expect(el.querySelector('.note')!.textContent).withContext('nothing is deleted, and the button adds no word').toBe(NOTE);
    expect(el.querySelector<HTMLElement>('.note .rest')!.hidden).toBeTrue();
    expect(el.querySelector<HTMLElement>('.second')!.hidden).withContext('a further paragraph of it').toBeTrue();
    expect(el.querySelector<HTMLElement>('.always')!.hidden).toBeFalse();
  });

  it('opens the rest in place on "more", and closes it again on "less"', () => {
    const {fixture, el} = shown();
    const more = button(el, '.note');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    // Found by a review of the page: eleven buttons on one view had one and the same name. Each says what it opens.
    expect(more.getAttribute('aria-label')).toBe('more: the rest of "A stock whose price swings more gets a smaller size."');
    more.click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLElement>('.note .rest')!.hidden).toBeFalse();
    expect(el.querySelector<HTMLElement>('.second')!.hidden).toBeFalse();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.getAttribute('aria-label')).toBe('less: only the start of "A stock whose price swings more gets a smaller size."');
    more.click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLElement>('.second')!.hidden).toBeTrue();
  });

  it('is the button alone after words written in the page, for the elements that belong to them', () => {
    const {fixture, el} = shown();
    expect(el.querySelector('.title')!.textContent).toBe('For example');
    expect(el.querySelector<HTMLElement>('.lines')!.hidden).toBeTrue();
    button(el, '.title').click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLElement>('.lines')!.hidden).toBeFalse();
    expect(el.querySelector<HTMLElement>('.second')!.hidden).withContext('another explanation stays as it was').toBeTrue();
  });

  it('names the button by what was said of it where it stands alone, and shortens a long first sentence', () => {
    const {el} = shown();
    expect(button(el, '.title').getAttribute('aria-label')).toBe('more: the worked example');
    const fixture = TestBed.createComponent(HostComponent);
    Object.assign(fixture.componentInstance, {note: 'A first sentence that goes on and on for a good deal longer than sixty characters before it ends. And a second one that is long enough to be worth hiding behind the button.'});
    fixture.detectChanges();
    expect(button(fixture.nativeElement as HTMLElement, '.note').getAttribute('aria-label'))
      .toBe('more: the rest of "A first sentence that goes on and on for a good deal longer…"');
  });

  it('has no button when there is nothing to open', () => {
    const fixture = TestBed.createComponent(HostComponent);
    Object.assign(fixture.componentInstance, {note: 'One sentence only.', group: false});
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.note button')).toBeNull();
  });

  it('remembers what was opened: it is open when the page is opened again', () => {
    const first = shown();
    button(first.el, '.note').click();
    first.fixture.destroy();
    expect(JSON.parse(localStorage.getItem(MORE_STORAGE_KEY)!)).toEqual(['test.note']);
    TestBed.resetTestingModule();
    const again = shown();
    expect(TestBed.inject(MoreService).isOpen('test.note')).toBeTrue();
    expect(again.el.querySelector<HTMLElement>('.second')!.hidden).toBeFalse();
    expect(again.el.querySelector<HTMLElement>('.lines')!.hidden).toBeTrue();
  });
});
