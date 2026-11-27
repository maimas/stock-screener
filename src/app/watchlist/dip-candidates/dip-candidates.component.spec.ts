import {Component, CUSTOM_ELEMENTS_SCHEMA} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {By} from "@angular/platform-browser";
import {MatTooltip} from "@angular/material/tooltip";
import {DipCandidatesComponent} from "./dip-candidates.component";
import {MORE_STORAGE_KEY} from "../more/more.service";

// The owner, with a picture of the Watchlist (the box "Dip candidates" as a pane beside the lists, with a small table
// of its own and paragraphs about it): "do you think we should remove the Dip candidates view in favor of the list
// tables and maybe move the market summary on the top of the table?", then "maybe that can be a table on the top
// where it becomes a table like the other ones but more polished in terms of prose", and "go" to a sketch of it.
// The box is the frame of that table now: the title with the marks' counts, the market in a line, the tested figures
// in a line, and under them the table the page hands in (the lists' own table, with their columns and details).
// What the box said in sentences is behind "How to read this"; which stocks move together is behind "Groups".

const text = (el?: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const SOME = {dipBuy: 18, watch: 2, pass: 4, none: 6};

function shown(inputs: object = {}) {
  TestBed.configureTestingModule({imports: [DipCandidatesComponent, NoopAnimationsModule]});
  const fixture = TestBed.createComponent(DipCandidatesComponent);
  Object.assign(fixture.componentInstance, {loaded: true, marks: SOME, ...inputs});
  fixture.detectChanges();
  return {fixture, card: fixture.componentInstance, el: fixture.nativeElement as HTMLElement};
}

/** The box as the page uses it: with the table of the stocks, and the button that asks the AI, handed in. */
@Component({
  standalone: true,
  imports: [DipCandidatesComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <app-dip-candidates [marks]="marks" [loaded]="true" [folded]="folded" (foldedChange)="folded = $event">
      <app-claude-ask>Ask AI about these 2</app-claude-ask>
      <table class="handed-in"><tbody><tr><td>AMD</td></tr><tr><td>ARM</td></tr></tbody></table>
    </app-dip-candidates>`,
})
class PageLikeComponent {
  marks = {dipBuy: 2, watch: 0, pass: 0, none: 0};
  folded = false;
}

function onThePage(change: Partial<PageLikeComponent> = {}) {
  TestBed.configureTestingModule({imports: [PageLikeComponent, NoopAnimationsModule]});
  const fixture = TestBed.createComponent(PageLikeComponent);
  Object.assign(fixture.componentInstance, change);
  fixture.detectChanges();
  return {fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement};
}

describe('DipCandidatesComponent: the frame of the table of stocks marked DIP BUY', () => {
  beforeEach(() => localStorage.clear());

  it('holds the table the page hands in, under its title, and has no table of its own', () => {
    const {el} = onThePage();
    expect(text(el.querySelector('h2.title'))).toBe('Dip candidates');
    expect(el.querySelectorAll('table').length).withContext('the handed-in one only').toBe(1);
    expect(el.querySelector('mat-card .stocks table.handed-in')).withContext('inside the box').not.toBeNull();
    expect(el.querySelector<HTMLElement>('.stocks')!.hidden).toBeFalse();
  });

  it('puts the button that asks the AI about these stocks on the line of the title, as a list has it', () => {
    const {el} = onThePage();
    expect(text(el.querySelector('.head app-claude-ask'))).toBe('Ask AI about these 2');
  });

  // Each as it looks in the lists, with how many stocks on the page carry it: one line of marks and counts.
  it('shows the three marks with their counts on the line of the title, each as it looks in the lists', () => {
    const {el} = shown();
    const legend = Array.from(el.querySelectorAll('.head .legend .mark')).map(mark =>
      [text(mark.querySelector('.verdict-pill')), text(mark.querySelector('.mark-count')), text(mark.querySelector('dd'))]);
    expect(legend).toEqual([
      ['DIP BUY', '18', 'The price dropped 15% or more from its highest of the past year while the business keeps growing.'],
      ['WATCH', '2', 'Growing, but no such drop yet.'],
      ['PASS', '4', 'Not growing enough.'],
    ]);
    expect(text(el.querySelector('.legend .no-mark dt'))).withContext('the stocks without a mark are a count in the same line').toBe('no mark6');
    expect(text(el.querySelector('.unmarked'))).toBe('6 more have no mark: funds, and companies with too little history to judge.');
  });

  it('says what a mark means on the mark itself, where the pointer rests or the Tab key lands, and not beside it', () => {
    const {fixture, el} = shown();
    const marks = fixture.debugElement.queryAll(By.css('.legend dt'));
    expect(marks.map(it => it.injector.get(MatTooltip).message)).toEqual([
      'The price dropped 15% or more from its highest of the past year while the business keeps growing.',
      'Growing, but no such drop yet.',
      'Not growing enough.',
      '6 more have no mark: funds, and companies with too little history to judge.',
    ]);
    expect(marks.every(it => it.nativeElement.tabIndex === 0)).withContext('each can take the keyboard').toBeTrue();
    const beside = Array.from(el.querySelectorAll('.legend dd'));
    expect(beside.length).toBe(4);
    expect(beside.every(it => it.classList.contains('visually-hidden'))).withContext('for a screen reader, not for the eye').toBeTrue();
  });

  it('counts one stock without a mark as one, and says nothing when every stock has a mark', () => {
    expect(text(shown({marks: {dipBuy: 1, watch: 0, pass: 0, none: 1}}).el.querySelector('.unmarked')))
      .toBe('1 more has no mark: funds, and companies with too little history to judge.');
    TestBed.resetTestingModule();
    expect(shown({marks: {dipBuy: 1, watch: 0, pass: 0, none: 0}}).el.querySelector('.unmarked')).toBeNull();
  });

  // The box's own small table had a tag "new" on a stock that became a DIP BUY today; the lists' table has no such
  // tag. The stocks are named once, on the line of the title.
  it('names the stocks that were marked DIP BUY today, and says nothing on a day without any', () => {
    const {el} = shown({fresh: ['AMD', 'ARM']});
    expect(text(el.querySelector('.head .new-today'))).toBe('New today: AMD, ARM');
    TestBed.resetTestingModule();
    expect(shown({fresh: []}).el.querySelector('.new-today')).toBeNull();
  });

  it('says where the market stands, and what a fearful market has meant for stocks that dropped, in one line', () => {
    const {el} = shown({
      indexLine: 'The market (S&P 500) is 8.1% below its highest of the past year',
      fear: {vix: 26.4, high: true, label: 'Market fear high (VIX 26.4)', text: 'What the VIX is.'},
    });
    const lines = Array.from(el.querySelectorAll('.market-line > .market')).map(text);
    expect(lines[0]).toBe('The market (S&P 500) is 8.1% below its highest of the past year.');
    expect(lines[1]).toMatch(/^Market fear high \(VIX 26\.4\): in the past a better time to buy stocks that dropped .+, but fear can get worse first\.$/);
  });

  it('only names the level of fear while the market is calm: there is nothing to act on', () => {
    const {el} = shown({fear: {vix: 14.2, high: false, label: 'Market fear low (VIX 14.2)', text: 'What the VIX is.'}});
    expect(Array.from(el.querySelectorAll('.market')).map(text)).toEqual(['Market fear low (VIX 14.2)']);
  });

  describe('what the mark was worth in the tests', () => {
    // The owner chose the newest test for the strip (one strip on both views); all the lists together are behind
    // "How to read this", after a line that says which is which.
    it('is a line of four figures, the typical stock beside the average, drawn as the page draws figures', () => {
      const {el} = shown();
      const strip = el.querySelector('.tested-figures')!;
      expect(text(strip.querySelector('h3'))).toMatch(/^In tests on \d+ new stocks, over 6 months$/);
      expect(strip.querySelector('dl')!.className).withContext('the look of the strip in the plan\'s box').toBe('facts');
      const figures = Array.from(strip.querySelectorAll('dl > div')).map(it => [text(it.querySelector('dt')), text(it.querySelector('dd'))]);
      expect(figures.map(it => it[0])).toEqual(['DIP BUY, on average', 'DIP BUY, the typical one', 'The market', '1 in 10 DIP BUYs lost']);
      expect(figures.slice(0, 3).every(it => /^[+−]\d+\.\d%$/.test(it[1]))).withContext(JSON.stringify(figures)).toBeTrue();
    });

    // Found by a review: the gains stood in sight and what limits them was a click away.
    it('keeps the risk and the reach of the tests in sight with the gains, not behind the control', () => {
      const {el} = shown();
      const strip = el.querySelector('.tested-figures')!;
      expect(text(strip.querySelector('dl .risk dt'))).toBe('1 in 10 DIP BUYs lost');
      expect(text(strip.querySelector('dl .risk dd'))).toMatch(/^\d+% or more$/);
      expect(text(strip.querySelector('.tested-limits'))).toMatch(/^The typical one is the middle stock: half did better, half worse\. The tests cover \d{4}–\d{4} only\.$/);
      expect(strip.closest('app-about')).toBeNull();
    });

    it('is left out, with how to read it, on a day nothing is marked', () => {
      const {el} = shown({marks: {dipBuy: 0, watch: 3, pass: 4, none: 0}});
      expect(el.querySelector('.tested-figures')).toBeNull();
      expect(el.querySelector('app-about')).toBeNull();
    });
  });

  describe('"How to read this"', () => {
    it('is the one place of the box\'s sentences: closed until asked for, whole, with no second "more" inside', () => {
      const {el} = shown();
      const abouts = el.querySelectorAll('app-about');
      expect(abouts.length).toBe(1);
      expect(text(abouts[0].querySelector('button'))).toBe('How to read this');
      expect((abouts[0].querySelector('.about-body') as HTMLElement).hidden).withContext('closed until it is asked for').toBeTrue();
      expect(abouts[0].querySelector('app-more')).toBeNull();
    });

    it('says what the three marks mean first, for a reader without a pointer', () => {
      const {el} = shown();
      const meanings = Array.from(el.querySelectorAll('app-about .about-body > dl.meanings > div')).map(it => [text(it.querySelector('dt')), text(it.querySelector('dd'))]);
      expect(meanings).toEqual([
        ['DIP BUY', 'The price dropped 15% or more from its highest of the past year while the business keeps growing.'],
        ['WATCH', 'Growing, but no such drop yet.'],
        ['PASS', 'Not growing enough.'],
      ]);
      expect(el.querySelector('app-about .about-body')!.firstElementChild!.className).withContext('before the other notes').toBe('meanings');
    });

    it('then gives the account of all the tested lists after a line that says which test the figures in sight are', () => {
      const {el} = shown();
      const behind = Array.from(el.querySelectorAll('app-about .about-body > p')).map(text);
      const lead = behind.findIndex(it => it.startsWith('The figures above are from the newest test'));
      expect(lead).toBeGreaterThanOrEqual(0);
      expect(behind[lead + 1]).withContext('right after its lead-in').toMatch(/^In tests on \d+ stocks/);
    });

    // Found by a review: the sentence was behind "Groups" and a second "more", and gone on a day the stocks fell
    // into no group or the table was put away.
    describe('how far the marked stocks are one bet', () => {
      const ONE_BET = '11 of these 18 stocks are in Technology. Their prices move closely together: owning all 18 is nearer to one big bet than to 18 separate ones.';
      const behind = (el: HTMLElement) => el.querySelector<HTMLElement>('app-about .about-body')!;

      it('is said whole, right after the account of the tests', () => {
        const {el} = shown({oneBet: ONE_BET});
        expect(text(behind(el).querySelector('.one-bet'))).toBe(ONE_BET);
        expect(behind(el).querySelector('app-more')).withContext('no second "more" inside').toBeNull();
        const notes = Array.from(behind(el).querySelectorAll(':scope > p'));
        expect(notes.findIndex(p => p.classList.contains('one-bet')))
          .toBe(notes.findIndex(p => p.classList.contains('tested')) + 1);
      });

      it('is said on a day the stocks fall into no group, and with the table put away', () => {
        const {el} = shown({oneBet: 'All 3 of these stocks are in Technology.', tied: {groups: [], alone: ['ACME', 'BOLT', 'CHIP'], unknown: []}, folded: true});
        expect(text(behind(el).querySelector('.one-bet'))).toBe('All 3 of these stocks are in Technology.');
      });

      it('is left out when there is nothing to say', () => {
        expect(shown({oneBet: ''}).el.querySelector('.one-bet')).toBeNull();
      });
    });

    it('says that an order of the rows is the reader\'s own, once there are two stocks to order', () => {
      expect(text(shown().el.querySelector('app-about .order-note'))).toContain('the page ranks nothing');
      TestBed.resetTestingModule();
      expect(shown({marks: {dipBuy: 1, watch: 0, pass: 0, none: 0}}).el.querySelector('.order-note')).toBeNull();
    });
  });

  // The table is long on a day with twenty marks; the lists begin under it. The reader can put it away and keep
  // the three lines.
  describe('"Hide the table"', () => {
    it('says which way the button goes, and asks the page, which keeps the choice', () => {
      const {fixture, host, el} = onThePage();
      const button = () => el.querySelector<HTMLButtonElement>('.head button.fold')!;
      expect(text(button())).toBe('Hide the table');
      expect(button().getAttribute('aria-expanded')).toBe('true');
      button().click();
      fixture.detectChanges();
      expect(host.folded).toBeTrue();
      expect(text(button())).toBe('Show the table');
      expect(button().getAttribute('aria-expanded')).toBe('false');
    });

    it('puts the table out of sight and keeps it in the page, so that nothing is built again on "Show the table"', () => {
      const {el} = onThePage({folded: true});
      expect(el.querySelector<HTMLElement>('.stocks')!.hidden).toBeTrue();
      expect(el.querySelector('.stocks table.handed-in')).not.toBeNull();
      expect(el.querySelector('mat-card')!.classList.contains('folded')).toBeTrue();
    });

    it('keeps the marks\' counts, the market and the tested figures with their risk: the strip that is left', () => {
      const {el} = shown({folded: true, indexLine: 'The market (S&P 500) is at its highest of the past year'});
      expect(el.querySelector('.head .legend')).not.toBeNull();
      expect(text(el.querySelector('.market'))).toBe('The market (S&P 500) is at its highest of the past year.');
      expect(text(el.querySelector('.tested-figures dl .risk dt'))).toBe('1 in 10 DIP BUYs lost');
      expect(el.querySelector('app-about')).withContext('and how to read them').not.toBeNull();
    });

    it('puts away what is about the table with it: the button that asks the AI and the groups', () => {
      const {el} = onThePage({folded: true});
      expect(el.querySelector<HTMLElement>('.head .ask')!.hidden).toBeTrue();
      expect(el.querySelector('.groups-toggle')).toBeNull();
    });

    it('is not offered on a day nothing is marked: there is no table to hide', () => {
      expect(shown({marks: {dipBuy: 0, watch: 3, pass: 4, none: 0}}).el.querySelector('button.fold')).toBeNull();
    });
  });

  it('says in a sentence that nothing is marked, in place of the table', () => {
    const {el} = onThePage({marks: {dipBuy: 0, watch: 3, pass: 4, none: 0}});
    expect(text(el.querySelector('.empty'))).toBe(
      'Nothing is marked DIP BUY right now: no growing company in your lists has dropped 15% or more from its highest price of the past year.');
    expect(el.querySelector<HTMLElement>('.stocks')!.hidden).toBeTrue();
  });

  it('shows that prices are still arriving until the first are in: no counts and no sentence yet', () => {
    const {el} = shown({loaded: false});
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.legend')).toBeNull();
    expect(el.querySelector('.tested-figures')).toBeNull();
    expect(el.querySelector('.empty')).withContext('not known yet').toBeNull();
    expect(el.querySelector<HTMLElement>('.stocks')!.hidden).toBeTrue();
  });

  it('offers the keyboard a way past the box, to the lists, before the table', () => {
    const {fixture, card, el} = shown();
    const asked = jasmine.createSpy('skipToLists');
    card.skipToLists.subscribe(asked);
    const link = el.querySelector('a.skip-over') as HTMLAnchorElement;
    expect(text(link)).toBe('Skip to your lists');
    expect(link.compareDocumentPosition(el.querySelector('.stocks')!) & Node.DOCUMENT_POSITION_FOLLOWING).withContext('before the table').toBeTruthy();
    link.click();
    fixture.detectChanges();
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('gives the live record under the table, with a way to save the daily log as a file', () => {
    const {card, el} = shown({trackText: 'Since Nov 21, 2026 this page has flagged 19 DIP BUYs.', recorderText: 'Also recorded automatically.'});
    let saved = 0;
    card.exportLog.subscribe(() => saved++);
    expect(text(el.querySelector('.log'))).toContain('Since Nov 21, 2026 this page has flagged 19 DIP BUYs. Also recorded automatically.');
    expect(el.querySelector('.stocks')!.compareDocumentPosition(el.querySelector('.log')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    (el.querySelector('.log button') as HTMLButtonElement).click();
    expect(saved).toBe(1);
  });

  it('points out, as a status, a background job that needs a look', () => {
    const {el} = shown({evidenceText: 'The tested numbers were not updated on Nov 22.'});
    expect(text(el.querySelector('.attention[role="status"]'))).toBe('The tested numbers were not updated on Nov 22.');
  });

  // The words the box shows outside its table and its controls: a title, counts, figures with their names and at
  // most two sentences (the market's). The owner: "too much text and not much signal", and of this box: "more
  // polished in terms of prose".
  it('shows no paragraph about the stocks: what it says in sentences is behind its controls', () => {
    const {el} = shown({
      oneBet: '11 of these 18 stocks are in Technology. Over the past year their prices moved closely together.',
      tied: {groups: [{letter: 'A', index: 0, symbols: ['ACME', 'BOLT'], level: 0.71, sector: 'all Technology'}], alone: [], unknown: []},
    });
    const inSight = Array.from(el.querySelectorAll('p')).filter(p => !p.closest('.about-body') && !p.closest('[hidden]')).map(p => p.className);
    expect(inSight).toEqual(['tested-limits']);
  });
});

// Found by a review of the page: on a day no price arrived the bar, the plan and every list said so, and this box
// kept its grey loading bars for good.
describe('DipCandidatesComponent: a day no price arrives', () => {
  it('says so in place of the loading bars, and offers to try again', () => {
    const {fixture, el} = shown({loaded: false, instead: 'Today\'s prices could not be loaded: the data source did not answer.'});
    expect(el.querySelector('.loading')).toBeNull();
    expect(el.querySelector('.failed p')!.textContent).toBe('Today\'s prices could not be loaded: the data source did not answer.');
    let asked = 0;
    fixture.componentInstance.retry.subscribe(() => asked++);
    el.querySelector<HTMLButtonElement>('.failed button')!.click();
    expect(asked).toBe(1);
  });

  it('shows the loading bars while the prices are still on their way', () => {
    const {el} = shown({loaded: false, instead: ''});
    expect(el.querySelector('.failed')).toBeNull();
    expect(el.querySelector('.loading')!.getAttribute('aria-busy')).toBe('true');
  });
});

// The owner, of the sentence that the candidates are nearer to one big bet: "I can't leverage it since I don't know
// what stocks move together - maybe we can add something to show the tied group". The letters are a column of the
// table now, as in every list; who is in which group is behind "Groups", and the sentence about one bet behind
// "How to read this".
describe('DipCandidatesComponent: which of the candidates move together', () => {
  const TIED = {
    groups: [
      {letter: 'A', index: 0, symbols: ['ACME', 'BOLT'], level: 0.71, sector: 'all Technology'},
      {letter: 'B', index: 1, symbols: ['YARN', 'ZED'], level: 0.6, sector: ''},
    ],
    alone: ['SOLO'], unknown: [],
  };
  const withGroups = (inputs: object = {}) =>
    shown({marks: {dipBuy: 5, watch: 0, pass: 0, none: 0}, oneBet: 'Their prices move closely together.', tied: TIED, ...inputs});
  const control = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button.groups-toggle')!;
  const legend = (el: HTMLElement) => el.querySelector<HTMLElement>('.tied')!;

  beforeEach(() => localStorage.clear());

  it('keeps the groups behind a control of their own, closed until it is asked for', () => {
    const {el} = withGroups();
    expect(text(control(el))).toBe('Groups');
    expect(control(el).getAttribute('aria-expanded')).toBe('false');
    expect(control(el).getAttribute('aria-controls')).toBe(legend(el).id);
    expect(legend(el).hidden).toBeTrue();
  });

  it('lists the groups on a click: the letter, its stocks, how many and their sector', () => {
    const {fixture, el} = withGroups();
    control(el).click();
    fixture.detectChanges();
    expect(control(el).getAttribute('aria-expanded')).toBe('true');
    expect(legend(el).hidden).toBeFalse();
    expect(legend(el).querySelector('.one-bet')).withContext('said once, behind "How to read this"').toBeNull();
    expect(text(legend(el).querySelector('h3'))).toBe('Which of them move together');
    const lines = Array.from(legend(el).querySelectorAll('li')).map(li =>
      [text(li.querySelector('.tied-tag')), text(li.querySelector('.members')), text(li.querySelector('.brief'))]);
    expect(lines).toEqual([
      ['A', 'ACME, BOLT', '2 stocks, all Technology'],
      ['B', 'YARN, ZED', '2 stocks'],
      ['—', 'SOLO', 'moved with none of the others'],
    ]);
    expect(legend(el).querySelector('li .tied-tag i')!.className).withContext('the same colour for the same letter').toBe('g0');
  });

  it('remembers in this browser that the groups were opened, like every explanation of the page', () => {
    const {fixture, el} = withGroups();
    control(el).click();
    fixture.detectChanges();
    expect(JSON.parse(localStorage.getItem(MORE_STORAGE_KEY) ?? '[]')).toContain('dip.groups');
    control(el).click();
    fixture.detectChanges();
    expect(legend(el).hidden).toBeTrue();
    expect(JSON.parse(localStorage.getItem(MORE_STORAGE_KEY) ?? '[]')).not.toContain('dip.groups');
  });

  it('says what the letters are and are not behind "How to read this"', () => {
    expect(text(withGroups().el.querySelector('app-about .tied-note'))).toContain('not tested');
  });

  it('says nothing of groups when there are none', () => {
    const {el} = withGroups({tied: {groups: [], alone: [], unknown: []}});
    expect(control(el)).toBeNull();
    expect(legend(el)).toBeNull();
    expect(el.querySelector('.tied-note')).toBeNull();
  });
});
