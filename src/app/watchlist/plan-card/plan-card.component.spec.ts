import {TestBed} from "@angular/core/testing";
import {PlanCardComponent} from "./plan-card.component";
import {PlanStep, StepKind} from "../plan";
import {testedStrip} from "../tested-strip";

const step = (kind: StepKind): PlanStep => ({kind, verb: kind, text: 'What to do.', why: 'Why.', items: []});
const cardWith = (...kinds: StepKind[]) => Object.assign(new PlanCardComponent(), {steps: kinds.map(step)});

describe('PlanCardComponent', () => {
  // The steps here carry their kind as their verb, so 'trim' stands for SELL SOME and 'buy' for BUY.
  it('says what there is to do by name, not how many things: the steps that ask for something, in the plan\'s order', () => {
    expect(cardWith('missing', 'setup', 'trim', 'review', 'timing', 'buy', 'hold', 'outside').headline)
      .toBe('To do today: missing, setup, trim, review, buy.');
    expect(cardWith('setup', 'hold').headline).toBe('To do today: setup.');
  });

  it('says there is nothing to do when no step asks for anything', () => {
    expect(cardWith('timing', 'hold', 'outside').headline).toBe('Nothing to do today.');
    expect(cardWith().headline).toBe('Nothing to do today.');
  });

  it('does not name the lines that only say when or how many', () => {
    expect(cardWith('timing', 'spread', 'hold').headline).toBe('Nothing to do today.');
    expect(cardWith('trim', 'timing', 'spread').headline).toBe('To do today: trim.');
  });

  it('tells a step that asks for something from one that only says where things stand', () => {
    const card = cardWith('trim', 'timing', 'buy', 'spread');
    expect(card.shownSteps.map(it => card.asks(it))).toEqual([true, false, true, false]);
  });

  it('leaves "keep" and "no opinion" to the table under it, where each stock says it once, in its own row', () => {
    const card = cardWith('news', 'trim', 'timing', 'buy', 'spread', 'hold', 'outside');
    expect(card.shownSteps.map(it => it.kind)).toEqual(['news', 'trim', 'timing', 'buy', 'spread']);
    expect(card.headline).withContext('it is about the whole plan').toBe('To do today: trim, buy.');
  });

  it('shows no steps while prices are still arriving: a plan worked out from half of them would be wrong', () => {
    const card = cardWith('trim', 'timing');
    expect(card.shownSteps.map(it => it.kind)).toEqual(['trim', 'timing']);
    card.loading = true;
    expect(card.shownSteps).toEqual([]);
  });

  it('calls the plan empty only when it has no step at all, not when every step is in the table', () => {
    const card = cardWith();
    expect(card.empty).toBe(true);
    expect(cardWith('hold', 'outside').empty).toBe(false);
    card.loading = true;
    expect(card.empty).withContext('not known while prices are arriving').toBe(false);
  });

  it('keeps the evidence off the card: the tested figures, one quiet line, and a way to the rest', () => {
    const card = cardWith('buy');
    expect(card.tested).toEqual(testedStrip());
    expect(card.disclaimer).toBe('Not advice; no guarantee.');
    let asked = 0;
    card.tests.subscribe(() => asked++);
    card.showTests();
    expect(asked).toBe(1);
  });
});

// The owner's word, after a review: the plan's box said "In tests on new stocks: +9.3% ... (the market: +10.2%)" in
// a sentence, a gain without its loss, while the Watchlist gave another test's +13.1% for the same mark. Both pages
// now show one strip of figures, from the newest test (the owner's choice between it and all lists pooled).
describe('PlanCardComponent: what the plan did in its test, as figures', () => {
  function shown(): HTMLElement {
    const fixture = TestBed.createComponent(PlanCardComponent);
    Object.assign(fixture.componentInstance, {steps: [step('buy')]});
    fixture.detectChanges();
    return fixture.nativeElement;
  }
  const said = (el?: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('shows the same strip as the Watchlist: of what, then four figures with their names, the risk among them', () => {
    const el = shown(), strip = testedStrip();
    expect(said(el.querySelector('.record .tested-title'))).toBe(strip.title);
    expect(strip.title).toMatch(/^In tests on \d+ new stocks, over 6 months$/);
    const figures = Array.from(el.querySelectorAll('.record dl.facts > div'));
    expect(figures.map(it => [said(it.querySelector('dt')), said(it.querySelector('dd'))])).toEqual(strip.figures.map(it => [it.label, it.value]));
    expect(figures.map(it => said(it.querySelector('dt')))).toEqual(['DIP BUY, on average', 'DIP BUY, the typical one', 'The market', '1 in 10 DIP BUYs lost']);
    expect(figures.map(it => it.classList.contains('risk'))).withContext('the loss is one of the figures, and marked as the risk').toEqual([false, false, false, true]);
  });

  it('says under the figures what they are limited to and that this is no advice, and leads to the tests', () => {
    const el = shown();
    expect(said(el.querySelector('.record .tested-limits .words'))).toBe(`${testedStrip().limits} Not advice; no guarantee.`);
    const way = el.querySelector<HTMLButtonElement>('.record button.more')!;
    expect(said(way)).toBe('How it was tested');
    expect(el.textContent).withContext('the sentence the strip replaced is gone from the box').not.toContain('In tests on new stocks:');
  });
});

describe('PlanCardComponent, as shown', () => {
  function shown(steps: PlanStep[], loading = false): HTMLElement {
    const fixture = TestBed.createComponent(PlanCardComponent);
    Object.assign(fixture.componentInstance, {steps, loading});
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  const verbs = (el: HTMLElement) => Array.from(el.querySelectorAll('.step .plan-verb')).map(it => it.textContent?.trim());

  it('is a part of the portfolio\'s box: no box and no title of its own', () => {
    const el = shown([step('buy')]);
    expect(el.querySelector('mat-card')).toBeNull();
    expect(el.querySelector('h1, h2, h3')).toBeNull();
  });

  it('starts with what there is to do, then a line a step', () => {
    const el = shown([step('news'), step('buy'), step('hold'), step('outside')]);
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('To do today: buy.');
    expect(verbs(el)).toEqual(['news', 'buy']);
  });

  it('says "Nothing to do today" once when the plan has no step at all', () => {
    const text = shown([]).textContent ?? '';
    expect(text.match(/Nothing to do today/g)?.length).toBe(1);
    expect(text).toContain('this portfolio is empty');
  });

  it('says nothing about the portfolio being empty when its steps are all in the table', () => {
    const el = shown([step('hold')]);
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('Nothing to do today.');
    expect(el.textContent).not.toContain('this portfolio is empty');
    expect(verbs(el)).toEqual([]);
  });

  // On a laptop the box the BUY line points to is two screens down. Its name in the sentence is the way there;
  // the sentence itself reads as it did.
  it('makes the name of the "Could add" box, where a line says it, a jump to that box', () => {
    const fixture = TestBed.createComponent(PlanCardComponent);
    const sentence = '2 stocks could be added: see "Could add" for the size of each.';
    Object.assign(fixture.componentInstance, {steps: [{...step('buy'), text: sentence}, step('timing')]});
    let asked = 0;
    fixture.componentInstance.couldAdd.subscribe(() => asked++);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const lines = Array.from(el.querySelectorAll('.step .text'));
    expect(lines.map(it => it.textContent?.replace(/\s+/g, ' ').trim())).toEqual([sentence, 'What to do.']);

    const jump = lines[0].querySelector('button') as HTMLButtonElement;
    expect(jump.textContent?.trim()).toBe('"Could add"');
    expect(lines[1].querySelector('button')).withContext('a line that names no box has nothing to press').toBeNull();
    jump.click();
    expect(asked).toBe(1);
  });

  // With no room for larger type, colour is what makes the lead the first thing seen: each verb in it wears the
  // colour of its own mark in the lines under it, so the two are read as the same thing.
  it('sets each verb of the lead apart, by the kind of its step, and leaves the sentence as it is', () => {
    const el = shown([step('trim'), step('timing'), step('buy')]);
    const lead = el.querySelector('.count')!;
    expect(lead.textContent?.replace(/\s+/g, ' ').trim()).toBe('To do today: trim, buy.');
    expect(Array.from(lead.querySelectorAll('.lead-verb')).map(it => [it.textContent, Array.from(it.classList).filter(c => c !== 'lead-verb').join(' ')]))
      .toEqual([['trim', 'trim'], ['buy', 'buy']]);
    expect(shown([step('timing')]).querySelector('.count .lead-verb')).withContext('"Nothing to do today." has no verb').toBeNull();
  });

  // Found by a measurement of the page: on every key press the box built the verbs of its lead anew (they are
  // worked out on each look, and the loop over them had no way to know them again). Nothing that is rebuilt
  // between a press and its release can be clicked, and the same fault had made a table of the Watchlist dead.
  it('builds nothing anew when the page is looked at again: the lead, the lines and their stocks stay the same nodes', () => {
    const fixture = TestBed.createComponent(PlanCardComponent);
    const sentence = '2 stocks could be added: see "Could add" for the size of each.';
    Object.assign(fixture.componentInstance, {
      steps: [{...step('trim'), items: [{symbol: 'ACME', label: 'keep $590'}]}, step('timing'), {...step('buy'), text: sentence}],
    });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const nodes = () => Array.from(el.querySelectorAll('.count .lead-verb, .step, .step .item, .step .text, .step .jump'));
    const before = nodes();
    expect(before.length).withContext('two verbs, three lines with their sentences, one stock, one jump').toBe(10);
    let changed = 0;
    const watch = new MutationObserver(records => changed += records.reduce((sum, it) => sum + it.addedNodes.length + it.removedNodes.length, 0));
    watch.observe(el, {childList: true, subtree: true});
    fixture.detectChanges();
    fixture.detectChanges();
    changed += watch.takeRecords().reduce((sum, it) => sum + it.addedNodes.length + it.removedNodes.length, 0);
    watch.disconnect();
    expect(changed).withContext('nodes added or taken away by two more looks').toBe(0);
    nodes().forEach((node, at) => expect(node).withContext(`node ${at}`).toBe(before[at]));
  });

  // The lead can read the same for weeks ("To do today: BUY."). The line that differs from one day to the next is
  // what changed since the last day: on a day something did, it is set firmer; on a day nothing did, quieter.
  it('sets the line about what changed apart: firm on a day something changed, quiet when nothing did', () => {
    const news = (text: string, symbols: string[] = []): PlanStep =>
      ({kind: 'news', verb: 'WHAT\'S NEW', text, why: 'Why.', items: symbols.map(symbol => ({symbol, label: 'new to buy'}))});
    const classes = (first: PlanStep) => {
      const line = shown([first, step('buy')]).querySelector('.step.news')!;
      return [line.classList.contains('changed'), line.classList.contains('unchanged')];
    };
    expect(classes(news('Nothing changed since yesterday.'))).toEqual([false, true]);
    expect(classes(news('Since yesterday.', ['ACME']))).toEqual([true, false]);
    expect(classes(news('Since Nov 18. The market turned fearful.'))).withContext('no stock named, but the market turned').toEqual([true, false]);
    const other = shown([news('Nothing changed since yesterday.'), step('buy')]).querySelector('.step.buy')!;
    expect([other.classList.contains('changed'), other.classList.contains('unchanged')]).withContext('only that line').toEqual([false, false]);
  });

  it('shows neither a count nor steps while prices are still arriving', () => {
    const el = shown([step('buy')], true);
    expect(el.querySelector('.count')).toBeNull();
    expect(verbs(el)).toEqual([]);
    expect(el.textContent).toContain('Working it out from today\'s prices.');
  });
});

// Found by a review of the page: on a day the data source did not answer, the plan box said "Working it out from
// today's prices." for good, and only the bar at the far end of the window said that the load had failed.
describe('PlanCardComponent: when the plan cannot be worked out', () => {
  function shown(instead: string) {
    const fixture = TestBed.createComponent(PlanCardComponent);
    Object.assign(fixture.componentInstance, {steps: [], loading: true, instead});
    fixture.detectChanges();
    return {fixture, el: fixture.nativeElement as HTMLElement};
  }

  it('says why in place of the plan, as an alert, and no longer that it is working', () => {
    const {el} = shown('Today\'s prices could not be loaded.');
    const box = el.querySelector('.instead')!;
    expect(box.getAttribute('role')).toBe('alert');
    expect(box.querySelector('p')!.textContent).toBe('Today\'s prices could not be loaded.');
    expect(el.querySelector('.waiting')).toBeNull();
  });

  it('offers "Try again" right there', () => {
    const {fixture, el} = shown('Today\'s prices could not be loaded.');
    let asked = 0;
    fixture.componentInstance.retry.subscribe(() => asked++);
    const again = el.querySelector<HTMLButtonElement>('.instead button')!;
    expect(again.textContent!.trim()).toBe('Try again');
    again.click();
    expect(asked).toBe(1);
  });

  it('says that it is working while it is, and nothing in its place', () => {
    const {el} = shown('');
    expect(el.querySelector('.instead')).toBeNull();
    expect(el.querySelector('.waiting')!.textContent).toContain('Working it out');
  });
});
