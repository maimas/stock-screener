import {Component} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {By} from "@angular/platform-browser";
import {dropFacts, headlinesLine, resultsSoonLine, SignalDetailComponent, verdictInputs} from "./signal-detail.component";
import {computeSignal} from "../signal";
import {DropNews} from "../drop-news";
import {Reading} from "../reading";
import {ReadingService} from "../reading.service";
import {FakeReadings} from "../testing/fake-readings";
import {flatCloses, makeStock, NOW, reportedQuarters} from "../testing/fixtures";

/** Sales +20% on a year ago, profit per share flat; `below` % under its highest price of the past year. */
function signalOf(below: number, high52: number | undefined = 100) {
  const stock = makeStock({
    price: 100 - below, high52,
    quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 100 - below),
  });
  return computeSignal(stock, NOW)!;
}

describe('verdictInputs (the two facts a mark rests on, in everyday words)', () => {
  it('says how the business is growing and how far the price has dropped, with what DIP BUY needs', () => {
    expect(verdictInputs(signalOf(20))).toEqual([
      'Growing: expected profit per share 0.0%, sales +20.0% on a year ago.',
      '20.0% below its highest price of the past year (DIP BUY needs 15% or more).',
    ]);
  });

  it('says so when the business is not growing enough', () => {
    const stock = makeStock({
      price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 100}), closes: flatCloses(250, 80),
    });
    expect(verdictInputs(computeSignal(stock, NOW)!)[0]).toBe('Not growing: expected profit per share 0.0%, sales 0.0% on a year ago.');
  });
});

describe('"Why it dropped" (the fall on the chart, the headlines of that week, and what Claude Code read)', () => {
  // Daily prices are stamped at midnight in New York, kept as UTC: the fall of Nov 3.
  const fall = {date: new Date('2026-11-03T00:00:00.000Z'), changePercent: -12.04};
  const headline = {title: 'Example Corp cuts its forecast', source: 'Example News', link: 'https://news.example.com/cut', date: new Date('2026-11-03T15:00:00.000Z')};
  const news: DropNews = {drop: fall, headlines: [headline]};

  describe('the sentences', () => {
    it('state the biggest one-day fall since the high', () => {
      expect(dropFacts(news)).toBe('Biggest one-day fall since the high: -12.0% on Nov 3.');
    });

    it('say so when no single day stands out', () => {
      expect(dropFacts({headlines: []})).toBe('No single day fell 4%+ since the high: a gradual slide rather than one news event.');
    });

    it('say nothing while the news has not been looked up', () => {
      expect(dropFacts(undefined)).toBe('');
      expect(headlinesLine(undefined)).toBe('');
    });

    it('lead into the headlines, or say that none were found', () => {
      expect(headlinesLine(news)).toBe('Headlines from that week:');
      expect(headlinesLine({drop: fall, headlines: []})).toBe('No headlines found for that week.');
      expect(headlinesLine({headlines: []})).toBe('');
    });
  });

  describe('on the page', () => {
    const reading: Reading = {
      day: '2026-11-03', what: 'The company lowered its sales forecast for next quarter.', about: 'company', readAt: '2026-11-22T12:00:00.000Z',
      sources: [{title: 'Example Corp lowers its sales forecast', url: 'https://news.example.com/forecast'}],
    };
    let readings: FakeReadings;

    beforeEach(() => {
      readings = new FakeReadings();
      TestBed.configureTestingModule({imports: [SignalDetailComponent], providers: [{provide: ReadingService, useValue: readings}]});
    });

    /** The lines of the "Why it dropped" part of a stock's details, top to bottom. */
    function whyItDropped(shown: DropNews = news): { lines: string[], buttons: string[] } {
      const fixture = TestBed.createComponent(SignalDetailComponent);
      fixture.componentRef.setInput('stock', makeStock({
        symbol: 'ABCD', price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}), closes: flatCloses(250, 80),
      }));
      fixture.componentRef.setInput('news', shown);
      fixture.componentRef.setInput('today', '2026-11-21');
      fixture.detectChanges();
      const section = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('section'))
        .find(it => it.querySelector('h4')?.textContent === 'Why it dropped')!;
      const clean = (it: Element) => it.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return {
        lines: Array.from(section.querySelectorAll('p, li')).map(clean),
        buttons: Array.from(section.querySelectorAll('button')).map(clean),
      };
    }

    it('lists the headlines of that week and offers to have the news read', () => {
      expect(whyItDropped()).toEqual({
        lines: [
          'Biggest one-day fall since the high: -12.0% on Nov 3.',
          'Headlines from that week:',
          'Example Corp cuts its forecast Example News, Nov 3',
          'A one-off scare and a change in the business look the same on a chart. The headlines are there to tell them apart.',
        ],
        buttons: ['Read it for me'],
      });
      expect(readings.asked).toEqual([]);
    });

    it('asks about the stock by its name and symbol', () => {
      const fixture = TestBed.createComponent(SignalDetailComponent);
      fixture.componentRef.setInput('stock', makeStock({symbol: 'ABCD', price: 80, high52: 100}));
      fixture.componentRef.setInput('news', news);
      fixture.detectChanges();
      (Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(it => it.textContent?.trim() === 'Read it for me') as HTMLButtonElement).click();
      expect(readings.asked).toEqual([{symbol: 'ABCD', name: 'ABCD Inc', day: '2026-11-03', percent: 12.04}]);
    });

    it('shows what Claude read in place of the headlines once the news was read', () => {
      readings.kept['ABCD'] = {state: 'done', reading};
      expect(whyItDropped()).toEqual({
        lines: [
          'Biggest one-day fall since the high: -12.0% on Nov 3.',
          'The company lowered its sales forecast for next quarter. This is about the company itself, not the whole market.',
          'Example Corp lowers its sales forecast news.example.com',
          'Read by Claude on Nov 22 · not tested · 1 source Read again',
        ],
        buttons: ['Read again'],
      });
    });

    it('offers no reading for a gradual slide, which has no day to read about', () => {
      expect(whyItDropped({headlines: []})).toEqual({
        lines: ['No single day fell 4%+ since the high: a gradual slide rather than one news event.'],
        buttons: [],
      });
    });

    it('is as it was on a computer without Claude Code', () => {
      readings.installed = false;
      expect(whyItDropped().buttons).toEqual([]);
      expect(whyItDropped().lines.length).toBe(4);
    });
  });
});

describe('SignalDetailComponent: more about the stock, outside the app', () => {
  it("links to the stock's page at the data source by name, in a new tab so that the app stays open", () => {
    TestBed.configureTestingModule({imports: [SignalDetailComponent], providers: [{provide: ReadingService, useValue: new FakeReadings()}]});
    const fixture = TestBed.createComponent(SignalDetailComponent);
    fixture.componentRef.setInput('stock', makeStock({symbol: 'ABCD', price: 80, high52: 100}));
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a.more') as HTMLAnchorElement;
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('More about ABCD on MSN Money (opens in a new tab)');
    expect(link.getAttribute('href')).toBe('https://www.msn.com/en-us/money/stockdetails/fi-id-ABCD');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});

describe('SignalDetailComponent: DIP BUY, WATCH and PASS are called a mark, as in the legend', () => {
  /** The headings of a stock's details and the sentence they open with. */
  function shown(spec: Parameters<typeof makeStock>[0], noVerdict: 'fund' | 'too-new' | 'no-data' = 'no-data') {
    TestBed.configureTestingModule({imports: [SignalDetailComponent], providers: [{provide: ReadingService, useValue: new FakeReadings()}]});
    const fixture = TestBed.createComponent(SignalDetailComponent);
    fixture.componentRef.setInput('stock', makeStock(spec));
    fixture.componentRef.setInput('noVerdict', noVerdict);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return {headings: Array.from(el.querySelectorAll('h4')).map(it => it.textContent?.trim()), lead: el.querySelector('.lead')?.textContent?.trim()};
  }

  afterEach(() => TestBed.resetTestingModule());

  // A stock without reported quarters has nothing to judge growth by, so the app gives it no mark.
  it('says "No mark", and why, for a fund, a company too young to judge and one without data', () => {
    expect(shown({symbol: 'ABCD'}, 'fund')).toEqual({
      headings: ['No mark'], lead: "A fund has no profit of its own, so the mark, which rests on a company's growth, does not apply.",
    });
    TestBed.resetTestingModule();
    expect(shown({symbol: 'ABCD'}, 'too-new').lead).toBe(
      'This company is too young for the tested rule, which needs 8 reported quarters and a year of prices. ' +
      'It gets no mark rather than an untested one; the growth figures in the table are context only.');
    TestBed.resetTestingModule();
    expect(shown({symbol: 'ABCD'}, 'no-data').lead).toBe(
      "The history of the company's results is missing or incomplete at the data source, so there is no mark.");
  });

  // The details open under a symbol. They say first which company that is, in words: not everyone knows a symbol.
  it('says first which company this is: its name, then its sector and its industry', () => {
    TestBed.configureTestingModule({imports: [SignalDetailComponent], providers: [{provide: ReadingService, useValue: new FakeReadings()}]});
    const fixture = TestBed.createComponent(SignalDetailComponent);
    fixture.componentRef.setInput('stock', makeStock({symbol: 'ABCD'}));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const company = el.querySelector('.company')!;
    expect(company.textContent?.replace(/\s+/g, ' ').trim()).toBe('ABCD Inc · Technology · Software');
    expect(company.querySelector('.name')?.textContent?.trim()).withContext('the name is set stronger').toBe('ABCD Inc');
    expect(company.compareDocumentPosition(el.querySelector('h4')!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .withContext('before the first section').toBeTruthy();
  });

  it('sets the untested figures apart from the mark, by that name', () => {
    const marked = shown({
      symbol: 'ABCD', price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
      closes: flatCloses(250, 80), medianTarget: 120, recommendationRate: 1.5,
    });
    expect(marked.headings).toContain('Context, not part of the mark');
  });

  it('says in plain words that the company is about to report its results, and what that does to the mark', () => {
    const rest = ': the price may swing, and the report will change the growth numbers this mark rests on.';
    expect(resultsSoonLine(0)).toBe('Reports its results today' + rest);
    expect(resultsSoonLine(1)).toBe('Reports its results tomorrow' + rest);
    expect(resultsSoonLine(6)).toBe('Reports its results in 6 days' + rest);
  });
});

/** A stock's details as the page shows them: with the panels about the reader's own stake handed in. */
@Component({
  standalone: true,
  imports: [SignalDetailComponent],
  template: `
    <app-signal-detail [stock]="stock" [news]="news" today="2026-11-21">
      <div class="panel"><h4>Where it fits</h4></div>
      <div class="panel"><h4>What you own of it</h4></div>
    </app-signal-detail>`,
})
class DetailsWithTheStake {
  stock = makeStock({
    symbol: 'ABCD', price: 80, high52: 100, quarters: reportedQuarters(8, {baseRevenue: 100, latestRevenue: 120}),
    closes: flatCloses(250, 80), medianTarget: 120, recommendationRate: 1.5,
  });
  news: DropNews = {drop: {date: new Date('2026-11-03T00:00:00.000Z'), changePercent: -12.04}, headlines: []};
}

describe('SignalDetailComponent: what is about this stock, what is about you, and what holds for every such stock', () => {
  // About two thirds of the words under a DIP BUY are the same for every DIP BUY. They used to stand between the
  // few sentences that are about this company and the reader could not tell the two apart.
  it('groups the sections in that order, the rule last', () => {
    TestBed.configureTestingModule({imports: [DetailsWithTheStake], providers: [{provide: ReadingService, useValue: new FakeReadings()}]});
    const fixture = TestBed.createComponent(DetailsWithTheStake);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const groups = Array.from(el.querySelectorAll('.sections > .group')).map(group =>
      [group.className.replace('group', '').trim(), Array.from(group.querySelectorAll('h4')).map(it => it.textContent?.trim())]);
    // What is risky about this one stock (how much its price swings, results due soon) stood among the sentences
    // that are the same under every stock, set quiet with them. It is about this stock, so it stands with it.
    expect(groups).toEqual([
      ['about-stock', ['Why DIP BUY', 'Risk of this stock', 'Why it dropped', 'Context, not part of the mark']],
      ['your-stake', ['Where it fits', 'What you own of it']],
      ['the-rule', ['What the tests say', 'After you buy']],
    ]);
    const risk = Array.from(el.querySelectorAll('.about-stock section')).find(it => it.querySelector('h4')?.textContent === 'Risk of this stock')!;
    expect(risk.querySelectorAll('li').length).withContext('its own lines only').toBe(fixture.debugElement.query(By.directive(SignalDetailComponent)).componentInstance.risks.length);
    expect(el.querySelector('.the-rule .same')?.textContent?.trim()).toBe('The same under every stock marked DIP BUY.');
  });

  it('has no group for the rule where no rule applies: a stock without a mark', () => {
    TestBed.configureTestingModule({imports: [SignalDetailComponent], providers: [{provide: ReadingService, useValue: new FakeReadings()}]});
    const fixture = TestBed.createComponent(SignalDetailComponent);
    fixture.componentRef.setInput('stock', makeStock({symbol: 'ABCD'}));
    fixture.componentRef.setInput('noVerdict', 'fund');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.the-rule')).toBeNull();
  });
});

describe('SignalDetailComponent: the way back', () => {
  function details(back: string) {
    TestBed.configureTestingModule({imports: [SignalDetailComponent], providers: [{provide: ReadingService, useValue: new FakeReadings()}]});
    const fixture = TestBed.createComponent(SignalDetailComponent);
    fixture.componentRef.setInput('stock', makeStock({symbol: 'ABCD'}));
    fixture.componentRef.setInput('back', back);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  // A stock looked up from "Could add" opens in the other view; without a way back each look costs the reader
  // their place.
  it('offers the way back it is given, beside the company\'s name, and says when it is taken', () => {
    const fixture = details('Back to your plan');
    let taken = 0;
    fixture.componentInstance.goBack.subscribe(() => taken++);
    const link = (fixture.nativeElement as HTMLElement).querySelector('.head button.back') as HTMLButtonElement;
    expect(link.textContent?.trim()).toBe('Back to your plan');
    link.click();
    expect(taken).toBe(1);
  });

  it('offers none where the details were opened in their own view', () => {
    expect((details('').nativeElement as HTMLElement).querySelector('button.back')).toBeNull();
  });
});

describe('SignalDetailComponent: closing the details from where the reading ends', () => {
  afterEach(() => TestBed.resetTestingModule());

  // The row's own button is at the top of a panel that can be a screen and a half tall.
  it('offers "Close these details" at the foot, also for a stock without a page at the data source', () => {
    TestBed.configureTestingModule({imports: [SignalDetailComponent], providers: [{provide: ReadingService, useValue: new FakeReadings()}]});
    const fixture = TestBed.createComponent(SignalDetailComponent);
    const stock = makeStock({symbol: 'ABCD'});
    fixture.componentRef.setInput('stock', stock);
    fixture.detectChanges();
    let asked = 0;
    fixture.componentInstance.closeDetails.subscribe(() => asked++);
    const foot = (fixture.nativeElement as HTMLElement).querySelector('.outside')!;
    const close = foot.querySelector('button.close') as HTMLButtonElement;
    expect(close.textContent?.trim()).toBe('Close these details');
    expect(foot.querySelector('a.more')).withContext('beside the link out of the app').not.toBeNull();
    close.click();
    expect(asked).toBe(1);

    fixture.componentRef.setInput('stock', {...stock, instrumentId: ''});
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.outside button.close')).not.toBeNull();
  });
});

describe('SignalDetailComponent: the Esc key', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('closes the details while the keyboard is inside them, as "Close these details" does', () => {
    TestBed.configureTestingModule({imports: [SignalDetailComponent], providers: [{provide: ReadingService, useValue: new FakeReadings()}]});
    const fixture = TestBed.createComponent(SignalDetailComponent);
    fixture.componentRef.setInput('stock', makeStock({symbol: 'ABCD'}));
    fixture.detectChanges();
    let asked = 0;
    fixture.componentInstance.closeDetails.subscribe(() => asked++);
    const close = (fixture.nativeElement as HTMLElement).querySelector('button.close') as HTMLButtonElement;
    close.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(asked).toBe(1);
  });
});
