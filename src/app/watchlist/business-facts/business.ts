import {Metrics, Stock} from "../../api/microsoft-money.service";

/** One figure about the business: its name in plain words, the trade's word for it, the figure, and its industry's. */
export type BusinessRow = { label: string, tip: string, value: string, industry: string };

/** A company the data source lists beside this one: its symbol, and its name for the pointer. */
export type Similar = { symbol: string, name: string };

/** `more`: how many companies the data source lists beyond the ones in `similar`. */
export type Business = { rows: BusinessRow[], similar: Similar[], more: number, does: string };

const MINUS = '−';
/**
 * The most companies shown beside a stock, in the order the data source lists them: it lists seven beside one
 * stock and fourteen beside another, and fourteen symbols filled five lines of a 380px column.
 */
const MOST_SIMILAR = 8;
/** Two sentences of a description longer than this are a paragraph: the first one is kept alone. */
const LONGEST_DOES = 320;

/**
 * The two figures, of the thirty the data source sends for a company and for its industry: the ones the research
 * ties to an advantage that lasts (what is kept of sales, what is earned on the money in the business), both as
 * averages of five years so that one good or bad year does not decide them.
 */
const FIGURES: { field: keyof Metrics, label: string, tip: string }[] = [
  {
    field: 'averageGrossMargin5Year',
    label: 'Keeps of its sales',
    tip: 'Gross margin, the average of the last 5 years: what is left of each $100 of sales after the cost of making what was sold.',
  },
  {
    field: 'returnOnCapital5YearAverage',
    label: 'Earns on money invested',
    tip: "Return on capital, the average of the last 5 years: a year's profit for each $100 that owners and lenders have put into the business.",
  },
];

/** What the feed puts on a company beside its figures: the companies it lists with it. (Not in the feed's types.) */
type Related = { symbol?: string, displayName?: string, shortName?: string };

/**
 * What the data source already sends about the business, for a stock's details: two figures beside the industry's,
 * the companies listed beside this one, and what the company does. The owner asked to see it ("show the MSN moat
 * info"). None of it was tested and none of it is part of the mark: no figure here is called good or bad.
 */
export function businessOf(stock: Stock | undefined): Business {
  const analysis = stock?.equity?.analysis;
  const rows = FIGURES
    .map(({field, label, tip}) => ({label, tip, own: analysis?.companyMetrics?.[field], industry: analysis?.industryMetrics?.[field]}))
    .filter(it => isFigure(it.own))
    .map(it => ({label: it.label, tip: it.tip, value: wholePercent(it.own as number), industry: isFigure(it.industry) ? `its industry ${wholePercent(it.industry)}` : ''}));

  const own = stock?.quote?.symbol;
  const related = ((stock?.equity as { relatedStocks?: Related[] } | undefined)?.relatedStocks ?? []);
  const listed: Similar[] = [];
  related.forEach(it => {
    if (it?.symbol && it.symbol !== own && !listed.some(known => known.symbol === it.symbol)) {
      listed.push({symbol: it.symbol, name: it.displayName || it.shortName || ''});
    }
  });
  const similar = listed.slice(0, MOST_SIMILAR);

  return {rows, similar, more: listed.length - similar.length, does: firstSentences(stock?.equity?.company?.description ?? '')};
}

/**
 * What stands beside the section's title. The page has one name for what no test used, "Context, not part of the
 * mark" (the heading of the section after this one in a stock's details): the same words here, not a second phrase.
 */
export const BUSINESS_NOTE = 'context, not part of the mark';

/** How to read the section, for who opens the details' sentences: what the figures are, and what is not known. */
export const BUSINESS_HOW_TO_READ =
  'Both figures are averages of the last 5 years from the data source (MSN): what the company keeps of its sales ' +
  '(gross margin) and what it earns on the money invested in it (return on capital), each beside the average of ' +
  'its industry. Whether a figure above its industry says anything about the price was not tested. ' +
  'The data source does not say how it picks the similar companies, and it gives no market share.';

/**
 * The listed companies by name, as a sentence. In the row they stand as symbols with the name on the pointer, which
 * a reader by keyboard or by screen reader does not have: the names are here for them, and no symbol is a stop of
 * the Tab key.
 */
export function similarLine(similar: Similar[], more = 0): string {
  if (similar.length === 0) {
    return '';
  }
  const names = similar.map(it => it.name ? `${it.name} (${it.symbol})` : it.symbol).join(', ');
  return `Similar companies, as the data source lists them: ${names}${more > 0 ? `, and ${more} more` : ''}.`;
}

/**
 * There is a figure or a listed company to show. A description alone is not enough: it stands behind the
 * details' sentences, and a section with nothing in sight would be a heading over nothing.
 */
export function hasBusiness(business: Business): boolean {
  return business.rows.length > 0 || business.similar.length > 0;
}

/** Percentages beyond this are not a margin or a return: the data source fills gaps with numbers like −99,999,901. */
const LARGEST_PERCENT = 1000;

/** A number the data source gave that can be a percentage of sales or of capital. */
function isFigure(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= LARGEST_PERCENT;
}

/** "62%", "−13%": a whole percentage; a figure that rounds to nothing is "0%", never "−0%". */
function wholePercent(value: number): string {
  const size = Math.round(Math.abs(value));
  return `${value < 0 && size > 0 ? MINUS : ''}${size}%`;
}

/** The first two sentences of a description, or the first alone when the two together would be a paragraph. */
function firstSentences(text: string): string {
  const sentences = text.trim().split(/(?<=[.!?])\s+(?=[A-Z])/);
  const two = sentences.slice(0, 2).join(' ');
  return two.length > LONGEST_DOES ? sentences[0] : two;
}
