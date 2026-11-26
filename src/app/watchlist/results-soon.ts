/**
 * That the company is about to report its results, and what that does to the mark: said in the page's own words
 * ("reports its results", "mark"), for today, tomorrow or a number of days.
 *
 * In a file of its own, without a component: a stock's details say it, and so does the comparison of the ticked
 * stocks in "Could add" (case-against.ts), in the same words.
 */
export function resultsSoonLine(days: number): string {
  return `Reports its results ${earningsWhen(days)}: the price may swing, and the report will change the growth numbers this mark rests on.`;
}

/** "today", "tomorrow" or "in 6 days". */
export function earningsWhen(days: number): string {
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}
