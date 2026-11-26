import {EVIDENCE, Figures} from "./evidence";

/** One figure of the strip with its name; `risk` is set on the one that is a risk, not a gain. */
export type TestedFigure = { label: string, value: string, risk?: boolean };

/**
 * What stocks with the mark did in the tests, as figures: a line that says of what, the figures, their limits, and
 * the sentence that leads from them into the account of all the tested lists.
 */
export type TestedStrip = { title: string, figures: TestedFigure[], limits: string, bridge: string };

/**
 * The tested result of the mark as figures a reader can compare at a glance, in one place for every view that
 * shows them (the owner: one strip on both views): what a stock marked DIP BUY gained over 6 months on average and
 * typically (the typical one gained less than the average, and stands beside it so that the average is not read
 * alone), what the market gained, and how much the worst tenth lost. The risk is one of the figures: shown without
 * it, the gains were the upside in sight and the downside a click away.
 *
 * The figures are those of the newest test (the owner's choice between it and all lists pooled): the stocks that no
 * earlier test had used, on the question written down before the test, "does following the plan make a profit". It
 * is the more sober of the two results. The account of all the tested lists together (`CARD_NOTE` in evidence.ts)
 * stays behind "How to read this"; `bridge` leads into it there.
 */
export function testedStrip(f: Figures = EVIDENCE): TestedStrip {
  const newest = f.seventh;
  return {
    title: `In tests on ${newest.stocks} new stocks, over 6 months`,
    figures: [
      {label: 'DIP BUY, on average', value: gained(newest.profit.mean)},
      {label: 'DIP BUY, the typical one', value: gained(newest.profit.typical)},
      {label: 'The market', value: gained(newest.market.sp500)},
      {label: '1 in 10 DIP BUYs lost', value: `${newest.profit.worstTenth}% or more`, risk: true},
    ],
    // The years are the span of all the tested lists, the newest among them: the newest list records none of its own.
    limits: `The typical one is the middle stock: half did better, half worse. The tests cover ${f.firstBuy.slice(0, 4)}–${f.lastBuy.slice(0, 4)} only.`,
    bridge: `The figures above are from the newest test, on ${newest.stocks} stocks that no earlier test had used. All the tested lists together:`,
  };
}

/** A gain in the tests as the sentences about them write it: a sign, one decimal, the true minus. */
function gained(percent: number): string {
  return `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${Math.abs(percent).toFixed(1)}%`;
}
