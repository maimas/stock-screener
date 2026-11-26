import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';

import { FullComponent } from './layouts/full/full.component';
import { PAGE_VIEWS } from './watchlist/page-view';

/**
 * /portfolio and /watchlist are two views of ONE page. Both addresses match this one route, with the view's name
 * as its parameter, so going from one to the other keeps the page that is there (and the prices it has loaded)
 * and only changes which part of it is shown. Two routes would build the page again on every switch.
 */
export function pageView(segments: UrlSegment[]): UrlMatchResult | null {
  return segments.length === 1 && (PAGE_VIEWS as readonly string[]).includes(segments[0].path)
    ? {consumed: segments, posParams: {view: segments[0]}} : null;
}

export const AppRoutes: Routes = [
  {
    path: '',
    component: FullComponent,
    children: [
      {
        path: '',
        redirectTo: '/portfolio',
        pathMatch: 'full'
      },
      {
        // The page's address before it had two views.
        path: 'dashboard',
        redirectTo: '/portfolio',
        pathMatch: 'full'
      },
      {
        matcher: pageView,
        loadChildren: () => import('./dashboard/dashboard.module').then(m => m.DashboardModule)
      },
      {
        path: '',
        loadChildren:
          () => import('./material-component/material.module').then(m => m.MaterialComponentsModule)
      },
      {
        // An address that is no page of the app (a slip of the hand: /portfolios, /Watchlist, /watchlist/ACME)
        // used to show the bar over an empty page, with no way on. It leads to the portfolio's view.
        path: '**',
        redirectTo: '/portfolio'
      }
    ]
  }
];
