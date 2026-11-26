/**
 * "Find a stock", above the lists: thirty stocks stand in seven lists, each sorted by itself, and the eye had to
 * go down every one of them to find a symbol. The reader types a symbol or a part of the company's name and
 * presses Enter; the page opens that stock's row.
 *
 * It looks a stock up among the ones already in the lists. It does not search the market, and it suggests nothing.
 */

/** A stock that can be found: its symbol and, where the page knows it, the company's name. */
export type Findable = { symbol: string, name: string };

/**
 * The stock a query means, or nothing when no stock in the lists fits it. The symbol is what a reader types most,
 * so it is tried first: the symbol itself, then a symbol that begins with what was typed, then a company's name
 * that begins with it, then a name that holds it anywhere. Among several that fit equally, the first from A to Z.
 */
export function findSymbol(query: string, stocks: readonly Findable[]): string | undefined {
  return findMatches(query, stocks)[0];
}

/**
 * Every stock that fits a query equally well, from A to Z: the first is the one that opens. What was typed may be
 * the beginning of several symbols or a word in several companies' names; the page then names the others, so that
 * the reader knows the row that opened was one of several.
 */
export function findMatches(query: string, stocks: readonly Findable[]): string[] {
  const typed = query.trim().toLowerCase();
  if (!typed) {
    return [];
  }
  const sorted = [...stocks].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const tries: ((stock: Findable) => boolean)[] = [
    stock => stock.symbol.toLowerCase() === typed,
    stock => stock.symbol.toLowerCase().startsWith(typed),
    stock => stock.name.toLowerCase().startsWith(typed),
    stock => stock.name.toLowerCase().includes(typed),
  ];
  for (const fits of tries) {
    const found = sorted.filter(fits);
    if (found.length > 0) {
      return found.map(stock => stock.symbol);
    }
  }
  return [];
}

/** Said beside the field after a stock was opened that was one of several: which others fit what was typed. */
export function alsoFits(query: string, others: readonly string[]): string {
  const named = others.slice(0, 4).join(', ');
  const more = others.length > 4 ? ` and ${others.length - 4} more` : '';
  return others.length === 0 ? '' : `"${query.trim()}" also fits ${named}${more}.`;
}

/** Said beside the field when nothing in the lists fits what was typed. */
export function notFound(query: string): string {
  return `"${query.trim()}" is not in your lists. "Edit list" on a list adds a stock.`;
}
