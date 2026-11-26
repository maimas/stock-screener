import {Component} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {AboutComponent} from "./about.component";
import {MORE_STORAGE_KEY, MoreService} from "./more.service";

@Component({
  standalone: true,
  imports: [AboutComponent],
  template: `
    <app-about key="box.about" label="How to read this table">
      <p class="note">A stock whose price swings more gets a smaller size.</p>
      <p class="note">Stocks with the same letter moved closely together.</p>
    </app-about>`,
})
class ABox {
}

/** One control a box for its explanations: the owner found a box of first sentences still too much to read. */
describe('AboutComponent: the explanations of a box behind one control', () => {
  beforeEach(() => localStorage.removeItem(MORE_STORAGE_KEY));
  afterEach(() => {
    localStorage.removeItem(MORE_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  function shown() {
    TestBed.configureTestingModule({imports: [ABox]});
    const fixture = TestBed.createComponent(ABox);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return {fixture, el, button: el.querySelector('button.about-toggle') as HTMLButtonElement, body: el.querySelector('.about-body') as HTMLElement};
  }

  it('shows the control and keeps the sentences out of the way until they are asked for', () => {
    const {button, body} = shown();
    expect(button.textContent?.trim()).toBe('How to read this table');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).withContext('neither the eye nor a screen reader meets them').toBeTrue();
    expect(body.querySelectorAll('p.note').length).withContext('nothing is taken away: they are in the page').toBe(2);
    expect(button.getAttribute('aria-controls')).toBe(body.id);
  });

  it('opens them in place on a click, and closes them on the next', () => {
    const {fixture, button, body} = shown();
    button.click();
    fixture.detectChanges();
    expect([button.getAttribute('aria-expanded'), body.hidden]).toEqual(['true', false]);
    button.click();
    fixture.detectChanges();
    expect([button.getAttribute('aria-expanded'), body.hidden]).toEqual(['false', true]);
  });

  it('remembers what the reader opened, as a single "more" does', () => {
    const first = shown();
    first.button.click();
    first.fixture.detectChanges();
    expect(TestBed.inject(MoreService).isOpen('box.about')).toBeTrue();
    expect(JSON.parse(localStorage.getItem(MORE_STORAGE_KEY) ?? '[]')).toContain('box.about');
  });
});
