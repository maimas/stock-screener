import {NO_ERRORS_SCHEMA} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {FullComponent} from "./full.component";
import {PriceStatusService} from "../../watchlist/price-status.service";

describe('FullComponent: the frame around the page', () => {
  function shown() {
    TestBed.configureTestingModule({declarations: [FullComponent], schemas: [NO_ERRORS_SCHEMA]});
    const fixture = TestBed.createComponent(FullComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return {fixture, el, status: TestBed.inject(PriceStatusService), button: () => el.querySelector('header button') as HTMLButtonElement};
  }

  it('names the app in the one top heading of the page, in a bar above the page itself', () => {
    const {el} = shown();
    expect(el.querySelectorAll('h1').length).toBe(1);
    // What the heading says to someone who hears it: the icon beside the name is hidden from them.
    const heading = el.querySelector('header h1')!.cloneNode(true) as HTMLElement;
    heading.querySelectorAll('[aria-hidden="true"]').forEach(part => part.remove());
    expect(heading.textContent?.trim()).toBe('Stock Screener');
    expect(el.querySelector('main router-outlet')).withContext('the page is the main part').not.toBeNull();
  });

  // About a hundred tab stops stand between the bar and some parts of the page: the first one leads past the bar.
  it('offers a way past the bar as the first stop of the Tab key, and puts the keyboard into the page', () => {
    const {el} = shown();
    const first = el.querySelector('a, button') as HTMLAnchorElement;
    expect(first.textContent?.trim()).toBe('Skip to the page');
    first.click();
    expect(document.activeElement).toBe(el.querySelector('main'));
  });

  it('offers the two views by name, each at its own address, as the navigation of the app', () => {
    const {el} = shown();
    const links = Array.from(el.querySelectorAll('header nav[aria-label="Views"] a'));
    expect(links.map(link => link.textContent?.trim())).toEqual(['Portfolio', 'Watchlist']);
    expect(links.map(link => link.getAttribute('routerLink'))).toEqual(['/portfolio', '/watchlist']);
  });

  it('asks for the prices to be loaded again when "Reload prices" is clicked', () => {
    const {status, button} = shown();
    let asked = 0;
    status.reload$.subscribe(() => asked++);
    expect(button().textContent).toContain('Reload prices');
    button().click();
    expect(asked).toBe(1);
  });

  it('says so while prices are loading, and cannot be asked again until they are in', () => {
    const {fixture, status, button} = shown();
    status.pending = 2;
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('Loading prices');
    status.pending = 0;
    fixture.detectChanges();
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('Reload prices');
  });

  // Found by a review of the page: with the network cut, "Reload prices" went back to rest in half a second and
  // said nothing, and the reader believed the prices were fresh.
  it('says so when a reload failed: that the prices are the old ones and from when, with "Try again"', () => {
    const {fixture, el, status, button} = shown();
    const line = () => el.querySelector('header .failed')!;
    expect(line().getAttribute('role')).toBe('status');
    expect(line().textContent?.trim()).withContext('nothing while all is well').toBe('');
    status.latest = new Date(2026, 10, 20, 15, 7);
    status.failed = true;
    fixture.detectChanges();
    const said = line().cloneNode(true) as HTMLElement;
    said.querySelectorAll('[aria-hidden="true"]').forEach(part => part.remove());
    expect(said.textContent?.trim()).toMatch(/^Prices could not be reloaded\. Showing those of .*20.*\.$/);
    expect(el.querySelector('header .as-of')).withContext('in place of the quiet time').toBeNull();
    expect(button().textContent).toContain('Try again');
  });

  it('waits with that while another try is under way, and takes it back once the prices are in', () => {
    const {fixture, el, status, button} = shown();
    status.latest = new Date(2026, 10, 20, 15, 7);
    status.failed = true;
    status.pending = 1;
    fixture.detectChanges();
    expect(el.querySelector('header .failed')!.textContent?.trim()).toBe('');
    expect(button().textContent).toContain('Loading prices');
    status.failed = false;
    status.pending = 0;
    fixture.detectChanges();
    expect(el.querySelector('header .as-of')?.textContent).toContain('Prices as of');
    expect(button().textContent).toContain('Reload prices');
  });

  it('says that the prices could not be loaded at all when there are none from before', () => {
    const {fixture, el, status} = shown();
    status.failed = true;
    fixture.detectChanges();
    expect(el.querySelector('header .failed')!.textContent).toContain('Prices could not be loaded.');
  });

  // Found by a review of the page: outside market hours a reload brings the same prices, "Prices as of" stayed as
  // it was, and nothing showed that the reload had happened.
  it('says when the prices were last loaded, beside how old the newest one is', () => {
    const {fixture, el, status} = shown();
    status.latest = new Date(2026, 10, 20, 15, 7);
    fixture.detectChanges();
    expect(el.querySelector('header .checked')).withContext('not before a full load').toBeNull();
    status.checked = new Date(2026, 10, 20, 23, 41);
    fixture.detectChanges();
    const text = el.querySelector('header .as-of')?.textContent ?? '';
    expect(text).toMatch(/Prices as of .* · checked .*41/);
  });

  it('says how fresh the prices are once one has loaded, and nothing before', () => {
    const {fixture, el, status} = shown();
    expect(el.querySelector('header .as-of')).toBeNull();
    status.latest = new Date(2026, 10, 20, 15, 7);
    fixture.detectChanges();
    const text = el.querySelector('header .as-of')?.textContent ?? '';
    expect(text).toContain('Prices as of');
    expect(text).withContext('the day').toContain('20');
    expect(text).withContext('the minute').toContain(':07');
  });
});
