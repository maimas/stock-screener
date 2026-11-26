/**
 * The two views of the one page: the portfolio's (what you own, what could be added to it, what to do) and the
 * watchlist's (what is marked, and your lists). Both read the same prices; the address says which one is shown.
 */
export type PageView = 'portfolio' | 'watchlist';

export const PAGE_VIEWS: readonly PageView[] = ['portfolio', 'watchlist'];

/** The view a part of an address names; the portfolio's for anything else. */
export function toPageView(name: string | null | undefined): PageView {
  return name === 'watchlist' ? 'watchlist' : 'portfolio';
}
