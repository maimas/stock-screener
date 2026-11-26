import {Component} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {MatTooltip, MatTooltipModule} from "@angular/material/tooltip";
import {By} from "@angular/platform-browser";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {TipOnFocusDirective} from "./tip-on-focus.directive";

@Component({
  standalone: true,
  imports: [MatTooltipModule, TipOnFocusDirective],
  template: `
    <table>
      <thead>
      <tr>
        <th matTooltip="What your shares are worth at today's price." appTipOnFocus><button type="button">Value</button></th>
      </tr>
      </thead>
    </table>`,
})
class HeadingWithAnExplanation {
}

describe('TipOnFocusDirective: an explanation that does not need a pointer', () => {
  function heading() {
    TestBed.configureTestingModule({imports: [NoopAnimationsModule]});
    const fixture = TestBed.createComponent(HeadingWithAnExplanation);
    fixture.detectChanges();
    const cell = fixture.debugElement.query(By.directive(MatTooltip));
    const tip = cell.injector.get(MatTooltip);
    return {fixture, tip, button: cell.nativeElement.querySelector('button') as HTMLButtonElement};
  }

  // A column heading holds a button; the explanation is on the heading. Reaching the button with the Tab key shows it.
  it('shows the explanation when the keyboard focus goes into the element, and hides it when the focus leaves', () => {
    const {fixture, tip, button} = heading();
    const show = spyOn(tip, 'show'), hide = spyOn(tip, 'hide');

    button.dispatchEvent(new FocusEvent('focusin', {bubbles: true}));
    fixture.detectChanges();
    expect(show).toHaveBeenCalledTimes(1);
    expect(hide).not.toHaveBeenCalled();

    button.dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
    fixture.detectChanges();
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
