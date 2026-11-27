import {TestBed} from "@angular/core/testing";
import {FigTextComponent, figuresOf} from "./fig-text.component";

// The owner, 2026-11-26, of a stock's details: "clean, clear, easy to read ... important info needs to catch the
// eye". The figures stood inside phrases at the weight of the words around them; the eye had nothing to land on.
describe('figuresOf (the figures of a phrase, set apart from its words)', () => {
  const figures = (text: string) => figuresOf(text).filter(part => part.fig).map(part => part.text);

  it('finds percentages, signed or not, with their sign', () => {
    expect(figures('expected profit per share +21.1%, sales +44.7% on a year ago')).toEqual(['+21.1%', '+44.7%']);
    expect(figures('38.3% below its highest price of the past year')).toEqual(['38.3%']);
    expect(figures('Biggest one-day fall since the high: -17.3% on Nov 5.')).toEqual(['-17.3%']);
    expect(figures('down −4.2% today')).toEqual(['−4.2%']);
  });

  it('finds "4 in 10" and dollar amounts, and leaves counts of days, weeks and dates in the words', () => {
    expect(figures('4 in 10 such stocks, within 13 weeks of the mark')).toEqual(['4 in 10']);
    expect(figures('worth $12,400.50 · −$2,583 since')).toEqual(['$12,400.50', '−$2,583']);
    expect(figures('today, for the first time')).toEqual([]);
    expect(figures('on Nov 20')).toEqual([]);
  });

  it('keeps every character, in order', () => {
    const text = '69% a year · between calm and volatile';
    expect(figuresOf(text).map(part => part.text).join('')).toBe(text);
    expect(figuresOf('').length).toBe(0);
  });
});

describe('FigTextComponent', () => {
  it('shows the text unchanged, each figure in a strong element that does not wrap', () => {
    TestBed.configureTestingModule({imports: [FigTextComponent]});
    const fixture = TestBed.createComponent(FigTextComponent);
    fixture.componentRef.setInput('text', 'sales +44.7% on a year ago');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toBe('sales +44.7% on a year ago');
    expect(Array.from(el.querySelectorAll('b.fig')).map(it => it.textContent)).toEqual(['+44.7%']);
    expect(getComputedStyle(el.querySelector('b.fig')!).whiteSpace).toBe('nowrap');
  });
});
