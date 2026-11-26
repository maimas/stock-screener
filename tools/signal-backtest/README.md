# Signal backtest

Checks the Signal's timing rules against what actually happened afterwards, using MSN Finance weekly price history
(5 years, 68 large caps; the stock list is at the top of `backtest.py`).

```
python backtest.py --sweep   # timing layer + threshold sensitivity (downloads data on first run, then caches)
python backtest2.py          # robustness: time halves, holders-in-profit buckets, trend-rule variants
python backtest3.py          # does missing EPS estimates predict worse returns afterwards?
python backtest_final.py     # timing rule: dip >= 15% and price >= 200-day average
python backtest_quality.py     # tuning universe: point-in-time growth / value / red-flag factors, rule benchmarks (in-sample)
python backtest_holdout.py     # out-of-sample #1: frozen rules on 121 different stocks
python backtest_validation.py  # out-of-sample #2: pre-registered rule on 130 untouched stocks (the rule the app uses)
python backtest_validation2.py # out-of-sample #3: pre-registered ranking idea on ~160 untouched mid caps
python backtest_regime.py      # pre-registered #4: does the growth edge hold in 1994-2022? (annual-revenue stand-in)
python backtest_validation3.py # pre-registered #5: risk and holding notes on a fifth, "fresh" universe of 234 stocks
python backtest_validation4.py # pre-registered #6: which DIP BUY first, taking profits, and after 26 weeks, on a sixth universe of 184 stocks
python backtest_validation5.py # pre-registered #7: does following the plan make a profit? on a seventh universe of 202 stocks
python backtest_validation6.py # pre-registered #9: does taking a profit make a loss rarer? on the eighth universe, the last 202 unused stocks
python backtest_validation6.py --as-run # the same on the bars as downloaded: prints the first run (2026-11-25) again, records nothing
python backtest_summary.py     # pooled out-of-sample numbers quoted in the app
python backtest_plan.py        # the plan as a whole, replayed step by step in monthly batches (descriptive)
python backtest_several.py     # pre-registered #8: how many to hold, on 30 years of monthly prices of three lists
python explore_least_tied.py   # the free look behind #8: "the one least tied to what you own" (needs numpy and pandas; not shipped)
python explore_gain_loss.py    # a free look: which ten of the marked stocks to keep, by potential gain or loss (needs numpy; not shipped)
```

## How the numbers reach the app

No tested number is typed into the app. The nine scripts whose results it quotes (`backtest_summary.py`,
`backtest_validation3.py`, `backtest_validation4.py`, `backtest_validation5.py`, `backtest_validation6.py`, `backtest_plan.py`, `backtest_regime.py`,
`backtest_sentiment.py`, `backtest_several.py`) end by recording them with `quoted.py` into `quoted_figures.json`, and from
the project folder:

```
npm run evidence                # re-run those eight on the data already downloaded, then update the app
npm run evidence -- --refresh   # first download fresh prices and earnings for the six out-of-sample lists
npm run evidence -- --dry-run   # show what would change and write nothing (also with --refresh)
```

`tools/evidence/update.js` rounds the figures the way the app shows them and writes
`src/app/watchlist/evidence.generated.ts`; `evidence.ts` turns them into sentences. Nothing is replaced unless
every script succeeded, and an update is **refused** when a statement the app makes in words would no longer be
true (the checks are in `tools/evidence/figures.js`): DIP BUYs beat every dip on average, the typical results are
about the same, the tested period was a rising market, H2 and H3 still pass, growing dips did no better on the
fresh list, the bad cases grow with volatility, the 1994-2022 test still fails, high-fear months did better; the
plan still made money on the seventh list (G1) and selling early still paid less on the sixth and the seventh (P2,
G5); three stocks together still had a milder bad half-year and a higher typical result than one alone (#8 S1 and
S2), with a bad case that is still a loss, an average that did not move and a typical loss when the market fell;
and the things the plan does not do still stand as tested: the second half-year has not held up on the seventh
list (G4), and the ordering that is not used (P1) is still ahead in under 60% of weeks. If one of those turns, the
update stops, because what the plan should then say is a person's decision.
A refusal is a decision for you, not for a scheduled job: the app keeps its numbers and shows why.

What a refresh does and does not do:

- It downloads the holdout, validation, mid-cap, fresh, sixth, seventh and eighth lists again (the provider serves five years of weekly
  prices), so **the test window slides forward**: the newest weeks come in and the oldest drop out. The data it
  replaces is kept in `previous_data/`.
- The three long-history tests (#3 market fear, #4 regime, #8 how many to hold) cover closed periods and are not
  downloaded again; their figures carry over.
- The pre-registered verdicts below were decided once, on the data of their day. A refresh re-measures the same
  fixed rule on later data: it cannot ship a new idea. If a rejected idea (H1, H4) starts to pass, the update
  goes through and leaves a note, and taking the idea up is your decision.
- The first scheduled refresh ran on 2026-11-21 (three more weeks of data for the three older lists), passed
  every check and was applied: the four-list DIP BUY average moved from +12.1% to +11.7%, for example. The sixth
  list was pooled in the same night, which moved the numbers more (see "Where the evidence stands").

On Windows, set `PYTHONIOENCODING=utf-8` when piping the output to a file or another program (the tables print `≤`).

## The plan the app shows, and how it did when replayed (`backtest_plan.py`, 2026-11-22)

The app's first card, "Your plan today", turns the tested pieces into steps for the portfolio being shown, worded
for someone new to investing. It adds no rule of its own:

| Step in the card | Where it comes from |
|---|---|
| BUY: the DIP BUYs, in no order | The verdict rule (pre-registered, `backtest_validation.py`). On the newest list they made money (#7 G1) but no more than the market (#7 G2). No ordering is used: nine were looked at and dropped, the tenth (#6 P1, the fastest fallers first) passed as written but was not dependable inside a week, and eleven more were checked inside the week (below) |
| Amounts, "add up to", and SELL SOME when a holding is over them | The limit for a loss on one stock, divided by the tested bad case of that volatility group (H2 groups). A tenth of slack either way |
| YOUR LIMIT | Until the user enters a limit, the starting one: 10% of the portfolio, the value the user chose on 2026-11-22. It lets up to about a quarter of the money into one stock of the riskiest kind (bad case 41%). Not a tested number |
| KEEP for 6 months, not sold early | Every test held 26 weeks; a 20% stop lowered the average result (#5 H3, again #7 G5) and so did taking profits at +25% (#6 P2, again #7 G5) |
| GOOD TIME, only while the VIX is 25 or more | Pre-registered #3 |
| YOUR LEVEL and ORDER PRICE, only once the user picks a level under "Take a profit at" | Pre-registered #9: taking a profit at +15% made a loss rarer, as a sell order and when sold once seen, and gave less on average. The level is the user's own choice; the lines report and do not say to sell |
| HOLD BACK, only once the user sets a share under "Keep outside stocks" | Not a rule and not tested: the user's own number, like the limit. A tenth of slack, as for SELL SOME |
| HOW MANY: three or more rather than one, beside BUY while the plan covers fewer than three of the portfolio's stocks | Pre-registered #8, on 30 years of monthly prices of stocks that dropped: a milder bad half-year and a higher typical result, the same average. It says how many, never which |
| YOUR CALL after 6 months | Weeks 26 to 52 were tested twice: the kept stocks beat the S&P 500 on the sixth list (#6 P3) and not on the seventh (#7 G4). One narrow pass and one miss is not a rule, so the card says the tests disagree |
| NO OPINION | Holdings that were not DIP BUYs when bought and are not now: the tests do not cover them |
| NO PRICE, START HERE | Not rules: a quote that did not load, and a portfolio that is worth nothing yet |
| WHAT'S NEW | Not a rule and not tested: what changed since the last earlier day in the daily log (`src/app/watchlist/whats-new.ts`) |

A holding counts as covered if it is a DIP BUY today, or was one on the day it was bought (judged as the backtests
judge a past day: `wasDipBuy` in `src/app/watchlist/signal.ts`) and is within its 26 weeks.

`backtest_plan.py` replays the basic plan (buy every DIP BUY, sized by loss budget, keep 26 weeks) on the six
out-of-sample lists, one position at a time per stock, entering in the week a stock becomes a DIP BUY and grouping
by the month of purchase. Run by itself it tests no hypothesis and cannot change the verdict; it shows the plan as
a whole instead of one average.

| 34 monthly batches, 1,397 positions, bought 2023-08 → 2026-05 | The plan | S&P 500, same weeks |
|---|---|---|
| Batches up after 26 weeks | 30 of 34 | 32 of 34 |
| Batches in which the plan beat the index | 18 of 34 | |
| Worst / median / best batch | −6.1% / +10.9% / +32.4% | −6.2% / +10.0% / +28.2% |
| All positions together | +11.7% | +10.3% |

| Positions picked from one month's batch | Up after 26 weeks | Beat the S&P 500 |
|---|---|---|
| 1 | 59% of the time | 46% |
| 5 | 74% | 50% |
| 10 | 79% | 53% |

Read plainly: in this rising market the plan made money in most monthly batches, a little less often than the
index, with a somewhat higher total; it beat the index in about half of the batches. One position alone was not
far from a coin toss. That ten together were up more often is what this replay shows, but it is a replay. The one
test of it on weekly data (#7 G3, on the seventh list alone) could not be decided: it asked for months with ten
positions, and there ten together were up no more often than one alone (55% against 58%). The question was then
asked on 30 years of monthly prices (pre-registered #8, below) and passed, so the card now says how many, and the
evidence box quotes that test, not this replay. The batches overlap in time, so 34 batches are not
34 independent trials.

An earlier version of this replay judged each stock only every fourth week. Its basket figures moved by ten points
when the data was refreshed (ten together "up 80%", then 69%), because they depended on which week the four-week
grid started. Entering every week removed that.

## Where the evidence stands (2026-11-22)

The verdict rule (DIP BUY = dipped 15%+ and growing) passed its pre-registered test in 2026-10, but later
pre-registered checks narrowed what can be claimed for it. The app's texts say only this (the figures of this
section, and of #5, #6 and #7 below, are as corrected on 2026-11-26 for the provider's year bar: see "The correction
of 2026-11-26", which has each of them as first recorded):

| All six out-of-sample lists, 994 stocks, 16,652 dips, bought 2022-06 → 2026-05 | n | Mean 26w | Median | Up after 26w | Fell another 20%+ first |
|---|---|---|---|---|---|
| Every dip | 16,652 | +9.9% | +3.7% | 55% | 26% |
| DIP BUY: growing | 4,603 | +13.1% | +3.6% | 55% | 33% |
| PASS: not growing | 12,049 | +8.6% | +3.7% | 56% | 23% |

- **Does it make money?** Asked directly for the first time on the seventh list (pre-registered #7 below): yes,
  +9.3% over 6 months on average on 202 stocks never used before (P(no profit) under 0.1%), with a typical result
  of +3.6%. But the market made +10.2% over the same weeks, so there the plan made money and no more than the
  market did.
- **The edge is in the average only, and sits in the tail.** Growing minus every dip: +3.3 points (90% CI +1.4 to
  +5.2, P(no edge) = 0.2%). The median, the win rate and the drop rate are no better than for any dip, and the
  drop rate is worse.
- **It differs a lot from list to list.** Holdout +6.2 (P = 3%), validation +3.3 (P = 12%), mid caps +0.9
  (P = 37%), fresh −0.2 (P = 54%), sixth +7.1 (P = 1%), seventh +2.8 (P = 11%). The sixth list holds more small,
  speculative names, a few of which multiplied; without it the pooled picture is much flatter (four lists: +1.8
  points, P = 6.5%).
- **Against the index.** Pooled, the S&P 500 (SPY) returned +10.2% over the same weeks as the DIP BUYs' +13.1%:
  excess +2.9 points (90% CI +0.4 to +5.7, P(no edge) = 2.6%), but median excess −6.4, and 42% beat the index.
  That pooled excess rests on the sixth list: on the first four lists it was +1.5 (P = 17%), on the seventh −0.8.
  (`benchmark.py`)
- **It is unproven outside 2022–2026** (pre-registered #4 below: FAIL), and that window was a rising market.
- **How far the tested DIP BUYs reach:** depth below the high median 29%, 95th percentile 58%; volatility median
  45% a year, 95th percentile 89%. The typical one traded 13% below the purchase price within 13 weeks (60% fell
  another 10%+, 33% another 20%+, 16% another 30%+); the worst tenth lost 35% or more over 26 weeks, the best
  tenth gained 66% or more.

Earlier states of this table, for the record: four lists before the refresh of 2026-11-21 (636 stocks): DIP BUY
+12.1% (median +4.8%) against +10.0% for every dip; five lists with the sixth (801 stocks): +13.9% (median +3.6%)
against +10.6%, and +3.7 points over the S&P 500 (P = 1.8%).

The app also refuses a verdict to companies the backtests never covered: fewer than 8 reported quarters or under
a year of prices (the backtests needed 8 quarters and 56 weeks; see `fundamentals()` and `build_rows()`).

Results on 2026-10-31 (dips = at least 15% below the 52-week high, 26-week forward return):

| Group | n | Mean | Median | Fell another 20%+ within 13 weeks |
|---|---|---|---|---|
| Buy every dip | 1,267 | +17.2% | +9.5% | 16.3% |
| DIP BUY: price at or above 200-day average | 307 | +29.9% | +16.7% | 20.8% |
| WAIT: price below 200-day average | 960 | +13.1% | +7.7% | 14.8% |

### What the app's verdict uses, and why (`backtest_quality.py` → `backtest_holdout.py` → `backtest_validation.py`)

Fundamentals are rebuilt as of each date from quarterly earnings history and annual statements (only data released
before that date), 2023 → 2026, 26-week forward return of dips. Rules live in `quality_rules.py`.

1. **Tuning universe (68 stocks, in-sample).** "Trend intact + growing + no red flag" (E) looked best: +66.0% vs +17.4%
   for every dip.
2. **Holdout (121 different stocks, rules frozen).** E collapsed: +15.0% vs +11.1% for every dip, not distinguishable
   from zero by a stock-level bootstrap, and worse than every dip when each stock counts once. The trend filter alone
   added only about 3 points. Only growth kept its ordering (+15.6% growing, +11.1% flat, +6.2% shrinking).
3. **Validation (130 untouched stocks, rule pre-registered in `quality_rules.py` before downloading them).**
   Candidate F = "dip in a growing company":

| Rule (validation universe, among dips) | n | Mean | Median | Fell another 20%+ within 13w |
|---|---|---|---|---|
| A. Buy every dip | 1,956 | +4.8% | +2.7% | 20.1% |
| B. Trend intact only | 305 | +5.4% | +2.7% | 21.3% |
| **F. Growing (app's DIP BUY)** | 390 | **+9.8%** | **+7.4%** | 29.7% |
| Not growing | 1,566 | +3.6% | +1.9% | 17.7% |

F beat A by +4.9 points (stock-bootstrap 90% CI +0.4 to +9.6, P(no edge) = 3.3%), in both halves of the period
(+14.0% vs +7.7%, +8.4% vs +3.9%) and when each stock counts once (+14.1% vs +8.1%): pre-registered criterion PASSED.
Trend-only had no edge (+0.5 points, P = 41%). So the app's verdict is: DIP BUY = dipped 15%+ and growing,
WATCH = growing but no dip, PASS = not growing. Trend, valuation, red flags and analyst views are shown as context only.

4. **Mid caps (160 untouched stocks, second pre-registration).** Idea: rank DIP BUYs by earnings-backed growth
   (EPS outlook >= 10%) vs revenue-only. **FAIL**: +13.6% vs +11.5%, P(no edge) = 37%, same drop rate, so the app
   has no "strong" marker. Growth itself was weaker here: +12.1% vs +9.6% for every dip (P(no edge) = 17%).

**Pooled out-of-sample** (`backtest_summary.py`, 408 stocks, 6,182 dips; these numbers are what the app quotes):

| Group | n | Mean 26w | Median | Up after 26w | Fell another 20%+ first |
|---|---|---|---|---|---|
| Every dip | 6,182 | +8.5% | +5.1% | 59% | 20% |
| DIP BUY: growing | 1,321 | +12.3% | +7.1% | 61% | 28% |
| PASS: not growing | 4,861 | +7.5% | +4.6% | 59% | 17% |

Growing minus every dip: +3.8 points, 90% CI +1.1 to +6.7, P(no edge) = 1.1%. The edge is real but modest, comes
mostly from bigger winners rather than a higher hit rate, and comes with more further drops.

Tested and dropped: holders-in-profit as a gate (no edge), the "within 5% of a rising average" exception (no edge),
and an EPS-miss penalty (misses did not underperform after the report week).
Limits: all three lists are of companies that exist today (survivorship bias), the period is 2023–2026 only, and
growing dips fell another 20%+ more often than average, so the edge comes with more volatility. The analyst factors
can't be backtested because these sources keep no history for them, which is why they don't affect the verdict.

## Exploration: market-wide vs stock-specific dips (not shipped)

`long_history.py` loads split-adjusted monthly prices back to 1986 (MSN `type=All`) for all four universes plus SPY.
`explore_market_context.py` checks whether a dip works differently when the S&P 500 is also down (tuning universe only,
1994–2026). It doesn't, in any usable way: results swing by episode, from +3.1% over 6 months when the S&P was 10–20%
down to +17.6% when it was 20%+ down, with no steady pattern. Return relative to the S&P was similar in every bucket.
No rule was pre-registered, and the other universes were not looked at for this question. Absolute returns over
decades are flattered by survivorship (every list is today's survivors).

## Pre-registered #3: market fear (VIX) — PASSED, shown as market context (`backtest_sentiment.py`)

Explored on the tuning universe only: the geopolitical risk index (GPR, Caldara & Iacoviello) showed no pattern and
was dropped; dips bought when the VIX closed the month ≥ 25 beat calmer months in every decade. Rule and pass/fail
criteria were written into `backtest_sentiment.py` before the other universes were examined for this question.

| Pooled holdout + validation + mid-cap, 424 stocks, 1994–2026 | n | mean 6m | median | up | fell 20%+ |
|---|---|---|---|---|---|
| Every dip | 40,854 | +11.8% | +8.1% | 63% | 16% |
| VIX ≥ 25 | 14,089 | +20.4% | +14.1% | 71% | 15% |
| VIX < 25 | 26,765 | +7.3% | +5.2% | 58% | 17% |

Year-cluster bootstrap gap +13.0 pts (90% CI +6.1…+19.8, P = 0.1%); held in 1994–2009 and 2010–2026. The S&P 500
itself, free of survivorship bias, returned +8.6% vs +4.2% after VIX ≥ 25 months. It is market-wide and rests on ~16
fear episodes within the tested months (stretches of months with the VIX at 25+, counted as one when less than
three months apart; the app said ~17 until 2026-11-21, which counted one after the last tested month), so the app
shows it once, as a line in the Dip candidates card, not inside each stock's verdict.
News headlines ("why it dropped", Google News RSS via the `/gnews` dev proxy) are display-only context.

## Pre-registered #4: does the growth edge hold outside 2023–2026? — FAILED (`backtest_regime.py`)

Every test of the verdict above covers buys made from mid-2023 to May 2026, one growth-led market. Quarterly
point-in-time fundamentals do not exist before 2022 in these sources, but annual statements go back to the 1980s,
so a stand-in was used: **annual revenue growth ≥ 15%** between the two latest annual statements filed by that
month (`sourceDate`). It agrees with the app's quarterly "growing" on 80% of 2023–2026 dips.

Explored on the tuning universe only (`--explore`: +1.0 point in 1994–2022, P = 34%; +20.1 in 2023–2026). The
criteria were then written into the script before the other three universes were looked at for this question.

| Pooled holdout + validation + mid caps, 424 stocks, 40,391 monthly dips, 6-month return | Growing | Not growing | Gap |
|---|---|---|---|
| 1994–1999 | +15.0% | +9.3% | +5.8 |
| 2000–2002 | +7.6% | +7.8% | −0.2 |
| 2003–2007 | +12.1% | +14.5% | −2.4 |
| 2008–2009 | +9.9% | +14.0% | −4.1 |
| 2010–2019 | +9.8% | +12.3% | −2.5 |
| 2020–2022 | +11.4% | +22.3% | −10.9 |
| 2023–2026 | +10.1% | +7.2% | +2.9 |

Test period 1994–2022: growing +11.0% vs +13.5% for other dips, gap −2.3 points (year-cluster bootstrap 90% CI
−5.2 to +0.9, P(gap ≤ 0) = 88%); median +6.9% vs +9.7%; halves +1.4 (1994–2007) and −4.9 (2008–2022). All three
criteria failed. Over 12 months the gap was −2.5 points. Growing dips also fell another 20%+ more often in every
era (21% vs 13% overall). As pre-registered, the app now says the edge is unproven outside 2023–2026 and quotes
these numbers. Limits: survivors only (which flatters growing dips in busts), and an annual stand-in is slower
than the quarterly rule.

## Pre-registered #5: risk and holding notes on a fresh universe (`backtest_validation3.py`)

A fifth list of 234 stocks never used before (picked by name; the app's own watchlist excluded), 1,601 DIP BUYs
from 153 stocks, bought 2023-05 → 2026-05. Four hypotheses with their criteria in `quality_rules.py`; with four
tests at 10% there is about a 1-in-3 chance of one false pass, so the app quotes only this list's numbers for them.

| Hypothesis | Result on the fresh list | Verdict | In the app |
|---|---|---|---|
| H1 deep dips (45%+ below the high) fall further more often | 35% vs 36% fell another 20%+ (P = 64%) | **FAIL** | no deep-dip caution |
| H2 volatile stocks (45%+ a year vs under 35%) fall further more often | 40% vs 21% (+18.8 points, 90% CI +12.5 to +24.8, P = 0.0%) | **PASS** | Volatility column and risk note |
| H3 a 20% stop-loss lowers the average result | +8.1% with the stop vs +12.0% holding (+3.9 points, P = 0.0%); hit on 52% | **PASS** | "Risk and holding" note |
| H4 dips of 20%+ beat dips of 15–20% (would raise the threshold) | +12.2% vs +11.3% (P = 39%) | **FAIL** | threshold stays 15% |

Reported only, as pre-registered (not eligible to change the rule): on this list growing dips did **not** beat
every dip (+12.0% vs +12.2%, P(no edge) = 56%), growing companies without a dip did better than with one
(+13.4%), and DIP BUYs beat the S&P 500 41% of the time (+12.0% vs +10.2%, P(no edge) = 20%). These are the
numbers that pulled the pooled table at the top down from the three-list one.

### Bad, typical and good cases for position sizing (descriptive, same fresh list)

The app's "What you own" table works out "the amount of one stock that loses my limit in a bad case". The bad case is the
worst tenth of the 26-week results of DIP BUYs on the fresh list, by the volatility groups fixed in H2. So that
the bad case is never the only number shown, the typical result (the median) and the best tenth of the same
DIP BUYs are shown beside it ("good case"). The size itself is worked out from the bad case only. Printed at
the end of `backtest_validation3.py`; the app's copy is `cases` in `src/app/watchlist/evidence.generated.ts`.

| Volatility group (a year) | DIP BUYs | Worst tenth lost | Typical (median) | Best tenth gained | Worst twentieth lost | Lowest point on the way: median / worst tenth |
|---|---|---|---|---|---|---|
| Volatile (45%+) | 1,012 from 100 stocks | 41% or more | +2.4% | 85% or more | 49% | −23% / −50% |
| In between | 386 from 74 stocks | 31% or more | −0.1% | 56% or more | 36% | −20% / −41% |
| Calm (under 35%) | 203 from 54 stocks | 23% or more | +4.3% | 41% or more | 30% | −15% / −33% |

The typical DIP BUY barely moved while the best tenth gained a lot: that is the "edge from a few big winners"
of the table at the top, seen from one position's side.

These are measurements of 2023–2026, a rising market, not a prediction: a falling market can be worse, and the app
says so next to every amount. The limit itself (a % of the portfolio) is the user's own number once they enter it, and
the starting 10% until then (see the plan section above); the app only
divides it by the bad case. Pooled over all four lists the figures are 40%, 30% and 21%, so the fresh-list ones
used here are the more cautious.

## Pre-registered #6: which first, taking profits, and after 26 weeks (`backtest_validation4.py`)

The plan card needed three decisions the earlier tests could not make. They were explored on the five lists
already used (`python backtest_validation4.py --explore`), written with their criteria into `quality_rules.py`,
and then tested once on a sixth list: 185 symbols picked by name from those never used before, 184
resolved, 966 DIP BUYs from 97 stocks, bought 2022-10 → 2026-05.
Three hypotheses at 10% each: about a 1-in-4 chance that one passes by luck.

| Hypothesis | Result on the sixth list | Verdict | In the app |
|---|---|---|---|
| P1 buy first: DIP BUYs that fell 25%+ in the 13 weeks before, against the rest | +48.9% vs +14.4% over 26 weeks (gap +34.0 points, P = 0.4%); median +6.5% vs −0.1%; fell another 20%+ 47% vs 42%; 162 rows from 55 stocks | **PASS** as written | **Not used** (see below): the plan gives no order |
| P2 taking profits at +25% lowers the average result | +5.3% with it vs +20.2% holding (gap +14.8 points, P = 0.0%); sold early on 57% | **PASS** | KEEP: "selling early, up or down, paid less" |
| P3 the same positions over weeks 26–52, against the S&P 500 | +16.1% vs +7.4% (excess +8.6 points, P(excess ≤ 0) = 4.8%); 708 rows from 88 stocks | **KEEP** (narrowly) | **Not used** since #7: it did not repeat on the seventh list (G4), so the card keeps for 6 months and quotes both results |

**Read this before relying on any of the three.** All of it was looked at after the verdicts were printed, and
none of it was part of the criteria (`python backtest_validation4.py --robust` prints it):

- **Each is an average made by a few huge winners.** P1: five stocks (OPEN, RGTI, IONQ, CRDO, SOUN) made 74% of
  the fast fallers' total gain; without them their mean is +14.8%, level with the others' +14.4% (their median
  stays ahead, +4.6% against −0.1%). With every result capped at +100%: +15.0% vs +7.3%.
- **P1 pools every date, and the card orders one day's candidates.** Sharp falls cluster in sell-offs, when
  whatever is bought tends to do well. Inside the 34 weeks that had both kinds, the fast fallers were
  ahead of the other DIP BUYs bought that week in 47% of weeks (typical weekly gap -3.8
  points). Taking each week's average out, the gap is +27.8 points on the sixth list (90% CI +1.2 to +62.3,
  P = 4.0%), but only +3.8 on the four earlier out-of-sample lists (P = 17%), where they were ahead in 38% of
  weeks. So it is a higher average from rare big winners, not a dependable pick of the better stock on a given
  day. **Decision: P1 is not used.** It passed the test that was written, but that was the wrong test for an
  order among one day's candidates. The plan's BUY step lists the DIP BUYs in no order, and its evidence quotes
  the 47% as the reason. An ordering should be pre-registered as a within-week comparison next time.
- **P2:** with the take-profit the typical result was +25.0% (it was hit on 57%), against
  +1.2% holding. Selling early won more often and earned less on average; with every result capped at
  +100% holding is still ahead, by less (+8.5% against +5.3% with it). It also counts the money as idle after the
  sale.
- **P3:** the typical position was 5.2 points behind the index over weeks 26–52, and 45% beat it;
  capped at +100% the excess is +1.8 points. P = 4.8% is not far from the 10% line.
- **The list itself.** It is "what was left" after five lists: more small and speculative companies (quantum
  computing, bitcoin miners) than the app's own lists hold, and that is where the huge winners came from.
- Reported as context, as pre-registered: growing dips beat every dip here (+20.2% vs +13.1%, P = 1.2%); DIP BUYs
  against the S&P 500 +20.2% vs +9.9%, 41% beat it; H2 again: 47% of volatile and 21% of calm DIP BUYs fell
  another 20%+; H3 again: +9.2% with the 20% stop against +20.2% holding.

**Is there any dependable order among one week's DIP BUYs?** Looked at on 2026-11-22 on the five out-of-sample
lists already used (`python backtest_validation4.py --orderings`; weeks with at least two of each kind):

| First kind / second kind | Weeks | First ahead | By the typical stock | Typical weekly gap | Gap, week average out |
|---|---|---|---|---|---|
| Fell 25%+ in 13 weeks / fell less | 35 | 49% | 40% | −0.3 | +9.5 (P = 2%) |
| Calm / volatile | 36 | 33% | 50% | −10.0 | −14.7 |
| Deep dip (30%+) / 15–30% | 37 | 57% | 49% | +3.2 | +6.2 (P = 1%) |
| Revenue growth 30%+ / less | 36 | 67% | 53% | +4.8 | +4.7 (P = 14%) |
| Earnings-backed growth / revenue only | 36 | 39% | 39% | −1.4 | −3.8 |
| Beat last quarter / did not | 35 | 60% | 54% | +2.1 | +0.5 (P = 38%) |
| Above 40-week average / below | 36 | 58% | 47% | +1.1 | +1.2 (P = 38%) |
| Up over the year / down | 37 | 49% | 38% | −0.4 | −2.5 |
| No red flag / losing money or high debt | 37 | 14% | 30% | −11.3 | −16.6 |
| Not expensive vs own history / expensive | 32 | 50% | 41% | +1.2 | −2.7 |
| Revenue speeding up / slowing | 37 | 51% | 41% | +0.1 | +1.0 (P = 40%) |

Read plainly: the only orderings that were ahead in most weeks are "the riskier one first" (companies losing money
or carrying heavy debt were ahead of the others in 86% of weeks; volatile ahead of calm in 67%). That is what a
rising market pays for and a falling one takes back, the tested window was a rising market, and the plan already
gives the riskier stocks smaller amounts. Nothing else was ahead by the typical stock in more than 54% of weeks,
and no ordering held on more than two of the five lists taken one at a time. So the plan gives no order, and says
that how many matters more than which (tested since: pre-registered #8). A new idea for an order needs a
pre-registered within-week test on a list never used.

An update of the app's numbers stops if P2 no longer passes on refreshed data, if the sixth list's second
half-year stops beating the market (the app quotes that it did), or if the fast fallers start being ahead in 60%
of weeks or more ("no dependable order" would then need another look): `tools/evidence/figures.js`.

## Pre-registered #7: does following the plan make a profit? (`backtest_validation5.py`)

Every earlier test compares one group of dips with another. None asks what the user's goal asks: does doing what
the plan card says make a profit? And two things the card said rested on thin ground: "owning several beats
picking one" came from a replay that tested no hypothesis, and "keep for a second half-year" had passed narrowly
(#6 P3, P = 4.8%). So five questions were written into `quality_rules.py`, with what would happen to the card
either way, before the seventh list was downloaded: 642 names written down from memory, 404 of them never used,
every second one taken (202; the other 202 are kept back for an eighth list). 775 DIP BUYs from 117 stocks,
bought 2022-06 → 2026-05. Five questions: about a 1-in-3 chance that one would pass by luck.

| Question | Result on the seventh list | Verdict | What the card does |
|---|---|---|---|
| G1 profit: mean 26-week result above zero (P < 5%) | +9.3% (90% CI +4.8 to +14.0, P(mean ≤ 0) under 0.1%); typical +3.6%; 56% up; worst tenth −30.5%, best tenth +53.1% | **PASS** | Its last line and the evidence box say the plan made money on new stocks, with the typical result and the market beside it |
| G2 more than the market: mean excess over the S&P 500 above zero (P < 10%) | +9.3% vs +10.2%: excess −0.8 points (90% CI −5.3 to +3.8, P = 65%); typical excess −6.6; 41% beat the index | **FAIL** | Says "no more than the market did" |
| G3 several, not one: ten from one month's batch up more often than one alone, by 10 points | Only 10 months had ten or more positions (12 needed). As far as it goes: ten 55%, five 67%, one alone 58% | **INCONCLUSIVE** | No longer says that owning several beats picking one; the pooled replay is quoted as a replay |
| G4 the second half-year (P3 again): weeks 26–52 beat the S&P 500 (P < 10%) | +9.4% vs +7.7%: excess +1.7 points (90% CI −4.3 to +7.5, P = 31%); typical excess −2.0; 47% beat the index; 609 rows from 99 stocks | **FAIL** | Back to "keep for 6 months"; a holding older than that is YOUR CALL |
| G5 no selling early (P2 and H3 again) | Take-profit at +25%: +4.5% vs +9.3% holding (P = 0.1%; sold early on 43%; typical +10.1% with it vs +3.6%). Stop at −20%: +6.9% vs +9.3% (P = 0.1%; stopped out on 41%) | **PASS** (both halves) | KEEP still says that selling early, up or down, paid less, now on two lists |

Read plainly:

- **The plan made money on stocks it had never seen, and no more than the market did.** Over the same weeks an
  S&P 500 fund made +10.2% against the plan's +9.3%, and the plan's replay on this list alone made +7.7% against
  +10.3%. The profit is mostly the market's. A rising market lifts every stock, so G1 was the lowest of the five
  bars; G2 is the one that asks whether the rule adds anything, and on this list it did not.
- **The pooled edge over the market rests on one list.** See "Where the evidence stands": +2.9 points over the
  S&P 500 on all six lists (P = 2.6%), +1.5 on the first four (P = 17%), −0.8 on the seventh.
- **Not selling early is the one piece that held up everywhere it was tested**, on the average. With a take-profit
  the typical result was higher (+10.1% against +3.6% here): selling early wins more often and earns less.
- **Keeping for a second half-year did not repeat**, so it is out of the plan, as written down beforehand.
- Reported as context: growing dips against every dip on this list +2.8 points (P = 11%); H2 again: 32% of
  volatile and 20% of calm DIP BUYs fell another 20%+.

An update of the app's numbers stops if G1, G5 or P2 no longer passes on refreshed data, and also if G4 turns
(then what the card should say is a person's decision): `tools/evidence/figures.js`. G3 is no longer watched: the
question it could not decide was settled by pre-registered #8.

## Pre-registered #8: how many to hold (`backtest_several.py`)

The user asked whether the app could suggest what to add to a portfolio, and wanted a suggestion to do both: earn
more and make a bad half-year hurt less. Two things were looked at first, on lists already used (2026-11-22,
`python explore_least_tied.py`):

- **Which stock to add has no dependable answer.** No order among one week's DIP BUYs has passed (#6 and the
  orderings above). "The one least tied to what you own" (lowest correlation of weekly returns over the year
  before) gave a pair with a bad case two points milder (−23.1% against −24.9% for any second stock) whose second
  stock earned about half as much (+6.6% against +12.7% on average). List by list it helped on three, did nothing
  on two and hurt on one. Stocks marked DIP BUY in the same week are only loosely tied to begin with (0.11 to
  0.24 on a 0-to-1 scale over the next 26 weeks). Dropped.
- **How many looked different.** Random picks among one week's DIP BUYs: one alone was typically at +3.5% with
  1 in 10 below −33.8%; three together at +7.1% and −20.5%; the average did not move. #7 G3 had asked this with
  months of ten positions and found too few.

Spreading a bet can be asked on prices alone, over 30 years that include 2000–02, 2008, 2020 and 2022. So the
question was written into `quality_rules.py`, with its pass marks and what each outcome would do, before the long
monthly history of the fresh, sixth and seventh lists was downloaded (no long-history question had looked at
them). It was explored first on the four lists used before (`python backtest_several.py --explore`: three
together typically at +8.0% against +6.7%, bad case −16.9% against −26.6%).

Method: every month from 1994 on, the stocks 15%+ below their 12-month high (`long_history.py`, as in #3). Every
month counts the same: 200 random picks of one such stock, and 200 of three different ones in equal amounts, each
held 6 months. "Typical" is the median; the "bad case" is the result that 1 pick in 10 did worse than.
618 stocks, 58,771 dips, 388 months to April 2026.

| Held together | Average | Typical | Up | 1 in 10 did worse than | Lost 20%+ | Beat the market |
|---|---|---|---|---|---|---|
| One alone | +8.8% | +3.8% | 56% | −32.5% | 19% | 47% |
| Two | +8.7% | +4.8% | 58% | −25.1% | 14% | 49% |
| **Three** | +8.6% | +5.3% | 60% | −21.7% | 11% | 50% |
| Five | +8.5% | +5.9% | 63% | −18.5% | 9% | 51% |
| Ten | +8.7% | +6.8% | 66% | −15.0% | 7% | 54% |
| The market (S&P 500), same months | +5.0% | +5.5% | 75% | −8.0% | | |

| Question | Result on the three lists | Verdict |
|---|---|---|
| S1 a bad half-year hurts less: the bad case of three is 5+ points milder (year-cluster bootstrap P < 5%), in both halves and in the months after which the market fell | +10.9 points (90% range +9.8 to +12.0, P under 0.1%); 1994–2009 +11.2, 2010–2026 +10.7; after which the market fell +12.1 | **PASS** |
| S2 the typical result is higher by 0.5+ points (P < 5%), in both halves | +1.5 points (+1.0 to +1.9, P under 0.1%); +1.5 and +1.4 | **PASS** |

Read plainly:

- **Holding several does not earn more on average; it makes the result steadier.** The average is the same by
  construction. What changes is what one typically gets (+5.3% against +3.8%) and how bad a bad half-year is.
- **It does not protect against a falling market.** In the 98 months after which the market fell, three together
  still typically lost (−10.2%, against −11.2% for one alone); their bad case was −36.8% against −48.9%.
- **It is no way to beat the market.** Three together typically ended at +5.3%, the market at +5.5%, with a far
  milder bad case for the market. (The averages favour the stocks, but every list is of today's survivors.)
- **It is about stocks that dropped, not DIP BUYs proper**: there is no "growing" check this far back. On DIP BUYs
  the same pattern showed in the free look above, on lists already seen; the 202 names kept back could confirm it.
- **It says how many, never which**: the picks were random.

Applied as written beforehand: the plan says "three or more rather than one" (a HOW MANY line beside BUY while the
plan covers fewer than three of a portfolio's stocks, a sentence in "What you own" while it covers one or two), and
the evidence box quotes this test where it quoted the replay. An update of the app's numbers stops if S1 or S2 no
longer passes, if the bad case of three together is no longer a loss, if the two averages drift more than a point
apart, or if three together no longer typically lost when the market fell: `tools/evidence/figures.js`.

## Pre-registered #9: taking a profit, for fewer losses (`backtest_validation6.py`)

The user asked the app to say when a position is "a sell opportunity", and said what for: "we are looking to reduce
the risk and not to lose money". Every earlier test judged selling early by the average result, and keeping won
twice (#6 P2, #7 G5). Losing less is another question: how often a position ends below what was paid, and how bad
the bad case is. A free look at the six lists already used (2026-11-25; 4,609 DIP BUY positions) showed what to
expect, and one thing about the question itself: a sale with the money left idle afterwards can never make a loss
more frequent, so the direction is arithmetic and a test can only be about the size.

Taking a profit at +L% can be done two ways, and they are two different things to do. Both were written into
`quality_rules.py`, with their pass marks and what each outcome would do, before the eighth list was downloaded
(the 202 names kept back since 2026-11-22: the last stocks no test had used):

- an **order** placed in advance: sold at exactly +L% in the first week whose high touches it;
- **seen** on the page: sold at the first weekly close at or above +L%, at that close.

The text and the script were reviewed twice by a reviewer who ran the script on the six used lists, and were
committed (`c9a413f`) a minute before the download. The reviews changed the test before it ran:

- The first version judged only an order, while the page can only show a close: about a third of the losses an
  order avoids come from spikes inside a week that never showed in a weekly close. So both ways are judged.
- "P(gap <= 0)" could not fail, because the direction is arithmetic. T1 asks for P(gap < its mark) < 10%, resampling
  the stocks and, separately, the calendar quarters of purchase.
- A thin download would have passed for a real one. The script stops before any figure unless 90% of the symbols
  came back with prices and with an earnings history, and 80% with a week that can be judged.
- **One weekly bar of the provider is wrong** (see "Known limits"): an order would be "filled" by it. #9 counts
  that bar with its close.

Run once, on 2026-11-25: 201 of the 202 symbols found, 197 with an earnings history; 797 DIP BUYs from 109 stocks,
bought 2022-08 → 2026-05. The market rose over the same 26 weeks for 91% of the positions.

| Positions | Ended with a loss | 1 in 10 did worse than | Average | Typical | Sold early |
|---|---|---|---|---|---|
| Kept 26 weeks | 41.7% | −31.8% | +10.6% | +5.6% | |
| Sold once seen at +15% | 29.5% | −28.3% | +6.4% | +15.9% | 60% |
| Sell order at +15% | 24.7% | −24.7% | +5.0% | +15.0% | 69% |
| Sold once seen at +25% | 36.4% | −30.5% | +7.3% | +10.6% | 42% |
| Sell order at +25% | 34.1% | −29.9% | +6.3% | +15.6% | 48% |

| Rule | T1 a loss is rarer (the mark; P under the mark by stock and by quarter; the two halves) | T2 the bad case is milder (2 points, 1 in each half) | Verdict |
|---|---|---|---|
| Seen at +15% (T1 decides) | +12.2 points (5; 0.0% and 0.0%; +11.9 and +12.5) | +3.5 (+6.0 and +3.5) | **PASS** |
| Seen at +25% (T1 decides) | +5.3 points (4; 11.5% and 11.6%; +4.5 and +6.0) | +1.3 (+2.8 and +1.3) | **FAIL**: not surely above its mark |
| Order at +15% (T1 and T2) | +16.9 points (7; 0.0% and 0.0%; +16.9 and +17.0) | +7.1 (+10.7 and +6.4) | **PASS** |
| Order at +25% (T1 and T2) | +7.5 points (4; 0.2% and 0.4%; +7.1 and +8.0) | +1.9 (+3.7 and +1.5) | **FAIL**: T2 is 0.1 point under its mark |

Read plainly:

- **Taking a profit at +15% made a loss clearly rarer, and cost about half of the average.** A loss in 25% to 30%
  of positions against 42%, for an average of +5.0% to +6.4% against +10.6%. The typical result was higher with
  it (+15% against +5.6%): selling early wins more often and earns less, as in #6 and #7.
- **What a reader faces when the rule applies.** Of the positions that closed a week 15% up (60% of them), 20.3%
  still ended with a loss when kept; kept, they made +27.5% on average, sold +20.5%. Of those a sell order at
  +15% would have sold (69%): 24.6%, and +23.2% against +15.0%.
- **+25% did not reach its marks**, narrowly for a sell order (the bad case 1.9 points milder against 2). Applied
  as written: it is not offered.
- **Looking less often catches less.** Sold once seen at +15%: a loss was rarer by 12.2 points looking every week,
  10.7 every second week, 9.0 every fourth.
- **It is not a way to make more.** The average is lower in every case, and "a loss is rarer" is said of that one
  position with the money idle afterwards, not of what the money does next. Almost all of it was tested in a rising
  market.
- Reported only: one figure a stock, a loss for 29% of stocks when kept, 23% (seen at +15%) and 19% (order at +15%);
  positions that lost 20% or more: 17% when kept, 13% and 11%.

Applied as written beforehand: +15% is offered as one more setting of the user's own ("Take a profit at", "no level"
until picked). With it picked, the plan names a holding it covers once its price is 15% above what was paid
(YOUR LEVEL) and gives the price of a sell order at that level for the others (ORDER PRICE); each says both sides
in this test's numbers, neither says to sell, and KEEP stays. The evidence box quotes the test with its limits.
The first whole download is the result: `TAKE_PROFIT_REGISTERED` in `tools/evidence/figures.js` holds its four
verdicts, a rule that failed then is not offered whatever a later download says, and an update of the app's
numbers stops if an offered rule no longer passes, no longer makes a loss rarer or the average lower, if the
stocks it sold no longer made more when kept, or if the market no longer rose for most of the test's purchases
(the app says "rising" once, with that share beside it).

After the run the script was changed once: it now also records the "looking every second and fourth week" figures
it had only printed, because the evidence box quotes them. Run again on the saved download, its output is the
same to the character, and so is every figure it recorded before.

### Since 2026-11-26 the app quotes this test on the corrected bars

The correction of that day (below) put the earlier tests right for the provider's year bar. This test had counted
that bar with its close where a sell order is filled and nowhere else: not in the 52-week high a dip is measured
from. It was first left as it was run. That was a judgement and not something its text settles: the text is
silent on which positions are dips, and "the first whole download is the result" was written about later
downloads, not about a fault in this one. Asked the same day, the user decided: this test reads the corrected
bars like every other, and +25% stays not offered.

- The script reads the corrected bars. `python backtest_validation6.py --as-run` reads them as downloaded: it
  prints the run of 2026-11-25 again, the same to the character, and records nothing.
- **The run of 2026-11-25 is still the result.** Its four verdicts decide what the app offers
  (`TAKE_PROFIT_REGISTERED` in `tools/evidence/figures.js`), and the tables above are that run. What moved is
  what the app quotes: 26 figures, all of this test, by tenths.
- 10 of the 797 positions were a dip only because of that bar. Without them: 787 positions from 108 stocks, the
  same months, the market rising for 91% of them as before.

| Positions, corrected bars | Ended with a loss | 1 in 10 did worse than | Average | Typical | Sold early |
|---|---|---|---|---|---|
| Kept 26 weeks | 41.8% | −32.2% | +10.5% | +5.5% | |
| Sold once seen at +15% | 29.9% | −28.6% | +6.3% | +15.9% | 59% |
| Sell order at +15% | 25.0% | −25.5% | +4.9% | +15.0% | 68% |
| Sold once seen at +25% | 36.6% | −30.6% | +7.1% | +10.2% | 41% |
| Sell order at +25% | 34.4% | −29.9% | +6.1% | +15.2% | 48% |

| Rule, corrected bars | T1 a loss is rarer (the mark; P under the mark by stock and by quarter; the two halves) | T2 the bad case is milder (2 points, 1 in each half) | As it comes out now |
|---|---|---|---|
| Seen at +15% (T1 decides) | +11.9 points (5; 0.0% and 0.1%; +12.4 and +11.6) | +3.6 (+3.3 and +4.2) | PASS, offered |
| Seen at +25% (T1 decides) | +5.2 points (4; 13.4% and 12.7%; +4.8 and +5.6) | +1.7 (+1.1 and +1.2) | FAIL, not offered |
| Order at +15% (T1 and T2) | +16.8 points (7; 0.0% and 0.0%; +17.7 and +16.0) | +6.8 (+9.4 and +7.2) | PASS, offered |
| Order at +25% (T1 and T2) | +7.4 points (4; 0.5% and 0.5%; +7.6 and +7.2) | +2.3 (+1.7 and +2.8) | PASS on these bars, **not offered** |

Of the positions that closed a week 15% up (59%), 20.1% still ended with a loss when kept; kept, they made +27.6%
on average, sold +20.5%. Of those a sell order at +15% would have sold (68%): 24.5%, and +23.2% against +15.0%.
Sold once seen at +15%, a loss was rarer by 11.9 points looking every week, 10.4 every second week, 8.8 every
fourth.

**A sell order at +25% reaches its marks on these bars and is not offered.** Its bad case is 2.3 points milder
where it was 1.9, against a mark of 2: three tenths over, where it was a tenth under. P(under the mark) is 35.5%
and 34.1%, so on this evidence it is a coin toss either way, as the test's own text expects (no P decides T2,
because on a list of this size a 1-in-10 result cannot tell 2 points from 4). A result is not re-read after the
fact into an offer, and the user left it out. `TAKE_PROFIT_LEFT_OUT` in `tools/evidence/figures.js` holds that
decision with its day, so an update of the numbers does not bring it up again; any other rule that turns to PASS
is still noted, and still not offered. On the page its figures stand with those of "seen at +25%", set apart
under "Not offered: under the marks written down before the test, the first time it was run". Offering it stays
the user's decision.

## A free look: which ten to keep, by potential gain or loss (`explore_gain_loss.py`, not shipped)

The user asked which ten stocks to keep if a portfolio of every stock marked DIP BUY (19 that day) had to shrink to
ten, and asked for a study of "max potential gain and least potential loss". In the app a stock's potential gain
and loss are its good case and its bad case, and both come from its volatility, so the two wishes pull apart: the
stocks with the biggest good case are the ones with the biggest bad case. The look (2026-11-22) asks what each way
of keeping ten did afterwards. It is not a test: every list had been looked at before.

Method: on every date, 19 of that date's candidates are drawn (200 draws), ten of them are kept by a rule that uses
only what was known then, and the ten are held for half a year, in equal amounts and sized by equal risk. Three
sets of data: the DIP BUYs proper of the six out-of-sample lists (weekly, 138 weeks from 2023-10 to 2026-05), and
stocks that dropped 15%+ on 30 years of monthly prices, on the four lists used before #8 (A) and on the three
lists of #8 (B). How the results would be read was written into the script before its first run.

| Ten kept (weekly / monthly A / monthly B; points against any ten, equal amounts) | Typical result | Bad case (1 basket in 10) | Bad case when the market fell (A / B) | Ahead of any ten on |
|---|---|---|---|---|
| Lowest volatility ("least loss", the app's way) | −3.3 / −2.2 / −1.5 | +0.4 / +0.2 / +2.2 | +1.6 / +5.2 | 19% / 28% / 34% of dates |
| Highest volatility ("max gain", the app's way) | +3.9 / +2.2 / +1.8 | −1.0 / −0.8 / −3.0 | −2.2 / −5.9 | 79% / 71% / 67% |
| Own record: mildest own bad case | −1.3 / −1.5 / −0.9 | +0.8 / −0.1 / +1.6 | +1.7 / +3.1 | 28% / 34% / 39% |
| Own record: highest own good case | −0.4 / +0.7 / 0.0 | −0.6 / −0.4 / −1.2 | +0.2 / −2.2 | 52% / 60% / 56% |
| Own record: both together | −0.6 / −0.3 / −0.4 | 0.0 / −0.3 / +0.2 | +1.2 / +1.4 | 46% / 47% / 47% |
| Furthest below the 12-month high | +0.8 / +0.3 / +0.5 | −2.5 / −1.3 / −3.1 | −2.4 / −4.4 | 56% / 59% / 56% |
| Fell least | −1.0 / −0.6 / −0.4 | +2.1 / +1.1 / +2.8 | +2.5 / +4.1 | 42% / 41% / 46% |
| All 19, nothing chosen | +0.5 / +0.4 / +0.6 | +2.3 / +1.5 / +1.9 | +1.0 / +1.5 | |

A stock's own record is the worst and the best tenth of its own 6-month results after its earlier drops, as far as
they were known on the date. The last two rules by the distance to the high, and the same tables for the months
with the VIX at 25 or more, were added after the first run of the other five and before looking at what they give.
Sized by equal risk the picture is the same. `python explore_gain_loss.py 15` runs it for 15 marked stocks.

Read plainly:

- **Nothing did both.** No way of keeping ten had a milder bad half-year and a higher typical result than any ten.
- **The most volatile ten earned more and lost more.** They were ahead of any ten on about seven dates in ten and
  typically ended 2 to 4 points higher, on all three sets and in both halves of the 30 years; their bad case was 1
  to 3 points worse, and 2 to 6 worse when the market fell. This is the "riskier one first" of #6's orderings
  again. It is not an edge to ship: every list is of companies that exist today, which flatters exactly this
  choice (the jumpiest stocks that went under are missing), and the look cannot say by how much.
- **The calmest ten gave up gain for little.** 1.5 to 3.3 points of typical result and 8 to 17 points of the good
  case, for a bad case 0.2 to 2.2 points milder (1.6 to 5.2 when the market fell). They were behind any ten on
  two dates in three or more.
- **A stock's own record chose hardly better than chance** (the ten best placed on both were ahead on 46% to 47%
  of dates), and how far a stock had fallen said little: the deepest fallers had a worse bad case for half a point
  of typical result; those that fell least, the reverse.
- **Not choosing was the only thing that softened a bad half-year at no cost**: all 19 against ten of them, 1.5 to
  2.3 points. How many again (#8), not which.

So the plan still says nothing about which. An ordering by volatility would need a pre-registered within-date test
on the 202 names kept back, and its real cost can only be seen on lists that include companies that did not
survive.

## The correction of 2026-11-26: the provider's year bar

One weekly bar of the provider is wrong. The last bar of 2025, stamped 2025-12-31 for 1,296 of the 1,313 stocks
of the eight lists (the tuning list among them) and 2025-12-29 for three, also holds the first trading days of
January 2025 (a stock that has it has no bar for the week ending 2025-01-03), so its high or its low can be a
price of a year before. Its close is sound. The reviewer of pre-registered #9 found it on 2026-11-25. #9 was
written to count that bar with its close where a sell order is filled, and only there; the tests before it read
highs and lows as downloaded and were left as recorded, because putting them right changes numbers the app
quotes. On 2026-11-26 the user decided to have them put right.

What was done:

- `weekly_bars` in `quality_rules.py` gives that bar with its close in place of its high and its low (any bar
  stamped 2025-12-27 to 2025-12-31: the 1,299 above and one sound bar of another listing, stamped 2025-12-30,
  which loses that week's high and low and nothing else), and `build_rows` reads every stock through it. So the
  52-week high a dip is measured from, the lowest point after a purchase (the 20% stop, "fell another 20%+") and
  the highest (the +25% take-profit) no longer see a price of a year before. Everything that builds its rows
  with `build_rows` follows: the weekly tests #1, #2, #5, #6 and #7, the pooled summary, the replay of the plan,
  the orderings and the two free looks.
- Nothing was downloaded for it. Every script was run twice from the downloads already saved: as it stood, which
  gave the recorded figures again (0 of 453 recorded values differed), and with the correction (58 of 453
  moved).
- **No verdict changed.** #5: H1 FAIL, H2 PASS, H3 PASS, H4 FAIL. #6: P1 PASS, P2 PASS, P3 KEEP. #7: G1 PASS,
  G2 FAIL, G3 INCONCLUSIVE, G4 FAIL, G5 PASS. Every check of `tools/evidence/figures.js` passes on the corrected
  figures. Keeping stays ahead of selling early wherever it was tested.
- Not touched: the monthly tests (#3, #4, #8: month-end prices, which have no such bar; #4 also counts weekly
  dips to check its stand-in for "growing", and that count moved from 5,979 to 5,967 with the agreement still at
  81%, and nothing it records); and the first exploration scripts of 2026-10 (`backtest.py`, `backtest2.py`,
  `backtest_final.py`), which build their own bars for a timing rule the app no longer uses. No test and no
  quoted figure rests on those three.
- Pre-registered #9 was left as it was run that morning and brought in the same day, by the user's decision: its
  script reads the corrected bars, its first run is still the result, and +25% is still not offered. 115 more
  recorded values moved, all of that test, and 26 figures the app quotes, by tenths (keeping +10.5% for +10.6%,
  a sell order at +15% +4.9% for +5.0%). The end of its section has them.

What it moved in what the app quotes, each figure as recorded on 2026-11-22 and as corrected:

| Figure | As recorded | Corrected |
|---|---|---|
| Selling at +25%, sixth list (#6 P2): average result / sold early | +7.4% / 61% | +5.3% / 57% |
| Selling at +25%, seventh list (#7 G5): average result / sold early | +5.5% / 45% | +4.5% / 43% |
| A 20% stop, fresh list (#5 H3): average result / stopped out | +7.1% / 53% | +8.1% / 52% |
| A 20% stop, seventh list (#7 G5): average result | +6.5% | +6.9% |
| Volatile DIP BUYs that fell another 20%+ within 13 weeks (#5 H2) | 41% | 40% |
| DIP BUYs that fell another 20%+ first, all six lists | 34% | 33% |
| Every dip, all six lists: average / typical result | +9.8% / +3.6% | +9.9% / +3.7% |
| The typical DIP BUY's lowest point in the next 13 weeks | 14% below | 13% below |
| How deep below the high the tested DIP BUYs reach (95th percentile) | 59% | 58% |
| Calm DIP BUYs on the fresh list: the bad case the sizes are worked out from | 24% | 23% |
| Calm DIP BUYs on the fresh list: the typical result | +4.1% | +4.3% |

What keeping gave beside them did not move: +20.2% on the sixth list, +9.3% on the seventh, +12.0% on the fresh.
In the replay of the plan a few printed figures moved, by 1.2 points at most (the index's median batch is +10.0%
for +9.9%; one position alone beat the index 46% of the time for 45%, ten together 53% for 52%; four monthly
batches, the one of 2026-04 by the most, +8.3% for +7.1%); what the app quotes from it did not move. Two things
reach further than a quoted number:

- **The sizes of calm stocks.** The app divides the user's limit by the bad case of a stock's volatility group.
  3 of the 1,604 positions of the fresh list were a dip only because of that bar, two of them calm ones. Without
  them the calm group's bad case is 23.2% where it was 23.5%, and the page rounds that to 23% where it showed
  24%. So the amount of a calm stock that fits a limit comes out about 4% larger, and a calm holding's bad case
  in dollars about 4% smaller. The volatile group and the one in between keep 41% and 31%. A size in "Could add"
  is also each stock's share of the risk among the stocks of a portfolio, so beside a calm holding the sizes of
  the others come out a little smaller (about 1% in a portfolio of five), and what could be added to a holding
  moves by a few percent with them.
- **Which positions count.** 6 of the 4,609 pooled DIP BUY positions (and 55 of the 16,707 dips) were a dip only
  because of that bar; 4,603 are left.

The older sections of this README give four runs with the figures of their day (tuning, holdout, validation, mid
caps), and those tables are left as they were written. Run again with the correction, their 26-week averages
move by a few tenths of a point, and by about a point in the smallest groups (the tuning list's in-sample
"+66.0%" reads +64.9%); their 13-week averages by up to 3.2 points; and the column "fell another 20%+", which
reads the lows, by 2 to 11 points in the small groups of the tuning list and of the holdout (that bar's low had
counted as a fall: for the tuning list's rule E in the later half, 20.0% where it read 31.4%). The mid-cap idea
still fails. The two free looks (`explore_least_tied.py`, `explore_gain_loss.py`) moved
by a few tenths and read the same, and their tables are left too.

## Known limits of these tools

- Every list is of companies that exist today (survivorship bias), and all weekly tests cover one market period.
- Analyst targets and ratings have no history in these sources. The app keeps a daily log so they can be tested
  later (in its database, under the store's key `log`; the app records it itself on weekdays, and "Export log"
  in the Dip candidates card gives a copy).
- A refresh keeps the same lists of symbols, so companies that are taken over or delisted later drop out of them:
  survivorship grows slowly with every refresh. The update stops if more than a tenth of the stocks go missing.
- `fundamentals()` dates annual statements by `reportDate`, which is the fiscal year end, not the filing date
  (`sourceDate`), so the valuation and debt factors could see a statement one to three months early. Both were
  rejected anyway and the shipped rule uses only quarterly release dates, so no shipped number depends on it;
  `backtest_regime.py` uses `sourceDate`.
- **One weekly bar of the provider is wrong** (found on 2026-11-25 by the reviewer of #9). The last bar of 2025,
  stamped 2025-12-31 (2025-12-29 for three stocks), also holds the first trading days of January 2025, so its
  high or its low can be a price of a year before. Its close is sound, and the downloads of 2026-10-31,
  2026-11-22 and 2026-11-25 all show it. Since
  2026-11-26 every row is built from bars in which it counts with its close (`weekly_bars` in
  `quality_rules.py`; "The correction of 2026-11-26" above has what that moved). Only two things still read it
  as downloaded: the first exploration scripts of 2026-10, and `backtest_validation6.py --as-run`, which shows
  the first run of pre-registered #9 again (10 of its 797 positions were a dip only because of that bar). The
  repair
  goes by the bar's date, so it holds for this fault only: a refresh that brings a bar like it at another year's
  end would have to be looked at again. The live page takes a stock's 52-week high from its quote, not from these
  bars.
- One stock of the eighth list (APLS) has a placeholder of the provider, −99,999,901, in place of its weekly low
  on 255 bars and of its high on 99. It has no earnings history, so it gives no row and no position, and no
  figure rests on it; but nothing guards against such a value, so a stock that had both would have to be caught
  by looking at the bars (found by the reviewer of the correction above).
- Universe bookkeeping: weekly-data questions have now been looked at on all eight lists (tuning, holdout,
  validation, mid caps, fresh, sixth, seventh, eighth). Pre-registered #9 used the eighth, the 202 names that
  were kept back: **no unused stocks are left**. A new question about weekly prices has only the future to be
  tested on (the daily log). Long-history (monthly, 1994+) questions have been looked at on seven lists (#8 used
  the fresh, sixth and seventh); the eighth has no monthly history downloaded.
