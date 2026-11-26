import {EVIDENCE, Figures, oneIn} from "./evidence";

/** One figure of the strip with its name; `risk` is set on the one that is a risk, not a gain. */
export type TestedFigure = { label: string, value: string, risk?: boolean };

/** What stocks with the mark did in the tests, as figures: a line that says of what, the figures, and their limits. */
export type TestedStrip = { title: string, figures: TestedFigure[], limits: string };

/**
 * The tested result of the mark as figures a reader can compare at a glance, in one place for every view that
 * shows them: what a stock marked DIP BUY gained over 6 months on average and typically (the typical one gained
 * less than the average, and stands beside it so that the average is not read alone), what any stock that dropped
 * and the market gained, and how many stocks with the mark fell a further 20% first. The risk is one of the
 * figures: shown without it, the gains were the upside in sight and the downside a click away.
 *
 * The same numbers as the sentence `CARD_NOTE` in evidence.ts (the six tested lists pooled), which stays the full
 * account behind "How to read this".
 */
export function testedStrip(f: Figures = EVIDENCE): TestedStrip {
  return {
    title: `In tests on ${f.stocks} stocks, over 6 months`,
    figures: [
      {label: 'DIP BUY, on average', value: gained(f.dipBuy.mean)},
      {label: 'DIP BUY, the typical one', value: gained(f.dipBuy.median)},
      {label: 'Any stock that dropped', value: gained(f.everyDip.mean)},
      {label: 'The market', value: gained(f.sp500.mean)},
      {label: 'DIP BUYs that fell a further 20% first', value: oneIn(f.dipBuy.fellPercent), risk: true},
    ],
    limits: `The typical one is the middle stock: half did better, half worse. Tested ${f.firstBuy.slice(0, 4)}–${f.lastBuy.slice(0, 4)} only.`,
  };
}

/** A gain in the tests as the sentences about them write it: a sign, one decimal, the true minus. */
function gained(percent: number): string {
  return `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${Math.abs(percent).toFixed(1)}%`;
}
