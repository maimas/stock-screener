import {Component} from "@angular/core";
import {ComponentFixture, TestBed} from "@angular/core/testing";
import {By} from "@angular/platform-browser";
import {MatTooltip} from "@angular/material/tooltip";
import {DropReadingComponent} from "./drop-reading.component";
import {ReadingService} from "../reading.service";
import {Reading, ReadingState} from "../reading";
import {BiggestDrop} from "../drop-news";
import {FakeReadings} from "../testing/fake-readings";
import {ClaudeViewService} from "../claude-view.service";
import {FakeClaudeViews, keptView} from "../testing/fake-claude-views";
import {makeStock} from "../testing/fixtures";

const reading: Reading = {
  day: '2026-11-03', what: 'The company lowered its sales forecast for next quarter.', about: 'company', readAt: '2026-11-22T12:00:00.000Z',
  sources: [
    {title: 'Example Corp lowers its sales forecast', url: 'https://news.example.com/forecast'},
    {title: 'example shares fall after results', url: 'https://www.example.org/markets/results'},
  ],
};

/** A stock's details: the headlines the page found itself are handed to the reading, which shows them until the news was read. */
@Component({
  standalone: true,
  imports: [DropReadingComponent],
  template: `<app-drop-reading [symbol]="symbol" [name]="name" [drop]="drop"><p class="headlines">Headlines from that week</p></app-drop-reading>`,
})
class StockDetails {
  symbol = 'ABCD';
  name = 'Example Corp';
  // Daily prices are stamped at midnight in New York, kept as UTC: the fall of Nov 3.
  drop: BiggestDrop | undefined = {date: new Date('2026-11-03T00:00:00.000Z'), changePercent: -12.04};
}

describe('DropReadingComponent ("Read it for me", under "Why it dropped")', () => {
  let readings: FakeReadings;
  let views: FakeClaudeViews;
  let fixture: ComponentFixture<StockDetails>;
  let el: HTMLElement;

  beforeEach(() => {
    readings = new FakeReadings();
    views = new FakeClaudeViews();
    TestBed.configureTestingModule({
      imports: [StockDetails],
      providers: [{provide: ReadingService, useValue: readings}, {provide: ClaudeViewService, useValue: views}],
    });
  });

  // The owner: "can the read it for me and AI view be combined ?". The AI's view of a stock also reads why it fell
  // (one question, not two), and its button stands a few lines below; so this part offers no reading of its own there.
  describe('for a stock the AI can be asked about', () => {
    beforeEach(() => {
      views.elsewhere = [makeStock({symbol: 'ABCD'})];
    });

    it('offers no reading of its own: the AI\'s view reads the fall too', () => {
      open();
      expect(buttons()).toEqual([]);
      expect(text('.headlines')).withContext('what the page found itself still shows').toBe('Headlines from that week');
    });

    it('still shows what was read, and lets it be read again', () => {
      readings.kept['ABCD'] = {state: 'done', reading};
      open();
      expect(text('.reading')).toContain('The company lowered its sales forecast for next quarter.');
      expect(buttons()).toEqual(['Read again']);
    });

    it('shows what a view found about the fall as soon as the view is there, without the details being opened again', () => {
      open();
      expect(el.querySelector('.reading')).toBeNull();
      readings.kept['ABCD'] = {state: 'done', reading};
      views.knows({views: {ABCD: {'2026-11-22': keptView('WAIT')}}});
      fixture.detectChanges();
      expect(text('.reading')).toContain('The company lowered its sales forecast for next quarter.');
      expect(el.querySelector('.headlines')).withContext('the same news is not on the page twice').toBeNull();
    });
  });

  it('does not ask again for what is kept when a view of another stock arrives', () => {
    open();
    const asked = spyOn(readings, 'state').and.callThrough();
    views.knows({views: {WXYZ: {'2026-11-22': keptView('WAIT')}}});
    fixture.detectChanges();
    expect(asked).not.toHaveBeenCalled();
  });

  const open = () => {
    fixture = TestBed.createComponent(StockDetails);
    fixture.detectChanges();
    el = fixture.nativeElement;
  };
  const answer = (state: ReadingState) => {
    readings.answers.next(state);
    fixture.detectChanges();
  };
  const buttons = () => Array.from(el.querySelectorAll('button')).map(it => it.textContent?.trim());
  const text = (selector: string) => el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const click = (label: string) => {
    Array.from(el.querySelectorAll('button')).find(it => it.textContent?.trim() === label)!.click();
    fixture.detectChanges();
  };

  it('offers to read the news when Claude Code is on this computer and nothing was read yet', () => {
    open();
    expect(buttons()).toEqual(['Read it for me']);
    // The button did not say who reads what: it does where the pointer rests on it or the keyboard reaches it.
    expect(fixture.debugElement.query(By.css('button.ask')).injector.get(MatTooltip).message).toBe(
      'The AI searches the news about this fall and says in a few sentences what it found, with its sources. ' +
      'It takes up to a minute.');
    expect(el.querySelector('.reading')).toBeNull();
    expect(text('.headlines')).toBe('Headlines from that week');
    expect(readings.asked).toEqual([]);
  });

  it('adds nothing without Claude Code: the page is as it was', () => {
    readings.installed = false;
    open();
    expect(el.textContent?.trim()).toBe('Headlines from that week');
  });

  it('adds nothing for a slide without one big day: there is no day to read about', () => {
    open();
    fixture.componentInstance.drop = undefined;
    fixture.detectChanges();
    expect(el.textContent?.trim()).toBe('Headlines from that week');
  });

  it('asks about this stock and this fall, and says that Claude is at work', () => {
    open();
    click('Read it for me');
    expect(readings.asked).toEqual([{symbol: 'ABCD', name: 'Example Corp', day: '2026-11-03', percent: 12.04}]);
    expect(text('.busy')).toBe('The AI is searching the news about this fall. This takes up to a minute.');
    expect(el.querySelector('.busy')?.getAttribute('role')).toBe('status');
    expect(buttons()).toEqual([]);
  });

  it('shows the reading when it arrives: two sentences, the pages it rests on, and that it is not tested', () => {
    open();
    click('Read it for me');
    answer({state: 'reading'});
    answer({state: 'done', reading});

    expect(text('.reading')).toBe('The company lowered its sales forecast for next quarter. This is about the company itself, not the whole market.');
    const links = Array.from(el.querySelectorAll('li a')) as HTMLAnchorElement[];
    expect(links.map(it => it.textContent?.trim())).toEqual(['Example Corp lowers its sales forecast', 'Example shares fall after results']);
    expect(links.map(it => it.getAttribute('href'))).toEqual(['https://news.example.com/forecast', 'https://www.example.org/markets/results']);
    expect(links.every(it => it.target === '_blank' && it.rel === 'noopener noreferrer')).toBeTrue();
    expect(Array.from(el.querySelectorAll('li .source')).map(it => it.textContent?.trim())).toEqual(['news.example.com', 'example.org']);
    expect(text('.by .line')).toBe('Read by the AI on Nov 22 · not tested · 2 sources');
    expect(fixture.debugElement.query(By.css('.by .line')).injector.get(MatTooltip).message).toContain('No test shows that it helps to choose stocks');
    expect(el.querySelector('.busy')).toBeNull();
    expect(buttons()).toEqual(['Read again']);
  });

  it('shows the reading in place of the headlines the page listed, so the same news is not there twice', () => {
    open();
    expect(el.querySelector('.headlines')).not.toBeNull();
    click('Read it for me');
    expect(el.querySelector('.headlines')).not.toBeNull();
    answer({state: 'done', reading});
    expect(el.querySelector('.headlines')).toBeNull();
  });

  it('shows a reading that was kept, without asking again', () => {
    readings.kept['ABCD'] = {state: 'done', reading};
    open();
    expect(text('.reading')).toContain('The company lowered its sales forecast');
    expect(el.querySelector('.headlines')).toBeNull();
    expect(readings.asked).toEqual([]);
    expect(buttons()).toEqual(['Read again']);
  });

  it('says what went wrong and offers to try again', () => {
    open();
    click('Read it for me');
    answer({state: 'failed', reason: 'timeout'});
    expect(text('.failed')).toBe('The AI took too long and was stopped. Try again.');
    expect(el.querySelector('.failed')?.getAttribute('role')).toBe('alert');
    expect(text('.headlines')).toBe('Headlines from that week');
    expect(buttons()).toEqual(['Read it for me']);
    click('Read it for me');
    expect(readings.asked.length).toBe(2);
    expect(el.querySelector('.failed')).toBeNull();
  });

  it('says plainly when the news gave no clear reason', () => {
    readings.kept['ABCD'] = {state: 'done', reading: {...reading, what: '', about: 'unclear', sources: []}};
    open();
    expect(text('.reading')).toBe('The AI found no clear reason for this fall in the news.');
    expect(el.querySelector('ul')).toBeNull();
    expect(text('.by .line')).toBe('Read by the AI on Nov 22 · not tested');
  });

  it('does not show a reading of an earlier fall: the stock has since fallen more on another day', () => {
    readings.kept['ABCD'] = {state: 'done', reading: {...reading, day: '2026-10-07'}};
    open();
    expect(el.querySelector('.reading')).toBeNull();
    expect(text('.headlines')).toBe('Headlines from that week');
    expect(buttons()).toEqual(['Read it for me']);
  });

  it('keeps showing the reading while it is read again, and when reading again fails', () => {
    readings.kept['ABCD'] = {state: 'done', reading};
    open();
    click('Read again');
    expect(readings.asked.length).toBe(1);
    answer({state: 'reading'});
    expect(text('.reading')).toContain('The company lowered its sales forecast');
    expect(text('.busy')).toContain('The AI is searching the news');
    expect(buttons()).toEqual([]);
    answer({state: 'failed', reason: 'failed', reading});
    expect(text('.reading')).toContain('The company lowered its sales forecast');
    expect(text('.failed')).toBe('The AI did not answer. Try again.');
    expect(buttons()).toEqual(['Read again']);
  });

  it('picks up a run that was already going when the details were opened', () => {
    readings.kept['ABCD'] = {state: 'reading'};
    open();
    expect(readings.followed).toEqual(['ABCD']);
    expect(text('.busy')).toContain('The AI is searching the news');
    answer({state: 'done', reading});
    expect(text('.reading')).toContain('The company lowered its sales forecast');
  });

  it('starts over for another stock', () => {
    readings.kept['ABCD'] = {state: 'done', reading};
    open();
    fixture.componentInstance.symbol = 'WXYZ';
    fixture.componentInstance.name = 'Other Corp';
    fixture.detectChanges();
    expect(el.querySelector('.reading')).toBeNull();
    expect(text('.headlines')).toBe('Headlines from that week');
    expect(buttons()).toEqual(['Read it for me']);
  });
});
