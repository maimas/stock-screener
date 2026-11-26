'use strict';
/**
 * The step between the backtests and the app's texts.
 *
 * The backtests record what they measured in tools/signal-backtest/quoted_figures.json. This module rounds those
 * measurements to the numbers the app quotes (toFigures) and writes them as a TypeScript module (render). Before
 * anything is written it checks that the statements the app makes in words still hold (check). When one does not,
 * the update stops: changing what the app claims is a decision for the user, not for a scheduled job.
 */

/** Returns are quoted to one decimal. (Adding 0 turns a rounded "-0" into 0.) */
const one = value => Number(value.toFixed(1)) + 0;
/** Shares of cases are quoted as whole percents, rounded from the one-decimal figure as a reader would. */
const whole = value => Math.round(one(value)) + 0;
const percent = rate => whole(rate * 100);

/** The script that records each section of the figures file. */
const SECTIONS = {
  summary: 'backtest_summary.py',
  fresh: 'backtest_validation3.py',
  sixth: 'backtest_validation4.py',
  seventh: 'backtest_validation5.py',
  eighth: 'backtest_validation6.py',
  plan: 'backtest_plan.py',
  regime: 'backtest_regime.py',
  sentiment: 'backtest_sentiment.py',
  several: 'backtest_several.py',
};

/** A re-run with newer data may lose a few companies (taken over, delisted), but not this many: that is a failed download. */
const MIN_SHARE_OF_STOCKS = 0.9;
const MIN_SHARE_OF_DIP_BUYS = 0.7;
/** "The typical result was about the same": medians within this many points of each other. */
const ABOUT_THE_SAME_POINTS = 2;
/** "A rising market": the S&P 500 gained at least this much on average over the same 26 weeks. */
const RISING_MARKET_PERCENT = 5;
/** "The fast fallers beat the others bought in the same week N% of the time" needs this many weeks with both kinds. */
const MIN_WEEKS_COMPARED = 12;
/** From this share of weeks ahead, "no dependable way to order DIP BUYs" would no longer be a fair summary. */
const DEPENDABLE_FROM = 0.6;
/** "The average comes from a few big winners": the typical result is under this share of the average. */
const FEW_WINNERS_SHARE = 0.6;
/** The replay of the plan says how many monthly batches were up: with fewer than a year of them it says nothing. */
const MIN_PLAN_MONTHS = 12;
/** "Holding several does not change the average": the two averages are within this many points of each other. */
const SAME_AVERAGE_POINTS = 1;

/**
 * "The market was rising (for N% of the purchases in the test of selling early it rose ...)": the share the app
 * gives beside "rising" has to be most of them, or the two would contradict each other.
 */
const MOSTLY_ROSE_PERCENT = 60;
/** The last bits of a float do not decide whether a recorded gap reaches its mark (as in backtest_validation6.py). */
const EPSILON = 1e-9;

/**
 * What pre-registered #9 decided on its first whole download (2026-11-25, 201 of the 202 stocks kept back for it):
 * taking a profit at +15% passed both ways, at +25% neither. That download is the result. The app offers a level by a
 * way only where this says PASS, and only while it still passes: a later download can stop an update, never add
 * an offer.
 */
const TAKE_PROFIT_REGISTERED = {seen15: 'PASS', seen25: 'FAIL', order15: 'PASS', order25: 'FAIL'};

/**
 * Ways that failed on that first download, pass since, and were left not offered by the owner, with the day of the
 * decision. Since 2026-11-26 the test reads the corrected bars (see backtest_validation6.py), and with them a sell
 * order at +25% reaches its second mark, which it had missed by a tenth of a point. Asked that day, the owner left
 * it not offered. So nothing is noted for it at an update; any other way that turns to PASS is still noted.
 */
const TAKE_PROFIT_LEFT_OUT = {order25: '2026-11-26'};

/** The two ways of taking a profit, as the messages of the checks name them. */
const TAKE_PROFIT_WAYS = {
  order: level => `a sell order placed in advance at +${level}%`,
  seen: level => `selling after a week closed +${level}% up or more`,
};

/**
 * Taking a profit (pre-registered #9, backtest_validation6.py, on the eighth list): each way of selling at each
 * level, beside keeping for the 6 months. Shares of positions are whole percents; results and bad cases have one
 * decimal, because two of them are set side by side and the difference matters.
 *  - `passed`: the rule passed on the first whole download (TAKE_PROFIT_REGISTERED) and passes now. The app offers
 *    a level only by a way for which this holds.
 *  - `milder` is that test's reading of the bad case (the gap as recorded reaches the mark written down, 2 points):
 *    "milder" then, "about as bad" under it. `milderPoints` is the difference of the two bad cases as printed.
 *  - `reached`: of the positions the rule would have sold, how many still ended with a loss when kept, and what
 *    they made on average kept and sold.
 * An INCONCLUSIVE run gives only `decided: false`: there is nothing to quote.
 */
function takeProfitFigures(e) {
  if (Object.values(e.verdicts).some(verdict => verdict === 'INCONCLUSIVE')) {
    return {stocks: e.stocks, decided: false};
  }
  const keptBad = one(-e.holding.badCase);
  const rule = (t, key) => ({
    passed: t.verdict === 'PASS' && TAKE_PROFIT_REGISTERED[key] === 'PASS',
    lossPercent: whole(t.lossRate), badLoss: one(-t.badCase), mean: one(t.mean), typical: one(t.median),
    // Printed by the script without a decimal ("sold early on 59%"), so rounded once.
    soldPercent: Math.round(t.soldEarly),
    milder: t.badCaseMilder.gap >= t.badCaseMilder.mark - EPSILON, milderPoints: one(keptBad - one(-t.badCase)),
    reached: {
      lossPercentKept: whole(t.whenReached.lossWhenKept), meanKept: one(t.whenReached.meanWhenKept), meanSold: one(t.whenReached.meanWhenSold),
    },
  });
  const byLevel = way => Object.fromEntries(
    Object.keys(e.takeProfit[way]).map(level => [level, rule(e.takeProfit[way][level], `${way}${level}`)]));
  return {
    // The script prints this share without a decimal, so it is rounded once (91.45 is 91%, not 92%).
    stocks: e.stocks, decided: true, firstBuy: e.firstBuy, lastBuy: e.lastBuy,
    marketRosePercent: e.marketRose === null || e.marketRose === undefined ? null : Math.round(e.marketRose),
    keeping: {mean: one(e.holding.mean), typical: one(e.holding.median), lossPercent: whole(e.holding.lossRate), badLoss: keptBad},
    // Sold once seen, but looking every second or every fourth week only: how many ended with a loss.
    // (The script as first run printed these and did not record them: without them the app says nothing about it.)
    lessOften: Object.fromEntries(Object.keys(e.lookingLessOften ?? {}).map(level => [level, {
      every2: whole(e.lookingLessOften[level][2].lossRate), every4: whole(e.lookingLessOften[level][4].lossRate),
    }])),
    seen: byLevel('seen'), order: byLevel('order'),
  };
}

/** The numbers the app quotes, rounded the way it shows them. */
function toFigures(recorded) {
  const {summary: s, fresh: f, regime: r, sentiment: v, plan: p, sixth: x, seventh: n, several: h} = recorded;
  const caseOf = c => ({bad: whole(c.bad), typical: one(c.typical), good: whole(c.good)});
  return {
    dipPercent: s.dipPercent,
    stocks: s.stocks,
    firstBuy: s.firstBuy,
    lastBuy: s.lastBuy,
    dipBuy: {mean: one(s.dipBuy.mean), median: one(s.dipBuy.median), upPercent: percent(s.dipBuy.up), fellPercent: percent(s.dipBuy.fell20)},
    everyDip: {mean: one(s.everyDip.mean), median: one(s.everyDip.median)},
    notGrowing: {mean: one(s.notGrowing.mean), median: one(s.notGrowing.median)},
    sp500: {mean: one(s.sp500.mean), beatPercent: percent(s.sp500.beat)},
    typicalLowPercent: whole(-s.lowIn13Weeks),
    reach: {depthP95: whole(s.depthP95), volatilityP95: whole(s.volatilityP95)},
    regime: {
      stocks: r.stocks, fromYear: r.fromYear, toYear: r.toYear, growing: one(r.growing), others: one(r.others),
      worseIn2020to2022: whole(-r.gap2020to2022),
    },
    fresh: {
      stocks: f.stocks, growing: one(f.growing), everyDip: one(f.everyDip), holding: one(f.holding), withStop: one(f.withStop),
      stopPercent: f.stopPercent, stoppedPercent: percent(f.stopped), fellPercent: {volatile: percent(f.fellVolatile), calm: percent(f.fellCalm)},
    },
    groups: {volatileFrom: f.volatileFrom, calmBelow: f.calmBelow},
    cases: {volatile: caseOf(f.cases.volatile), middle: caseOf(f.cases.middle), calm: caseOf(f.cases.calm)},
    fear: {
      stocks: v.stocks, fromYear: v.fromYear, toYear: v.toYear, vixHigh: v.vixHigh, episodes: v.episodes,
      high: {mean: one(v.high.mean), upPercent: percent(v.high.up), fellPercent: percent(v.high.fell20)},
      low: {mean: one(v.low.mean)},
    },
    sixth: {
      stocks: x.stocks,
      buyFirst: {
        fallPercent: x.sharpFallPercent, weeks: x.sharpWeeks,
        weeksCompared: x.buyFirst.weeksCompared, aheadPercent: percent(x.buyFirst.aheadWeeks),
      },
      takeProfit: {
        percent: x.takeProfitPercent, holding: one(x.takeProfit.holding), holdingTypical: one(x.takeProfit.holdingMedian),
        withTakeProfit: one(x.takeProfit.withTakeProfit), soldEarlyPercent: percent(x.takeProfit.soldEarly),
      },
      afterHolding: {
        stay: one(x.afterHolding.stay), sp500: one(x.afterHolding.sp500), beatPercent: percent(x.afterHolding.beat),
        typicalExcess: one(x.afterHolding.medianExcess),
      },
    },
    seventh: {
      stocks: n.stocks,
      profit: {mean: one(n.profit.mean), typical: one(n.profit.median), upPercent: percent(n.profit.up), worstTenth: whole(-n.profit.worstTenth)},
      // `beats` follows the pre-registered test (G2), not a comparison of the two averages: the wording uses it.
      market: {sp500: one(n.market.sp500), beatPercent: percent(n.market.beat), beats: n.verdicts.G2 === 'PASS'},
      secondHalf: {stay: one(n.secondHalf.stay), sp500: one(n.secondHalf.sp500)},
      sellingEarly: {
        holding: one(n.sellingEarly.holding), withTakeProfit: one(n.sellingEarly.withTakeProfit),
        soldEarlyPercent: percent(n.sellingEarly.soldEarly), withStop: one(n.sellingEarly.withStop),
      },
    },
    plan: {
      holdWeeks: p.holdWeeks, positions: p.positions, months: p.months, monthsUp: p.monthsUp, monthsBeat: p.monthsBeat,
      worst: one(p.worst), median: one(p.median), best: one(p.best), together: one(p.together),
      sp500: {monthsUp: p.sp500.monthsUp, worst: one(p.sp500.worst), best: one(p.sp500.best), together: one(p.sp500.together)},
    },
    // How many to hold (pre-registered #8): `count` stocks that dropped, held together, against one alone.
    // `badLoss` is what 1 pick in 10 lost or more, as the app words it; the claims below keep it a loss.
    several: {
      stocks: h.stocks, fromYear: h.fromYear, toYear: h.toYear, count: h.together,
      alone: {mean: one(h.one.mean), typical: one(h.one.typical), badLoss: whole(-h.one.bad)},
      together: {mean: one(h.several.mean), typical: one(h.several.typical), badLoss: whole(-h.several.bad)},
      falling: {months: h.falling.months, alone: one(h.falling.one.typical), together: one(h.falling.several.typical)},
      market: {typical: one(h.market.typical)},
    },
    // The take-profit test (pre-registered #9): there once backtest_validation6.py has recorded it.
    ...(recorded.eighth ? {eighth: takeProfitFigures(recorded.eighth)} : {}),
  };
}

/**
 * Whether the app's numbers may be updated from these recorded figures.
 *  - blocking: statements the app makes in words that the figures no longer support, or signs of a failed
 *    download. Nothing is written while there is one.
 *  - notes: things worth a look that the app does not claim either way.
 *
 * @param previous the figures recorded by the last successful update, when there was one
 */
function check(recorded, previous) {
  const blocking = [], notes = [];
  const missing = Object.keys(SECTIONS).filter(name => !recorded || !recorded[name]);
  if (missing.length) {
    return {blocking: missing.map(name => `No "${name}" figures were recorded: run ${SECTIONS[name]} first.`), notes};
  }
  const now = toFigures(recorded);
  const {summary: s, fresh: f, regime: r, sentiment: v, plan: p, sixth: x, seventh: n, several: h} = recorded;
  const claim = (holds, text) => {
    if (!holds) {
      blocking.push(text);
    }
  };

  claim(now.dipBuy.mean > now.everyDip.mean,
    `The app says DIP BUYs returned more on average than every dip. Now: ${signed(now.dipBuy.mean)} against ${signed(now.everyDip.mean)}.`);
  claim(now.dipBuy.mean > now.notGrowing.mean,
    `The app says dips in companies that are not growing returned less than DIP BUYs. Now: ${signed(now.notGrowing.mean)} against ${signed(now.dipBuy.mean)}.`);
  claim(now.dipBuy.median > 0,
    `The app says the typical DIP BUY gained. Now its median result is ${signed(now.dipBuy.median)}.`);
  claim(Math.abs(s.dipBuy.median - s.notGrowing.median) <= ABOUT_THE_SAME_POINTS,
    `The app says the typical results of growing and other dips were about the same. Now: ${signed(now.dipBuy.median)} against ${signed(now.notGrowing.median)}.`);
  claim(s.sp500.mean >= RISING_MARKET_PERCENT,
    `The app calls the tested period a rising market. Now the S&P 500 averaged ${signed(now.sp500.mean)} over the same weeks.`);
  claim(f.verdicts.H2 === 'PASS',
    `The app shows a volatility risk note (pre-registered H2). On the fresh list H2 is now ${f.verdicts.H2}: ` +
    `${now.fresh.fellPercent.volatile}% of volatile DIP BUYs fell another 20%+ against ${now.fresh.fellPercent.calm}% of calm ones.`);
  claim(f.verdicts.H3 === 'PASS',
    `The app says a 20% stop-loss lowered the average result (pre-registered H3). H3 is now ${f.verdicts.H3}: ` +
    `${signed(now.fresh.withStop)} with the stop against ${signed(now.fresh.holding)} holding.`);
  claim(now.fresh.growing <= now.fresh.everyDip,
    `The app says growing dips did no better than other dips on the fresh list. Now: ${signed(now.fresh.growing)} against ${signed(now.fresh.everyDip)}.`);
  claim(f.cases.volatile.bad > f.cases.middle.bad && f.cases.middle.bad > f.cases.calm.bad,
    `The app sizes positions from a bad case that grows with volatility. Now the bad cases are ${now.cases.calm.bad}% (calm), ` +
    `${now.cases.middle.bad}% (in between) and ${now.cases.volatile.bad}% (volatile).`);
  claim(r.verdict === 'FAIL' && now.regime.growing < now.regime.others && r.gap2020to2022 < 0,
    `The app says the ${r.fromYear}-${r.toYear} test showed no edge and that growing dips did worse in 2020-22. Now the test is ` +
    `${r.verdict}: ${signed(now.regime.growing)} against ${signed(now.regime.others)}, 2020-22 gap ${signed(one(r.gap2020to2022))}.`);
  claim(now.fear.high.mean > now.fear.low.mean,
    `The app says dips bought when the VIX was ${v.vixHigh}+ did better. Now: ${signed(now.fear.high.mean)} against ${signed(now.fear.low.mean)}.`);

  claim(x.verdicts.P2 === 'PASS',
    `The plan says not to sell early for a gain (pre-registered P2). P2 is now ${x.verdicts.P2}: ` +
    `${signed(now.sixth.takeProfit.withTakeProfit)} with a +${x.takeProfitPercent}% take-profit against ${signed(now.sixth.takeProfit.holding)} holding.`);
  // What the plan rests on since the seventh list (pre-registered #7): it made money there (G1), and selling early
  // paid less there too, for a gain (G5a) and after a drop (G5b).
  claim(n.verdicts.G1 === 'PASS',
    `The app says the plan made money on stocks never used before (pre-registered G1). G1 is now ${n.verdicts.G1}: ` +
    `${signed(now.seventh.profit.mean)} on average over 6 months.`);
  claim(n.verdicts.G5a === 'PASS',
    `The plan says selling early for a gain paid less on the seventh list too (pre-registered G5). That half is now ${n.verdicts.G5a}: ` +
    `${signed(now.seventh.sellingEarly.withTakeProfit)} with a take-profit against ${signed(now.seventh.sellingEarly.holding)} holding.`);
  claim(n.verdicts.G5b === 'PASS',
    `The plan says selling after a drop paid less on the seventh list too (pre-registered G5). That half is now ${n.verdicts.G5b}: ` +
    `${signed(now.seventh.sellingEarly.withStop)} with a stop against ${signed(now.seventh.sellingEarly.holding)} holding.`);
  // What the plan does NOT do, because of the same run. If one of these turns, the wording and the plan's horizon
  // are a person's decision, not an automatic one.
  claim(n.verdicts.G4 !== 'PASS',
    `The plan keeps a holding for 6 months only, because keeping for a second 6 months did not hold up on the seventh list ` +
    `(pre-registered G4). G4 now passes: ${signed(now.seventh.secondHalf.stay)} against ${signed(now.seventh.secondHalf.sp500)} for the market.`);
  claim(x.afterHolding.stay > x.afterHolding.sp500,
    `The app says that on the sixth list the stocks kept for a second 6 months beat the market. Now: ` +
    `${signed(now.sixth.afterHolding.stay)} against ${signed(now.sixth.afterHolding.sp500)}.`);
  claim(s.dipBuy.median < s.dipBuy.mean * FEW_WINNERS_SHARE,
    `The app says the pooled average comes from a few big winners, but the typical DIP BUY gained ${signed(now.dipBuy.median)} ` +
    `against ${signed(now.dipBuy.mean)} on average.`);
  // The ordering "fastest fallers first" (P1) is NOT a rule of the plan: inside one week it was not ahead often
  // enough. The app only quotes how often it was, as the reason for giving no order. So P1's own verdict does not
  // stop an update; these two do.
  claim(x.buyFirst.weeksCompared >= MIN_WEEKS_COMPARED,
    `The app says how often the fast fallers beat the others bought in the same week, but only ` +
    `${x.buyFirst.weeksCompared} weeks had both kinds: too few to say.`);
  claim(x.buyFirst.aheadWeeks < DEPENDABLE_FROM,
    `The app says there is no dependable way to order DIP BUYs: the fast fallers beat the others bought in the same week ` +
    `under half the time. Now they did in ${now.sixth.buyFirst.aheadPercent}% of weeks, which may deserve a test of its own ` +
    `(pre-registered as a within-week comparison, on a list never used).`);
  claim(p.months >= MIN_PLAN_MONTHS,
    `The app says how many monthly batches of the plan were up. The replay now covers only ${p.months} monthly batches, too few to say.`);

  // How many to hold (pre-registered #8, on 30 years of monthly prices). The plan says "three or more rather than
  // one" because both halves passed; each sentence the app builds from that test is kept true here. (It replaced
  // the replay's one-against-ten and the undecided G3, which the app no longer quotes.)
  const how = now.several;
  claim(h.verdicts.S1 === 'PASS',
    `The plan says ${how.count} or more stocks rather than one soften a bad half-year (pre-registered S1). S1 is now ${h.verdicts.S1}: ` +
    `1 in 10 lost ${how.together.badLoss}% or more with ${how.count} together, against ${how.alone.badLoss}% with one alone.`);
  claim(h.verdicts.S2 === 'PASS',
    `The app says ${how.count} stocks together typically ended higher than one alone (pre-registered S2). S2 is now ${h.verdicts.S2}: ` +
    `${signed(how.together.typical)} against ${signed(how.alone.typical)}.`);
  claim(h.several.bad < 0 && h.one.bad < 0,
    `The app words the bad case of holding several as a loss ("1 in 10 lost N% or more"). Now the results that 1 in 10 did worse ` +
    `than are ${signed(one(h.several.bad))} with ${how.count} together and ${signed(one(h.one.bad))} with one alone.`);
  claim(Math.abs(h.several.mean - h.one.mean) <= SAME_AVERAGE_POINTS,
    `The app says holding several does not change the average. Now: ${signed(how.together.mean)} with ${how.count} together ` +
    `against ${signed(how.alone.mean)} with one alone.`);
  claim(h.falling.several.typical < 0,
    `The app says ${how.count} stocks together still typically lost when the market fell. Now their typical result in those months is ` +
    `${signed(how.falling.together)}.`);

  // Taking a profit (pre-registered #9, the eighth list). The app says of every way and level that it made a loss
  // rarer and gave less on average, and of each one it offers that the stocks it sold went on to make more when
  // kept ("a sale gives up what the winners go on to make"). The first is close to arithmetic; it is held to the
  // figures as printed, where two shares can come out the same.
  // What the plan offers is what passed on the first whole download. An offered rule that no longer passes stops
  // the update: taking an offer away is a person's decision. One that failed then and passes now is not offered
  // (toFigures), and only noted, until the owner has said to leave it out (TAKE_PROFIT_LEFT_OUT).
  Object.keys(TAKE_PROFIT_REGISTERED).forEach(key => {
    const way = key.replace(/\d+$/, ''), level = key.slice(way.length), verdict = recorded.eighth.verdicts[key];
    const what = TAKE_PROFIT_WAYS[way](level), asked = recorded.eighth.takeProfit[way]?.[level]?.lossRarer;
    if (TAKE_PROFIT_REGISTERED[key] === 'PASS') {
      claim(verdict === 'PASS',
        `The plan offers +${level}% as a level for taking a profit, by ${what} (pre-registered #9). That is now ${verdict}` +
        (asked ? `: a loss was rarer by ${asked.gap.toFixed(1)} points, and the mark is ${asked.mark}.` : '.'));
    } else if (verdict === 'PASS' && !TAKE_PROFIT_LEFT_OUT[key]) {
      notes.push(`Taking a profit by ${what} now passes pre-registered #9. It failed on the first whole download, which is the ` +
        'result, so it is not offered: taking it up is yours to decide.');
    }
  });
  const profit = now.eighth?.decided ? now.eighth : undefined;
  if (profit) {
    claim(profit.marketRosePercent === null || profit.marketRosePercent >= MOSTLY_ROSE_PERCENT,
      `The app says the market was rising and gives the share of the take-profit test beside it. Now the market rose ` +
      `for ${profit.marketRosePercent}% of the purchases in that test (pre-registered #9), which no longer says "rising".`);
    const ways = TAKE_PROFIT_WAYS;
    Object.keys(ways).forEach(way => Object.keys(profit[way]).forEach(level => {
      const rule = profit[way][level], what = ways[way](level);
      claim(rule.lossPercent < profit.keeping.lossPercent,
        `The app says taking a profit made a loss rarer (pre-registered #9). Now, with ${what}: ${rule.lossPercent}% ended below ` +
        `what was paid, against ${profit.keeping.lossPercent}% when kept.`);
      claim(rule.mean < profit.keeping.mean,
        `The app says taking a profit gave less on average (pre-registered #9). Now, with ${what}: ${signed(rule.mean)} against ` +
        `${signed(profit.keeping.mean)} for keeping.`);
      claim(!rule.passed || rule.reached.meanKept > rule.reached.meanSold,
        `The app says a sale gives up what the winners go on to make (pre-registered #9). Now, with ${what}: the stocks it sold made ` +
        `${signed(rule.reached.meanKept)} on average when kept, against ${signed(rule.reached.meanSold)} when sold.`);
    }));
  }

  if (previous?.summary && previous?.fresh) {
    const fewer = (label, count, before, share) => claim(count >= before * share,
      `Only ${count.toLocaleString('en-US')} ${label} came back, against ${before.toLocaleString('en-US')} last time: ` +
      `that looks like a failed download, not a market change.`);
    fewer('stocks on the pooled test lists', s.stocks, previous.summary.stocks, MIN_SHARE_OF_STOCKS);
    fewer('DIP BUYs', s.dipBuy.n, previous.summary.dipBuy.n, MIN_SHARE_OF_DIP_BUYS);
    fewer('stocks on the fresh list', f.stocks, previous.fresh.stocks, MIN_SHARE_OF_STOCKS);
    if (previous.sixth) {
      fewer('stocks on the sixth list', x.stocks, previous.sixth.stocks, MIN_SHARE_OF_STOCKS);
    }
    if (previous.seventh) {
      fewer('stocks on the seventh list', n.stocks, previous.seventh.stocks, MIN_SHARE_OF_STOCKS);
    }
    if (previous.eighth && recorded.eighth) {
      fewer('stocks on the eighth list', recorded.eighth.stocks, previous.eighth.stocks, MIN_SHARE_OF_STOCKS);
    }
  }

  const REJECTED = {H1: 'a caution on deep dips', H4: 'a 20% dip threshold'};
  Object.keys(REJECTED).filter(id => f.verdicts[id] === 'PASS').forEach(id => notes.push(
    `${id} (${REJECTED[id]}) now passes on the fresh list. The app does not act on it: it was rejected in its ` +
    `pre-registered test, so taking it up is yours to decide.`));
  return {blocking, notes};
}

/** The TypeScript module the app imports. The same figures always give the same text. */
function render(figures) {
  const lines = Object.keys(figures).map(key => `  ${key}: ${literal(figures[key])},`);
  return [
    '// GENERATED by tools/evidence/update.js from what the backtests recorded',
    '// (tools/signal-backtest/quoted_figures.json). Do not edit: run `npm run evidence` to re-run the backtests',
    '// and rewrite this file. evidence.ts turns these numbers into the sentences the app shows.',
    'export const FIGURES = {',
    ...lines,
    '} as const;',
    '',
  ].join('\n');
}

function literal(value) {
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).map(key => `${key}: ${literal(value[key])}`).join(', ')}}`;
  }
  return typeof value === 'string' ? `'${value.replace(/[\\']/g, '\\$&')}'` : String(value);
}

/** "dipBuy.mean: 12.1 → 11.6" for every number that differs between two sets of figures. */
function changes(before, after) {
  const old = flatten(before ?? {}), next = flatten(after ?? {});
  const missing = value => value === undefined || Number.isNaN(value);
  const lines = Object.keys(next).filter(path => old[path] !== next[path] && !(missing(old[path]) && missing(next[path])))
    .map(path => `${path}: ${missing(old[path]) ? '(new)' : old[path]} → ${next[path]}`);
  Object.keys(old).filter(path => !(path in next)).forEach(path => lines.push(`${path}: ${old[path]} → (gone)`));
  return lines;
}

function flatten(value, prefix = '', out = {}) {
  Object.keys(value).forEach(key => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value[key] && typeof value[key] === 'object') {
      flatten(value[key], path, out);
    } else {
      out[path] = value[key];
    }
  });
  return out;
}

function signed(value) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

module.exports = {toFigures, check, render, changes, SECTIONS};
