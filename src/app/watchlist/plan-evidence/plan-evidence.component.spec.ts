import {ComponentFixture, fakeAsync, TestBed, tick} from "@angular/core/testing";
import {PlanEvidenceComponent} from "./plan-evidence.component";
import {PlanStep, StepKind} from "../plan";
import {textsFor} from "../evidence";
import {MORE_STORAGE_KEY} from "../more/more.service";
import {FIGURES_WITH_TAKE_PROFIT} from "../testing/figures";

const step = (kind: StepKind, verb: string, why: string): PlanStep => ({kind, verb, text: 'What to do.', why, items: []});

describe('PlanEvidenceComponent ("How the plan was tested", at the bottom of the page)', () => {
  it('gives the evidence behind each step of today\'s plan, in the plan\'s order', () => {
    const box = Object.assign(new PlanEvidenceComponent(), {steps: [step('buy', 'BUY', 'Because A.'), step('hold', 'KEEP', 'Because B.')]});
    expect(box.reasons).toEqual([{verb: 'BUY', why: 'Because A.'}, {verb: 'KEEP', why: 'Because B.'}]);
  });

  it('gives none while prices are still arriving', () => {
    const box = Object.assign(new PlanEvidenceComponent(), {steps: [step('buy', 'BUY', 'Because A.')], loading: true});
    expect(box.reasons).toEqual([]);
  });

  it('says what the plan is and how it did, a paragraph a thought, with the figures of a test in a table of its own', () => {
    const blocks = new PlanEvidenceComponent().blocks;
    const texts = blocks.flatMap(block => block.text === undefined ? [] : [block.text]);
    expect(texts[0]).toMatch(/^The plan: buy stocks that dropped/);
    expect(texts[1]).toMatch(/^Does that make money\?/);
    expect(texts[3]).toMatch(/^How many: in a separate test on \d+ stocks that dropped/);
    // Taking a profit (pre-registered #9): what it did, both sides, then what the plan offers from it.
    expect(texts[5]).toMatch(/^Selling early: on \d+ more stocks never used before/);
    expect(texts[5]).toMatch(/taking a profit made a loss rarer and gave less on average than keeping for 6 months/);
    expect(texts[6]).toMatch(/^The plan still says to keep for 6 months, because on average keeping paid more\./);
    expect(texts[6]).toMatch(/is offered as a level you can set for yourself, beside your cash and your limit: \+15% \(by a sell order, or by selling once you see it\)\.$/);
    expect(texts[texts.length - 1]).toMatch(/Not advice, and nothing is guaranteed\.$/);
    expect(blocks.filter(block => block.table).map(block => block.table!.caption)).toEqual([
      'Three stocks together against one alone',
      'Stocks marked DIP BUY: kept for 6 months, or sold early',
      'The stocks that were sold early, had they been kept instead',
    ]);
  });
});

// Found by a review of the page: seven paragraphs stood in one run under "THE PLAN", their opening words ("How
// many:", "Selling early:") set like the rest, and the box could not be skimmed.
describe('PlanEvidenceComponent: what a paragraph is about', () => {
  const box = new PlanEvidenceComponent();

  it('is its opening words when it begins with a few words and a colon', () => {
    expect(box.leadIn('How many: three or more rather than one.')).toBe('How many:');
    expect(box.rest('How many: three or more rather than one.')).toBe(' three or more rather than one.');
  });

  it('is nothing for a paragraph that begins with a sentence, also one with a colon further in', () => {
    const sentence = 'The plan: buy stocks that dropped 15% or more while the business keeps growing.';
    expect(box.leadIn('Does that make money? On 202 stocks never used before, such stocks gained: a lot.')).withContext('a short question opens it').toBe('Does that make money?');
    expect(box.leadIn('On 202 stocks never used before, did such stocks gain? They did: a lot.')).toBe('');
    expect(box.rest(sentence)).toBe(box.leadIn(sentence) ? sentence.slice(box.leadIn(sentence).length) : sentence);
    expect(box.leadIn('Over all 994 test stocks (bought from mid-2022 to May 2026) the average was this: more.')).toBe('');
  });

  it('loses no word: what is set stronger and what follows make the paragraph again', () => {
    box.blocks.forEach(block => {
      if (block.text !== undefined) {
        expect(box.leadIn(block.text) + box.rest(block.text)).toBe(block.text);
      }
    });
  });
});

// Found by a second review: the box read as a wall, with 114 numbers in running text. The like figures of a test
// now stand in a small table, each once. The tests below are on made-up figures, handed to the box.
describe('PlanEvidenceComponent: the page it makes', () => {
  const MADE_UP = textsFor(FIGURES_WITH_TAKE_PROFIT).planBlocks;

  beforeEach(() => localStorage.removeItem(MORE_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(MORE_STORAGE_KEY));

  /** The box with made-up figures: opened, as a reader who asked for it has it, unless told to leave it closed. */
  function create(opened = true): ComponentFixture<PlanEvidenceComponent> {
    if (opened) {
      localStorage.setItem(MORE_STORAGE_KEY, JSON.stringify(['evidence.box']));
    }
    const fixture = TestBed.configureTestingModule({imports: [PlanEvidenceComponent]}).createComponent(PlanEvidenceComponent);
    fixture.componentInstance.blocks = MADE_UP;
    fixture.detectChanges();
    return fixture;
  }

  const page = (fixture: ComponentFixture<PlanEvidenceComponent>) => fixture.nativeElement as HTMLElement;
  const said = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** What stands under THE PLAN, block by block. */
  const pieces = (fixture: ComponentFixture<PlanEvidenceComponent>) =>
    Array.from(page(fixture).querySelectorAll<HTMLElement>('.the-plan dd > p, .the-plan dd > table'));

  // The owner, of a page of careful sentences: "too much text and not much signal". This box is all explanation:
  // it is its title and one control until it is asked for, and what the reader opened is remembered.
  it('is its title and one control until it is asked for', () => {
    const fixture = create(false);
    expect(said(page(fixture).querySelector('h2.title'))).toBe('How the plan was tested');
    const control = page(fixture).querySelector<HTMLButtonElement>('button.about-toggle')!;
    expect(said(control)).toBe('The plan in full, its tests, and the reasons of today\'s steps');
    expect(control.getAttribute('aria-expanded')).toBe('false');
    const body = page(fixture).querySelector<HTMLElement>('.about-body')!;
    expect(body.hidden).toBeTrue();
    expect(body.querySelector('dl.the-plan')).withContext('nothing is taken away: it is all behind the control').not.toBeNull();
    const inSight = Array.from(page(fixture).querySelectorAll('p, dd')).filter(el => !el.closest('[hidden]'));
    expect(inSight.length).withContext('no sentence in sight').toBe(0);
  });

  it('opens from its control, and stays open for the next visit', () => {
    const fixture = create(false);
    page(fixture).querySelector<HTMLButtonElement>('button.about-toggle')!.click();
    fixture.detectChanges();
    expect(page(fixture).querySelector<HTMLElement>('.about-body')!.hidden).toBeFalse();
    expect(JSON.parse(localStorage.getItem(MORE_STORAGE_KEY) ?? '[]')).toContain('evidence.box');
  });

  // The plan's last line ("How it was tested") scrolls here and puts the keyboard on the box: whoever comes that
  // way asked for it, so it opens. It does not close again when the box is brought into view a second time.
  it('opens when the plan\'s link brings the reader to it', () => {
    const fixture = create(false);
    const card = page(fixture).querySelector<HTMLElement>('#plan-evidence')!;
    card.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(page(fixture).querySelector<HTMLElement>('.about-body')!.hidden).toBeFalse();
    card.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(page(fixture).querySelector<HTMLElement>('.about-body')!.hidden).withContext('a second time: still open').toBeFalse();
  });

  // Found by a review of the page: the link scrolled to the box while it was one line tall, at the foot of a 2560
  // window; then the box opened downwards, out of the window, and the page stayed where it was. Once it has
  // opened, the box is brought to the top of the window again.
  it('brings itself into view again once it has opened from the plan\'s link, and not when it was open already', fakeAsync(() => {
    const fixture = create(false);
    const card = page(fixture).querySelector<HTMLElement>('#plan-evidence')!;
    const scrolled = spyOn(card, 'scrollIntoView');
    card.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(scrolled).withContext('not before the box has its new height').not.toHaveBeenCalled();
    tick();
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect((scrolled.calls.mostRecent().args[0] as ScrollIntoViewOptions).block).toBe('start');
    card.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    tick();
    expect(scrolled).withContext('open already: the page that brought the reader here has scrolled to it').toHaveBeenCalledTimes(1);
  }));

  it('sets a table for each run of like figures, in its place among the paragraphs', () => {
    const fixture = create();
    expect(pieces(fixture).map(it => it.tagName)).toEqual(MADE_UP.map(block => block.table ? 'TABLE' : 'P'));
    expect(pieces(fixture).filter(it => it.tagName === 'P').map(said)).toEqual(MADE_UP.flatMap(block => block.text === undefined ? [] : [block.text]));
  });

  it('gives a table its caption, a head for each column and a head for each row, so that it can be read out', () => {
    const fixture = create();
    const table = page(fixture).querySelector('table.figures')!;
    expect(said(table.querySelector('caption'))).toBe('Three stocks together against one alone');
    const heads = Array.from(table.querySelectorAll('thead th'));
    expect(heads.map(said)).toEqual(['Held for 6 months', 'Typical result', '1 in 10 lost at least', 'On average']);
    expect(heads.every(it => it.getAttribute('scope') === 'col')).toBeTrue();
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    expect(rows.map(row => said(row.querySelector('th[scope="row"]')))).toEqual(['One alone', 'Three together', 'The market']);
    expect(rows.map(row => Array.from(row.querySelectorAll('td')).map(said))).toEqual([
      ['+3.8%', '33%', '+8.8%'], ['+5.3%', '22%', '+8.6%'], ['+5.5%', '', ''],
    ]);
  });

  it('sets the ways the plan does not offer apart, under a line across the table that says why', () => {
    const fixture = create();
    const table = page(fixture).querySelectorAll('table.figures')[1];
    const apart = table.querySelector('tbody.apart')!;
    const title = apart.querySelector('tr:first-child th')!;
    expect(said(title)).toBe('Not offered: under the marks written down before the test, the first time it was run');
    expect(title.getAttribute('colspan')).toBe('5');
    expect(Array.from(apart.querySelectorAll('th[scope="row"]')).map(said)).toEqual(['Sold once a week closed 25% up']);
    expect(Array.from(table.querySelectorAll('tbody:not(.apart) th[scope="row"]')).map(said)).toEqual([
      'Kept for 6 months', 'Sell order at +15%', 'Sold once a week closed 15% up', 'Sell order at +25%',
    ]);
  });

  // The owner's choice for the page's explanations: the first sentence shows, "more" opens the rest in place.
  it('shows what the plan is, and keeps how it did (paragraphs and tables alike) for "more"', () => {
    const fixture = create();
    const all = pieces(fixture);
    expect(all[0].hidden).toBeFalse();
    expect(said(all[0])).toBe(MADE_UP[0].text!);
    expect(all.slice(1).every(it => it.hidden)).withContext('closed').toBeTrue();
    page(fixture).querySelector<HTMLButtonElement>('.the-plan p.lead button')!.click();
    fixture.detectChanges();
    expect(all.every(it => !it.hidden)).withContext('opened').toBeTrue();
  });

  // Found by a third review: once opened, "less" stood only at the end of the first paragraph, a long way up.
  it('has a second "less" at the end of the last paragraph, where a reader of the whole account ends', () => {
    const fixture = create();
    const all = pieces(fixture);
    const last = all[all.length - 1];
    expect(last.querySelector('button')).withContext('at the end of the last block').toBeTruthy();
    page(fixture).querySelector<HTMLButtonElement>('.the-plan p.lead button')!.click();
    fixture.detectChanges();
    expect(said(last)).withContext('the button adds no word to the paragraph').toBe(MADE_UP[MADE_UP.length - 1].text!);
    last.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(all.slice(1).every(it => it.hidden)).withContext('closed again from the end').toBeTrue();
  });

  // Found by a review of this change: the second "less" stands in the last paragraph, which is hidden the moment
  // it is pressed, and the keyboard was left on nothing. It goes to the "more" the account was opened with.
  it('puts the keyboard on the first "more" when the account is closed from its end', () => {
    const fixture = create();
    const first = page(fixture).querySelector<HTMLButtonElement>('.the-plan p.lead button')!;
    first.click();
    fixture.detectChanges();
    const all = pieces(fixture);
    const last = all[all.length - 1].querySelector<HTMLButtonElement>('button')!;
    last.focus();
    last.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(first);
    first.click();
    fixture.detectChanges();
    expect(document.activeElement).withContext('opened again from the start: the keyboard stays where it is').toBe(first);
  });

  // The reasons ran in balanced columns: opening one re-flowed them all, and the others jumped sideways. They are
  // a grid now, in the plan's order across and then down, and each keeps its place.
  it('keeps every reason in its place when one of them is opened', () => {
    const long = 'A first sentence about this step of the plan. ' + 'A further sentence that says more about how it was tested. '.repeat(8);
    const fixture = create();
    (fixture.nativeElement as HTMLElement).style.width = '1900px';
    fixture.componentInstance.steps = ['BUY', 'KEEP', 'YOUR CALL', 'NO OPINION'].map(verb => step('hold', verb, long));
    fixture.detectChanges();
    const reasons = Array.from(page(fixture).querySelectorAll<HTMLElement>('.reasons .reason'));
    const lefts = () => reasons.map(it => Math.round(it.getBoundingClientRect().left));
    const before = lefts();
    expect(new Set(before).size).withContext('side by side in a wide box').toBeGreaterThan(1);
    reasons[0].querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(lefts()).withContext('after the first is opened').toEqual(before);
  });

  // Found by the same review: the box ran in balanced columns, so opening one item moved the others sideways, and
  // the opened account ran on into the next column under no heading. The plan stands across the box, on its own.
  it('keeps the plan as a whole apart from the reasons of today\'s steps, which follow in their own list', () => {
    const fixture = create();
    fixture.componentInstance.steps = [step('buy', 'BUY', 'Because A.'), step('hold', 'KEEP', 'Because B.')];
    fixture.detectChanges();
    const lists = Array.from(page(fixture).querySelectorAll('dl'));
    expect(lists.map(it => it.className)).toEqual(['the-plan', 'reasons']);
    expect(Array.from(lists[0].querySelectorAll('dt')).map(said)).toEqual(['THE PLAN']);
    expect(Array.from(lists[1].querySelectorAll('dt')).map(said)).toEqual(['BUY', 'KEEP']);
  });
});
