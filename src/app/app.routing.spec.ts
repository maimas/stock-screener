import {UrlSegment} from "@angular/router";
import {AppRoutes, pageView} from "./app.routing";

const segments = (path: string) => path.split('/').filter(part => part).map(part => new UrlSegment(part, {}));

describe('the app\'s addresses', () => {
  it('takes /portfolio and /watchlist as two views of one page, with the view\'s name as the route\'s parameter', () => {
    expect(pageView(segments('/portfolio'))?.posParams?.['view'].path).toBe('portfolio');
    expect(pageView(segments('/watchlist'))?.posParams?.['view'].path).toBe('watchlist');
    expect(pageView(segments('/watchlist'))?.consumed.length).toBe(1);
  });

  it('takes nothing else, so other addresses are left to the other routes', () => {
    ['/', '/dashboard', '/portfolios', '/Watchlist', '/watchlist/more', '/button'].forEach(path =>
      expect(pageView(segments(path))).withContext(path).toBeNull());
  });

  it('sends the start address and the old one to the portfolio view, and serves both views from a single route', () => {
    const children = AppRoutes[0].children!;
    expect(children.filter(it => it.redirectTo).map(it => [it.path, it.redirectTo]))
      .toEqual([['', '/portfolio'], ['dashboard', '/portfolio'], ['**', '/portfolio']]);
    // An address that is no page of the app leads to the portfolio's view: it used to be a blank page.
    expect(children[children.length - 1].path).withContext('the catch-all comes last').toBe('**');
    expect(children.filter(it => it.matcher === pageView).length).toBe(1);
    // One route for both: Angular then keeps the page when only the view's name changes.
    expect(children.findIndex(it => it.matcher === pageView))
      .withContext('before the catch-all for the template\'s other pages').toBeLessThan(children.length - 1);
  });
});
