import {TestBed} from "@angular/core/testing";
import {partsOf, SaysComponent} from "./says.component";

describe('partsOf: the amounts in a sentence that must not be split between two lines', () => {
  // A browser may end a line between a sign and the dollar sign after it: "... at once: −" and then "$2,583" on
  // the next line, where the loss reads as a gain.
  it('sets a signed dollar amount apart, whichever sign it has', () => {
    expect(partsOf('If the bad case hit: −$2,583, 6.5% of this portfolio.')).toEqual([
      {text: 'If the bad case hit: ', keep: false}, {text: '−$2,583', keep: true}, {text: ', 6.5% of this portfolio.', keep: false},
    ]);
    expect(partsOf('+$80 (+4.0%) and -$1,250.75').filter(part => part.keep).map(part => part.text)).toEqual(['+$80', '-$1,250.75']);
  });

  it('leaves alone what cannot be split that way: a percentage, an amount without a sign', () => {
    expect(partsOf('Worth $1,800, +4.0% since then.')).toEqual([{text: 'Worth $1,800, +4.0% since then.', keep: false}]);
    expect(partsOf('')).toEqual([]);
  });

  it('keeps every character of the sentence, in order', () => {
    const sentence = 'Added to your loss so far, that is −$3,283 (−46.9%) since bought; a good one +$4,655.';
    expect(partsOf(sentence).map(part => part.text).join('')).toBe(sentence);
  });
});

describe('SaysComponent: a sentence on the page, its signed amounts kept whole', () => {
  it('shows the sentence as it is given, with each signed amount in an element that does not wrap', () => {
    TestBed.configureTestingModule({imports: [SaysComponent]});
    const fixture = TestBed.createComponent(SaysComponent);
    fixture.componentRef.setInput('text', 'If the good case did: +$5,355, which would be +$4,655 (+66.5%) since bought.');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toBe('If the good case did: +$5,355, which would be +$4,655 (+66.5%) since bought.');
    expect(Array.from(el.querySelectorAll('.keep')).map(it => it.textContent)).toEqual(['+$5,355', '+$4,655']);
  });
});
