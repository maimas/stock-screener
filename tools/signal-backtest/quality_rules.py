"""
Frozen point-in-time rules shared by backtest_quality.py (where the rule was chosen) and backtest_holdout.py
(out-of-sample check on stocks that were never looked at while choosing it). Do not tune these on the holdout.

  Growth  (+1/0/-1)  EPS outlook = (next quarter's consensus + last 3 reported quarters) vs trailing 4 quarters,
                     or revenue growth = latest reported quarter vs the same quarter a year earlier.
                     +1 if EPS outlook >= 10% or revenue >= 15%; -1 if EPS outlook <= -5% and revenue < 5%.
  Value   (+1/0/-1)  trailing P/E vs the min/max of the annual average P/E over the previous 5 fiscal years.
  Red flags (-1)     trailing EPS <= 0; debt/equity (latest annual statement) > 2.
"""
import json, os, statistics

DIP_PERCENT = 15
# One weekly bar of the provider is wrong (found 2026-11-25, before pre-registered #9 was run): the bar stamped with
# this day also holds the first trading days of January 2025, so its high or its low can be a price of a year
# before. Its close is sound. Pre-registered #9 counted it with its close for a sell order, and left the tests before
# it as recorded. Since 2026-11-26 every row is built from bars in which it counts with its close (`weekly_bars`):
# the owner's decision, and the README says what that moved.
YEAR_BAR = '2025-12-31'
# A few listings carry the same bar on another of the last days of that year (three stocks on 2025-12-29, among
# the 1,313 of the eight lists), so the repair goes by these days, first and last. (One sound bar of another
# listing, stamped 2025-12-30, falls in the window too and loses that week's high and low.)
YEAR_BAR_DAYS = ('2025-12-27', '2025-12-31')


def weekly_bars(ser, as_downloaded=False):
    """A stock's weekly bars as (date, high, low, close), oldest first; a week without a price is left out.
    The provider's year bar counts with its close: its high and its low are not that week's (YEAR_BAR).
    `as_downloaded` leaves that bar as the provider gave it. Only pre-registered #9 asks for that: it was written
    and run on the bars as downloaded, counting the year bar with its close for a sell order alone (`up26_order`),
    and its first whole download is the result."""
    bars = [(t[:10], h, l, c) for t, h, l, c in zip(ser['timeStamps'], ser['pricesHigh'], ser['pricesLow'], ser['prices'])
            if None not in (h, l, c)]
    if as_downloaded:
        return bars
    first, last = YEAR_BAR_DAYS
    return [(day, c, c, c) if first <= day <= last else (day, h, l, c) for day, h, l, c in bars]


def fetch_fundamentals(bt, ids, earn_cache, annual_cache):
    """Quarterly earnings history and annual statements for the given MSN ids, cached to disk."""
    if os.path.exists(earn_cache):
        earn = json.load(open(earn_cache, encoding='utf-8'))
    else:
        earn = []
        for i in range(0, len(ids), 15):
            earn += [e for e in bt.flat(bt.get(f"https://assets.msn.com/service/Finance/Events/Earnings?{bt.Q}&ids={','.join(ids[i:i+15])}"))
                     if isinstance(e, dict)]
        json.dump(earn, open(earn_cache, 'w', encoding='utf-8'))
    if os.path.exists(annual_cache):
        annual = json.load(open(annual_cache, encoding='utf-8'))
    else:
        annual = {}
        for i in range(0, len(ids), 15):
            for qs in bt.flat(bt.get(f"https://assets.msn.com/service/Finance/QuoteSummary?{bt.Q}&ids={','.join(ids[i:i+15])}&intents=Quotes,Exchanges,QuoteDetails")):
                a = (((qs or {}).get('equity') or {}).get('analysis') or {}).get('annualStatements')
                if a:
                    annual[qs['instrumentId']] = a
        json.dump(annual, open(annual_cache, 'w', encoding='utf-8'))
    return {e['InstrumentId']: e for e in earn if e.get('InstrumentId')}, annual


def fundamentals(earn_rec, annual_rec, date, price):
    qs = ((earn_rec or {}).get('History') or {}).get('quarterly') or {}
    dated = [((qs[k].get('EarningReleaseDate') or '')[:10], qs[k]) for k in sorted(qs)]
    dated = [(d, q) for d, q in dated if d]
    past = [q for d, q in dated if d < date]
    future = [q for d, q in dated if d >= date]
    nxt = future[0] if future else None
    if len(past) < 8:
        return None
    eps = [q.get('EpsActual') for q in past]; rev = [q.get('RevenueActual') for q in past]
    if None in eps[-8:]:
        return None
    ttm = sum(eps[-4:])
    eps_outlook = None
    if ttm > 0 and nxt and nxt.get('EpsForecast') is not None:
        eps_outlook = ((nxt['EpsForecast'] + sum(eps[-3:])) / ttm - 1) * 100
    rev_g = (rev[-1] / rev[-5] - 1) * 100 if rev[-1] and rev[-5] and rev[-5] > 0 else None
    rev_g_prev = (rev[-2] / rev[-6] - 1) * 100 if rev[-2] and rev[-6] and rev[-6] > 0 else None
    surprise = past[-1].get('EpsSurprisePercent')

    g = 0
    if (eps_outlook if eps_outlook is not None else -1e9) >= 10 or (rev_g if rev_g is not None else -1e9) >= 15:
        g = 1
    elif (eps_outlook if eps_outlook is not None else 0) <= -5 and (rev_g if rev_g is not None else 0) < 5:
        g = -1

    v = 0
    years = sorted((y, s) for y, s in (annual_rec or {}).items() if (s.get('reportDate') or s.get('endDate') or '9999')[:10] < date)
    pes = [s.get('averagePE') for _, s in years[-5:] if s.get('averagePE') and s.get('averagePE') > 0]
    if ttm > 0 and len(pes) >= 3:
        pe = price / ttm; lo, hi = min(pes), max(pes)
        if hi > lo * 1.2:
            v = 1 if pe < lo else -1 if pe > hi else 0

    red = 0
    if ttm <= 0:
        red += 1
    de = years[-1][1].get('debtToEquityRatio') if years else None
    if de is not None and 0 <= de <= 50 and de > 2:
        red += 1
    # Extra raw features (descriptive only; the frozen rules above don't use them).
    return dict(growth=g, value=v, red=red, score=g + v - red,
                eps_outlook=eps_outlook, rev_g=rev_g, rev_g_prev=rev_g_prev, surprise=surprise,
                days_to_report=(_days(date, (nxt.get('EarningReleaseDate') or '')[:10]) if nxt else None))


def _days(a, b):
    from datetime import date as d
    try:
        return (d.fromisoformat(b) - d.fromisoformat(a)).days
    except ValueError:
        return None


def build_rows(data, earn, annual, step_weeks=4, as_downloaded=False):
    """One row per stock every `step_weeks` weeks: dip / trend state, fundamentals as of that date, forward outcomes.
    `as_downloaded`: see `weekly_bars` (pre-registered #9 only)."""
    rows = []
    for sym, sid in data['ids'].items():
        ser = data['charts'].get(sid)
        if not ser:
            continue
        bars = weekly_bars(ser, as_downloaded)
        closes = [b[3] for b in bars]
        for t in range(56, len(bars) - 26, step_weeks):
            c = closes[t]; date = bars[t][0]
            hi52 = max(b[1] for b in bars[t-51:t+1]); dip = (hi52 - c) / hi52 * 100
            ma = sum(closes[t-39:t+1]) / 40
            rets = [closes[i] / closes[i-1] - 1 for i in range(t-51, t+1)]
            vol = statistics.pstdev(rets) * 52 ** 0.5 * 100
            rows.append(dict(sym=sym, date=date, dip=dip >= DIP_PERCENT, above=c >= ma, dip_pct=dip, vol=vol,
                             mom=(c / closes[t-52] - 1) * 100,
                             f=fundamentals(earn.get(sid), annual.get(sid), date, c),
                             f13=(closes[t+13]/c-1)*100, f26=(closes[t+26]/c-1)*100,
                             dd13=(min(b[2] for b in bars[t+1:t+14])/c-1)*100,
                             # lowest weekly low over the whole 26-week holding period (for the stop-loss question)
                             dd26=(min(b[2] for b in bars[t+1:t+27])/c-1)*100,
                             # Added 2026-11-21 for the questions of pre-registered #6 (the frozen rules do not use them):
                             # highest weekly high in the holding period (a take-profit), the result after 52 weeks
                             # (None when the data ends first), and the 13 weeks before.
                             up26=(max(b[1] for b in bars[t+1:t+27])/c-1)*100,
                             # Added 2026-11-25 for pre-registered #9 (nothing before it uses them): the 26 weekly
                             # closes of the holding period in % of the entry close; the last one is f26.
                             closes26=[(closes[i]/c-1)*100 for i in range(t+1, t+27)],
                             # Added with it: the highest weekly high of the holding period as a sell order would
                             # meet it. The bar stamped YEAR_BAR counts with its close, because its high can be a
                             # price of a year before. (Where `weekly_bars` has put that bar right this is `up26`
                             # again; #9 reads the bars as downloaded, and there it is not.)
                             up26_order=(max(b[3] if b[0] == YEAR_BAR else b[1] for b in bars[t+1:t+27])/c-1)*100,
                             f52=(closes[t+52]/c-1)*100 if t + 52 < len(bars) else None,
                             mom13=(c/closes[t-13]-1)*100))
    return rows


# Frozen rule definitions, evaluated among dips.
def solid_score(r):   # previous app rule's fundamental part
    return r['f']['score'] >= 1 and r['f']['red'] == 0


def grower(r):        # current app rule's fundamental part
    return r['f']['growth'] == 1 and r['f']['red'] == 0


RULES = [
    ("A. Buy every dip", lambda r: True),
    ("B. Trend intact only", lambda r: r['above']),
    ("C. Fundamental score >= 1, no red flag", solid_score),
    ("D. Trend + fundamental score (previous app rule)", lambda r: r['above'] and solid_score(r)),
    ("E. Trend + growing + no red flag (app DIP BUY)", lambda r: r['above'] and grower(r)),
    ("   Growing, no red flag, trend broken (app WAIT)", lambda r: not r['above'] and grower(r)),
]


# ---------------------------------------------------------------------------------------------------------------
# PRE-REGISTERED for backtest_validation.py (written 2026-10-31, after seeing the tuning and holdout universes,
# BEFORE downloading or looking at the validation universe):
#   Candidate F = "dip in a growing company" (growth +1, trend and red flags ignored). Chosen because growth was
#   the only factor whose ordering (+1 > 0 > -1) replicated in both universes; the trend gate and red-flag gate did not.
#   Decision: ship F as the app's DIP BUY only if, on the validation universe, F beats A (every dip) in pooled 26w
#   mean with stock-bootstrap P(gap <= 0) < 10%. Otherwise report that no rule reliably beats buying every dip.
#   E (current app rule) and B are reported alongside, but are not eligible to be re-chosen on this data.
# ---------------------------------------------------------------------------------------------------------------
CANDIDATES = [
    ("A. Buy every dip", lambda r: True),
    ("B. Trend intact only", lambda r: r['above']),
    ("E. Trend + growing + no red flag (current app)", lambda r: r['above'] and grower(r)),
    ("F. Growing (pre-registered candidate)", lambda r: r['f']['growth'] == 1),
    ("   Not growing (growth 0 or -1)", lambda r: r['f']['growth'] < 1),
    ("   Shrinking (growth -1)", lambda r: r['f']['growth'] == -1),
]


# ---------------------------------------------------------------------------------------------------------------
# PRE-REGISTERED #2 for backtest_validation2.py (written 2026-11-01, after exploring the three earlier universes,
# BEFORE downloading the fourth, mid-cap universe):
#   Among growing dips (F), candidate S = "earnings-backed growth": EPS outlook >= 10% (vs revenue-only growth).
#   It was the only extra split that ranked growing dips the same way in all three earlier universes, for both
#   return and the chance of a further 20% drop.
#   Decision: mark S as the app's "strong" DIP BUY only if, on the mid-cap universe, S beats revenue-only growing dips
#   in pooled 26w mean with stock-bootstrap P(gap <= 0) < 10% AND has a lower rate of further 20%+ drops.
#   Also reported (NOT eligible to ship from this run): F vs A again, and "missed last quarter" among growing dips.
# ---------------------------------------------------------------------------------------------------------------
def earnings_backed(r):
    return r['f']['growth'] == 1 and (r['f']['eps_outlook'] if r['f']['eps_outlook'] is not None else -1e9) >= 10


CANDIDATES_2 = [
    ("A. Buy every dip", lambda r: True),
    ("F. Growing", lambda r: r['f']['growth'] == 1),
    ("S. Growing, earnings-backed (EPS outlook >= 10%)", earnings_backed),
    ("R. Growing, revenue-only", lambda r: r['f']['growth'] == 1 and not earnings_backed(r)),
    ("   Not growing", lambda r: r['f']['growth'] < 1),
    ("   Growing, beat last quarter", lambda r: r['f']['growth'] == 1 and (r['f']['surprise'] or 0) > 0),
    ("   Growing, missed/inline last quarter", lambda r: r['f']['growth'] == 1 and (r['f']['surprise'] or 0) <= 0),
]


# ---------------------------------------------------------------------------------------------------------------
# PRE-REGISTERED #5 for backtest_validation3.py (written 2026-11-21, after exploring all four earlier universes for
# these questions, BEFORE downloading the fifth, "fresh" universe; its symbols were picked by name only):
#   These are RISK and HOLDING notes for the tooltip. H1-H3 cannot change the verdict.
#   Among DIP BUYs (dip >= 15% and growing), on the fresh universe:
#   H1 deep dips.   "Deep" = 45%+ below the 52-week high, "regular" = 15-45%. Seen so far: 52% of deep ones fell
#                   another 20%+ within 13 weeks vs 25% of regular ones (pooled holdout / validation / mid caps).
#                   Ship a deep-dip caution only if the deep rate is >= 10 points higher with stock-bootstrap
#                   P(diff <= 0) < 10%, on at least 30 deep rows from at least 8 stocks (else INCONCLUSIVE: not shipped).
#   H2 volatility.  "High" = trailing-52-week volatility >= 45% a year, "low" = under 35% (the thirds seen so far,
#                   where 38% vs 18% fell another 20%+). Ship a volatility risk line only if the high rate is >= 10
#                   points higher with P(diff <= 0) < 10%, on at least 30 rows from at least 8 stocks in each group.
#   H3 stop-loss.   "Stop" = sell at -20% if a weekly low within the 26 weeks touches it, otherwise hold 26 weeks.
#                   Seen so far: +7.8% with the stop vs +12.3% holding. Ship "a 20% stop lowered the average result"
#                   only if holding beats the stop in mean with stock-bootstrap P(diff <= 0) < 10%.
#   H4 shallow dips (the only one that touches the verdict: RECOMMEND ONLY, the user decides). Growing dips of 20%+
#                   vs growing dips of 15-20%. Seen so far: +13.8% vs +8.5%. Recommend raising the dip threshold to
#                   20% only if 20%+ beats 15-20% in mean with P(diff <= 0) < 10% AND the 15-20% growing dips do not
#                   beat every dip in mean.
#   Four hypotheses at 10% each: if none were true there would still be about a 1-in-3 chance that one passes by
#   luck, so the app says "on N fresh stocks" next to anything shipped from this run and quotes only this
#   universe's numbers.
#   Also reported (NOT eligible to ship or change anything): F vs A again, DIP BUY vs the S&P 500 over the same
#   weeks, and dip vs no dip among growing companies.
#
#   CORRECTED 2026-11-26 for the provider's year bar (YEAR_BAR above; the README has every figure before and
#   after): with that bar counted by its close, 1,601 DIP BUYs from 153 stocks where there were 1,604 from 154.
#   H1 FAIL (35% vs 36%, P = 64%), H2 PASS (40% vs 21%, +18.8 points, P = 0.0%), H3 PASS (+8.1% with the stop vs
#   +12.0% holding, P = 0.0%; it was +7.1%), H4 FAIL (+12.2% vs +11.3%, P = 39%). No verdict changed.
# ---------------------------------------------------------------------------------------------------------------
DEEP_DIP_PERCENT = 45
SHALLOW_DIP_PERCENT = 20
VOL_HIGH = 45
VOL_LOW = 35
STOP_PERCENT = 20
MIN_ROWS, MIN_STOCKS = 30, 8


def dip_buy(r):
    return r['f']['growth'] == 1


def stop_return(r):
    """26-week result with a stop: sold at -STOP_PERCENT if any weekly low in the holding period touched it."""
    return -STOP_PERCENT if r['dd26'] <= -STOP_PERCENT else r['f26']


# ---------------------------------------------------------------------------------------------------------------
# PRE-REGISTERED #6 for backtest_validation4.py (written 2026-11-21, after exploring all five earlier universes for
# these questions on the data refreshed that day, BEFORE downloading the sixth universe; its symbols were picked by
# name only, from those never used in any earlier list):
#   The app's "Your plan today" card needs three decisions the earlier tests cannot make: which DIP BUY first,
#   whether to take profits early, and what to do when the 26 weeks are over. Among DIP BUYs (dip >= 15% and
#   growing) on the sixth universe:
#   P1 buy first.   "Sharp" = the stock fell 25%+ over the 13 weeks before (its close against the close 13 weeks
#                   earlier); the rest fell less, or rose. Seen so far (holdout, validation, mid caps and fresh
#                   pooled): sharp +22.3% over 26 weeks vs +9.9%, median +10.0% vs +3.4%, the same rate of a
#                   further 20%+ fall (33%); sharp was ahead on all five lists, and inside both the volatile and
#                   the other DIP BUYs. Nine other orderings were looked at on the same lists and dropped (beat the
#                   last quarter, revenue >= 30%, EPS outlook >= 25%, above the 40-week average, reporting within
#                   two weeks, just reported, fell less than 10%, revenue speeding up, volatile vs calm), which is
#                   exactly why this one needs a fresh test.
#                   Ship "these first" only if ALL hold: sharp beats the rest in pooled mean with stock-bootstrap
#                   P(gap <= 0) < 10%; its median is not lower; its rate of a further 20%+ fall within 13 weeks is
#                   not more than 5 points higher; on at least 30 sharp rows from at least 8 stocks (otherwise
#                   INCONCLUSIVE: not shipped).
#   P2 take profit. "Take-profit" = sell at +25% if a weekly high within the 26 weeks touches it, otherwise hold 26
#                   weeks. Seen so far: +8.6% with it vs +13.8% holding, lower on all five lists.
#                   Ship "taking profits at +25% lowered the average result" only if holding beats the take-profit
#                   in mean with stock-bootstrap P(diff <= 0) < 10%.
#   P3 after 26 weeks. The same positions over weeks 26-52 against the S&P 500 over those weeks (rows whose data
#                   reaches 52 weeks). Seen so far: +12.6% vs +7.0% (excess +5.6 points), but only 46% beat the
#                   index and one list of five was negative.
#                   Ship "KEEP for a second 26 weeks" only if the mean excess is positive with stock-bootstrap
#                   P(excess <= 0) < 10%. Ship "SELL at 26 weeks" only if it is negative with P(excess >= 0) < 10%.
#                   Otherwise the card keeps saying that the tests are silent, and quotes both numbers.
#   Three hypotheses at 10% each: if none were true there would still be about a 1-in-4 chance that one passes by
#   luck, so the app says "on the newest list" next to anything shipped from this run and quotes only this
#   universe's numbers for it.
#   None of this can change the verdict rule. Also reported (NOT eligible to ship or change anything): F vs A
#   again, H2 and H3 again, and DIP BUY vs the S&P 500 over the same weeks.
#
#   RESULT (2026-11-22, 184 stocks): P1 PASS, P2 PASS, P3 KEEP. P2 and P3 are used by the plan card.
#   P1 is NOT used, although it passed as written. Looked at afterwards (`--robust`): P1 pools every date, but
#   the card would order ONE day's candidates, and sharp falls cluster in sell-offs. Inside the weeks that had
#   both kinds the sharp fallers were ahead of the other DIP BUYs in 47% of weeks (38% on the four earlier
#   out-of-sample lists), and five stocks made 74% of their gain. The test written above was the wrong one for
#   that use: an ordering must be pre-registered as a within-week comparison.
#
#   CORRECTED 2026-11-26 for the provider's year bar: P2 reads +5.3% with the take-profit vs +20.2% holding
#   (P = 0.0%; sold early on 57%), where it was +7.4% (sold early on 61%): that bar's high had "sold" positions
#   that never got there. P1 and P3 rest on closes and did not move. No verdict changed.
# ---------------------------------------------------------------------------------------------------------------
SHARP_FALL_PERCENT = 25
SHARP_WEEKS = 13
TAKE_PROFIT_PERCENT = 25
MAX_EXTRA_DROP_POINTS = 5


def sharp_fall(r):
    return r['mom13'] <= -SHARP_FALL_PERCENT


def take_profit_return(r):
    """26-week result with a take-profit: sold at +TAKE_PROFIT_PERCENT if any weekly high in the holding period touched it."""
    return TAKE_PROFIT_PERCENT if r['up26'] >= TAKE_PROFIT_PERCENT else r['f26']


# ---------------------------------------------------------------------------------------------------------------
# PRE-REGISTERED #7 for backtest_validation5.py (written 2026-11-22, BEFORE downloading the seventh universe. Its
# symbols were written down by name only: every second one of the 404 candidates never used in any earlier list,
# the other half being kept back for an eighth list):
#   The plan card now tells the user to buy DIP BUYs (any of them, several rather than one), to keep each for a
#   year and not to sell early. The user's goal asks for more than the tests so far have shown: that following
#   those steps makes a profit. Nothing tested yet asks that directly (#1 to #6 compare one group of dips with
#   another), "owning several beats picking one" rests on a replay that tested no hypothesis, and the "second
#   half-year" rule passed only narrowly on the sixth list (P = 4.8%). So, among DIP BUYs (dip >= 15% and growing)
#   on the seventh universe, 26-week results unless said otherwise:
#   G1 profit.            Ship "made money on stocks never used before" only if the mean result is above zero with
#                         stock-bootstrap P(mean <= 0) < 5%. The typical (median) result and the share that were up
#                         are reported and quoted with it whatever they are: on every list so far the typical result
#                         is small, and a rising market lifts every stock, so this is the lowest of the five bars.
#   G2 more than the market. Ship "more than the market" only if the mean excess over the S&P 500 (SPY) over the
#                         same weeks is positive with P(excess <= 0) < 10%. Otherwise the app says "about the same
#                         as the market" for this list. Seen so far (five out-of-sample lists pooled): +13.9% vs
#                         +10.2%, P = 1.8%, uneven from list to list.
#   G3 several, not one.  From the replay of the plan on this universe alone (backtest_plan.py's method: one
#                         position at a time per stock, sized by the bad case, monthly batches, 400 random picks a
#                         batch): ten positions out of one month's batch were up after 26 weeks more often than one
#                         alone, by at least 10 points. Needs 12 months with ten or more positions (otherwise
#                         INCONCLUSIVE). Seen so far, pooled: 77% vs 59%. If it does not pass, the card stops
#                         saying that owning several beats picking one.
#   G4 the second half-year (P3 again). The same positions over weeks 26-52 against the S&P 500 over those weeks:
#                         mean excess positive with P(excess <= 0) < 10%, on at least 30 rows from at least 8
#                         stocks (otherwise INCONCLUSIVE). If it does not pass, the card goes back to "keep for 6
#                         months" and a holding older than that becomes YOUR CALL: one narrow pass and one miss is
#                         not a rule.
#   G5 no selling early (P2 and H3 again). Holding beats the +25% take-profit in mean with P(diff <= 0) < 10%, AND
#                         holding beats the 20% stop in mean with P(diff <= 0) < 10%. A half that fails is dropped
#                         from the KEEP step's wording.
#   Five questions: if none of the claims were true there would still be about a 1-in-3 chance that one passes by
#   luck, so anything shipped from this run names the list it was tested on. None of this can change the verdict
#   rule, and no ordering among DIP BUYs is tested (see the result of #6). Also reported, not eligible to ship:
#   F vs A again and H2 again.
#   Whatever the outcome, the seventh universe is pooled into the numbers the app quotes, like every list before it.
#
#   RESULT (2026-11-22, 202 stocks, 775 DIP BUYs from 117 of them): G1 PASS (+9.3% over 26 weeks, P(mean <= 0)
#   under 0.1%; typical +3.6%), G2 FAIL (S&P 500 +10.2% over the same weeks: excess -0.8 points, P = 65%),
#   G3 INCONCLUSIVE (10 months with ten or more positions; ten together up 55%, one alone 58%), G4 FAIL (weeks
#   26-52: +9.4% vs +7.7%, P = 31%), G5 PASS (take-profit +5.5% vs +9.3% holding, P = 1.6%; stop +6.5%, P = 0.1%).
#   Applied as written: the card says the plan made money on new stocks and no more than the market did; it keeps
#   for 6 months again and a holding older than that is YOUR CALL; it no longer says that several beat one.
#
#   CORRECTED 2026-11-26 for the provider's year bar: G5 reads take-profit +4.5% vs +9.3% holding (P = 0.1%; sold
#   early on 43%) and stop +6.9% (P = 0.1%; stopped out on 41%), where they were +5.5% (45%) and +6.5% (42%).
#   G1, G2 and G4 rest on closes and did not move, and neither did G3's replay. No verdict changed.
# ---------------------------------------------------------------------------------------------------------------
PROFIT_P = 0.05
BASKET_LEAD_POINTS = 10
MIN_BASKET_MONTHS = 12


# ---------------------------------------------------------------------------------------------------------------
# PRE-REGISTERED #8 for backtest_several.py (written 2026-11-22, BEFORE downloading the long monthly history of the
# fresh, sixth and seventh lists, which no long-history question has looked at):
#   The user asked whether the app could suggest what to add to a portfolio, and wants a suggestion to do "both":
#   earn more and make a bad half-year hurt less. WHICH stock to add has no dependable answer: no order among one
#   week's DIP BUYs has passed (#6, and eleven orderings since), and a free look on 2026-11-22 at "the one least
#   tied to what you own" found a pick that earned about half as much (+6.6% vs +12.7%) for a bad case two points
#   milder, uneven from list to list. HOW MANY looked different, in that look and in G3's replay, which could not
#   decide it because it asked for months with ten positions: holding several does not change the average, but it
#   raises what one typically gets and softens the bad half-year. That is a claim about spreading a bet, so it can
#   be asked on prices alone, over 30 years that include 2000-02, 2008, 2020 and 2022.
#   Method (long_history.py's rows, as in #3): every month from 1994 on, the stocks that are 15%+ below their
#   12-month high. A month counts when it has at least SEVERAL_MIN_CANDIDATES of them, and every such month counts
#   the same: SEVERAL_DRAWS random picks of one such stock, and as many of SEVERAL_TOGETHER different ones in equal
#   amounts, each held 6 months. "Typical" is the median of those results; the "bad case" is the result that 1 pick
#   in 10 did worse than.
#   Seen so far (tuning, holdout, validation and mid caps: 492 stocks, 388 months; `backtest_several.py --explore`):
#   three together against one alone were typically at +8.0% against +6.7% (the gap was +1.3 to +1.9 in every
#   5 years) with a bad case of -16.9% against -26.6% (a gap of +6.3 to +13.1 in every 5 years); the average was
#   the same, as it must be. In the 98 months after which the market fell, three together still typically lost
#   (-7.4% against -8.1%), with a bad case of -30.9% against -42.5%.
#   S1 a bad half-year hurts less.   Ship it only if, on the three lists pooled, the bad case of three together is
#                         at least SEVERAL_BAD_CASE_POINTS points milder than that of one alone, with a YEAR-cluster
#                         bootstrap P(gap <= 0) < 5% (the months of one year share its market, so years are the
#                         independent units), AND the gap is above zero in both halves (1994-2009, 2010-2026) AND
#                         in the months after which the market fell.
#   S2 the typical result is higher. Ship it only if the typical result of three together is at least
#                         SEVERAL_TYPICAL_POINTS points above that of one alone, with a year-cluster bootstrap
#                         P(gap <= 0) < 5%, AND the gap is above zero in both halves.
#   The pass marks are about half of what was seen (+9.7 and +1.3 points), so that a pass means an effect a user
#   would notice. Three is the number written down because it had most of the effect in the looks (two, five and ten
#   together are reported, not eligible to ship) and because the limits in use, 10% to 15%, let about three stocks
#   of the riskiest kind into a portfolio at full size.
#   What each outcome does, decided now:
#     S1 and S2 pass:  the plan says how many. The BUY step says "three or more rather than one", the evidence box
#                      quotes this test in place of the replay, and "What you own" says so for a portfolio in which
#                      the plan covers fewer than three stocks.
#     S1 only:         the same, saying only that several soften a bad half-year; nothing about the typical result.
#     S1 fails:        the plan says nothing about how many, the replay stays described as a replay, and the
#                      question is closed on long history.
#   Whatever the outcome, the app says what was tested: stocks that dropped (there is no "growing" check this far
#   back), today's survivors, equal amounts; and that the average did not rise, and what three together did when
#   the market fell. It says nothing about WHICH stocks: that stays "any of them".
#   Not touched: the 202 names kept back for an eighth weekly list.
#
#   RESULT (2026-11-22; 618 stocks of the three lists, 58,771 dips, 388 months from 1994 to April 2026):
#   S1 PASS: the bad case of three together was -21.7% against -32.5% for one alone, 10.9 points milder (P(gap <= 0)
#   under 0.1%; +11.2 in 1994-2009, +10.7 in 2010-2026, +12.1 in the 98 months after which the market fell).
#   S2 PASS: the typical result was +5.3% against +3.8%, 1.5 points higher (P under 0.1%; +1.5 and +1.4 in the
#   halves). The average was the same (+8.6% and +8.8%). After which the market fell, three together still typically
#   lost: -10.2%, against -11.2% for one alone. Against the market the picks were no better: three together
#   typically ended at +5.3% and the market at +5.5%, with a far milder bad case for the market (-8.0%).
#   Applied as written: the plan says "three or more rather than one" (a HOW MANY line beside BUY while it covers
#   fewer than three of a portfolio's stocks, and a sentence in "What you own"), and the evidence box quotes this
#   test where it quoted the replay. Nothing says which stocks.
# ---------------------------------------------------------------------------------------------------------------
SEVERAL_TOGETHER = 3
SEVERAL_MIN_CANDIDATES = 10
SEVERAL_DRAWS = 200
SEVERAL_BAD_CASE_POINTS = 5
SEVERAL_TYPICAL_POINTS = 0.5
SEVERAL_P = 0.05


# ---------------------------------------------------------------------------------------------------------------
# PRE-REGISTERED #9 for backtest_validation6.py (written 2026-11-25, BEFORE downloading the eighth universe: the
# other half of the 404 candidates written down by name on 2026-11-22 and kept back until now, 202 symbols. They are
# the last stocks no test has used. None of them was in the app's lists or holdings on 2026-11-25. This text and the
# script were checked twice by an independent reviewer and committed to git before the download):
#   The owner asked the app to say when a position is "a sell opportunity", and said what for: "we are looking to
#   reduce the risk and not to lose money". Every test so far judged selling early by the AVERAGE result, and
#   keeping won twice (#6 P2, #7 G5): a +25% take-profit gave +7.4% against +20.2%, and +5.5% against +9.3%. Losing
#   less is another question: how often a position ends below what was paid, and how bad the bad case is.
#   Two ways of taking a profit at +L%, which are two different things to do:
#     an ORDER placed in advance: sold at exactly +L% in the first week whose HIGH touches it (as #6 P2 was run);
#     SEEN on the page:           sold at the first weekly CLOSE at or above +L%, at that close. The page shows a
#                                 holding at the latest price it has, so this is what a reader who looks once a
#                                 week, after the close, can do.
#   A free look on 2026-11-25 at the six lists already used (holdout, validation, mid caps, fresh, sixth, seventh:
#   4,609 DIP BUY positions from 561 stocks), the first part read by marks written into the script before it ran,
#   the rest added by the reviews of this text:
#     keep 26 weeks:      average +13.1%, 1 position in 10 below -34.6%, ended with a loss 45.5%
#     order at +15%:      average  +4.0%, bad case 6.1 points milder, a loss rarer by 18.8 points
#     order at +25%:      average  +5.9%, bad case 2.9 points milder, a loss rarer by 10.0 points
#     seen at +15%:       average  +5.7%, bad case 3.2 points milder, a loss rarer by 13.5 points
#     seen at +25%:       average  +7.2%, bad case 1.7 points milder, a loss rarer by  6.6 points
#     a 20% stop:         ended with a loss 57%: it turned more positions into losses, so stops are no part of this.
#   On the two newest lists (sixth, seventh) a loss was rarer by 23.0 and 14.5 points (order at +15%), 14.6 and 5.8
#   (order at +25%), 16.7 and 9.9 (seen at +15%), 8.8 and 3.6 (seen at +25%); the bad case was milder by 4.7 and
#   3.5, 2.3 and 1.6, 1.7 and 1.8, 0.9 and 1.2 points. Of the losses an order avoids, 28% (at +15%) and 34% (at
#   +25%) come from spikes inside a week that never showed in a weekly close: positions that touched +L% and never
#   closed a week there mostly ended below cost.
#   One weekly bar of the provider is wrong, and an order would be "filled" by it. The bar stamped 2025-12-31 also
#   holds the first trading days of January 2025 (no stock that has it has a bar for the week ending 2025-01-03), so
#   its high or its low can be a price of a year before; its close is sound. Three downloads show it. For an order
#   that bar counts with its close (YEAR_BAR, and `up26_order` in build_rows), and the figures above are with that.
#   Three of the 1,044 stocks of the used lists carry the same error on a bar stamped 2025-12-29, which YEAR_BAR
#   does not cover; none of them has a position. On the eighth list that can touch a few positions at most. As
#   downloaded they were 21.5 and 12.5 points for a loss rarer, 9.0 and 5.4 for the bad case, +5.3% and +7.5% on
#   average, and 139 and 136 of the 4,609 positions were filled by that bar alone. "Seen" and keeping rest on
#   closes and do not move. The same bar is in the weekly highs and lows of the tests before this one (their
#   take-profit, their stop, and 6 positions in 4,609 that are a dip only because of it): those are left as they
#   were recorded, which the README says once this result is written up; putting them right is a cleanup of its own.
#   What can be learnt. Either way of selling, with the money left idle afterwards, can never make a loss more
#   frequent than keeping, nor the bad case worse: a position that ends below zero either never got to +L% (the
#   same result) or did (then it ends at +L% or above). So the DIRECTION is arithmetic, and "P(gap <= 0)" cannot
#   fail. The test is about SIZE on stocks never used: whether the gain is large enough to notice, with what the
#   average gives up set beside it.
#   Method: as in #6 and #7. Among DIP BUYs (dip >= 15% and growing) on the eighth universe, each evaluation week
#   is a position kept 26 weeks. For each level L of TAKE_PROFIT_LEVELS (15 and 25) and each way, against keeping:
#   T1 a loss is rarer.        The share of positions that end below zero is lower by at least the mark:
#                              LOSS_RARER_POINTS[way][L] points (order: 7 at +15%, 4 at +25%; seen: 5 at +15%, 4 at
#                              +25%), with P(gap < mark) < 10% under BOTH resamplings (2,000 draws each): of the
#                              stocks, and of the calendar quarters the positions were bought in (the positions of
#                              one quarter share its market, so stocks alone would flatter). AND the gap is at least
#                              half the mark in each half of the positions (bought before the middle purchase date,
#                              and on or after it).
#   T2 the bad case is milder. The result 1 position in 10 did worse than is milder by at least
#                              BAD_CASE_MILDER_POINTS (2) points, AND by at least BAD_CASE_HALF_POINTS (1) point in
#                              each half. No P decides here: on a list of this size the resamples of a 1-in-10
#                              result are too wide to tell 2 points from 4 (on the seventh list 90% of them lay
#                              between +0.2 and +3.4 for an order at +25%), so P(gap < mark) is printed and
#                              recorded, not judged.
#   The T1 marks are about half of what the weaker of the two newest lists showed (half of 14.5, 5.8, 9.9 and 3.6
#   points: 7.2, 2.9, 5 and 1.8), but never under 4 points: a loss rarer by less than 1 position in 25 is not worth
#   a line. The T2 mark is 2 points either way.
#   An ORDER at +L% PASSES when T1 and T2 both pass. Selling when SEEN at +L% PASSES when T1 passes: its bad case
#   is expected to be hardly milder (the stocks that fall furthest were mostly never up), so T2 is reported with
#   it and said as it comes out, "milder by N points" from 2 points up and "about as bad" below (by the gap alone,
#   whatever the halves say).
#   The download has to be whole: the script stops before it works anything out unless at least 90% of the 202
#   symbols came back with weekly prices, at least 90% with an earnings history, and at least 80% with a week that
#   can be judged (the lists before: prices for every stock found, an earnings history for 96% to 100% of them, a
#   week that can be judged for 92% to 100%). The caches are then deleted by hand and the download is repeated
#   once; if that is not whole either, every verdict is INCONCLUSIVE, written into the README by hand (the script
#   records nothing when it stops). A run that ends in an error before its first figure has shown nothing and is
#   run again. With fewer than MIN_ROWS positions from MIN_STOCKS stocks every verdict is INCONCLUSIVE too.
#   The first whole download is the result. Later downloads (the refresh of the app's numbers) re-run the script to
#   keep the quoted figures current: they can stop an update when a verdict turns, and can never add an offer.
#   Reported with every verdict and quoted wherever the verdict is, no pass marks:
#     what it costs: the average with the rule and without, and how many positions were sold early. That the
#       average is lower has passed twice. If on this list the average with the rule is not below the average of
#       keeping (the two figures as they come out), the app says that for this list.
#     what a reader faces when the rule applies: of the positions that got to +L% (by a weekly close before the
#       last week for "seen", by a weekly high for an order, the bar of YEAR_BAR counting with its close), how many
#       still ended below what was paid when kept, and what they made on average when kept and when sold.
#   Reported only, not eligible to ship: one figure a stock; the share that lost 20% or more; looking every second
#   and every fourth week instead of every week; for how many positions the market rose over the same 26 weeks.
#   (No stop here: it rests on weekly lows, which the same bar spoils, and stops were judged in #5 and #7.)
#   What each outcome does, decided now:
#     Something passes: the owner gets one more setting of their own beside the cash, the limit and the share kept
#                       outside stocks: the level at which to take a profit, offering only the levels that passed
#                       one way or the other. It is empty to begin with, and until the owner picks a level the plan
#                       is as it was. With a level picked, for every holding the plan covers (bought as a DIP BUY,
#                       inside its 6 months):
#                         passed as SEEN:  the plan names the holding on a line of its own once its price is at or
#                                          above +L% of what was paid;
#                         passed as ORDER: the plan shows the price of a sell order at +L% of what was paid, to be
#                                          placed in advance.
#                       Each says both sides in this test's numbers: a loss was rarer (and the bad case milder, or
#                       about as bad), and the average was lower. Neither tells the owner to sell: it reports, and
#                       the decision is theirs. KEEP stays as it is: on the average, selling early paid less, which
#                       is still what the tests found.
#     A level fails one way: that way is not offered at that level.
#     Nothing passes, or INCONCLUSIVE: no setting, nothing in the plan changes, and the evidence box says what was
#                       tested and that it did not reach the marks (or that the list was too thin to say).
#   Either way the evidence box quotes this test with both sides, the weeks it covers as the script prints them
#   (on the six lists used before, most positions were bought from mid-2023 on, and the market rose over the same
#   26 weeks for 88% of them), and its limits: weekly prices; a sale exactly at +L% for an order and at the week's close when seen; the money
#   idle after a sale, so "a loss is rarer" is said of that position and not of money that is put to work again;
#   and what looking every second and every fourth week gave, as it comes out.
#   Four combinations are tested, so whatever passes is quoted with the list it was tested on. This test uses up
#   the eighth universe: no unused stocks are left, and a later question about weekly prices has only the future
#   (the daily log) to be tested on.
#
#   RESULT (2026-11-25, the first whole download: 201 of the 202 symbols found, 797 DIP BUYs from 109 stocks,
#   bought 2022-08 to 2026-05): seen at +15% PASS (a loss rarer by 12.2 points, mark 5); order at +15% PASS (16.9
#   points, mark 7; the bad case 7.1 points milder); seen at +25% FAIL (5.3 points, mark 4, but P(under the mark)
#   11.5% and 11.6%); order at +25% FAIL (T1 7.5 points; T2 1.9 points against 2). Keeping: +10.6% on average, a
#   loss in 41.7%. Applied as written: +15% is offered as a level of the owner's own, +25% is not, KEEP stays.
#   THE CLEANUP (2026-11-26): the owner had the tests before this one put right for the year bar (`weekly_bars`).
#   This test was left out of that, and reads the bars as downloaded (`as_downloaded`), as it was run, so its
#   figures stand. That is a judgement, not something the text above settles: the text says how the bar counts
#   where an order is filled and is silent on which positions are dips. Looked at once and not a result: 10 of the
#   797 positions are a dip only because of that bar, and without them the order at +25% would have a bad case 2.3
#   points milder, over its mark where it was a tenth of a point under (P under the mark 35.5% and 34.1%: a coin
#   toss either way). A result is not re-read after the fact into an offer, so +25% stays out unless the owner
#   decides otherwise. The README has the figures.
#   DECIDED (2026-11-26, the same day): asked, the owner had this test read the corrected bars like every other,
#   with +25% still not offered. So the script now reads them (787 positions from 108 stocks; what the app quotes
#   moved by tenths), and `python backtest_validation6.py --as-run` reads the bars as downloaded and prints the
#   run above again, recording nothing. The run above stays the result: its four verdicts decide what the app
#   offers (TAKE_PROFIT_REGISTERED in tools/evidence/figures.js), whatever the script prints now.
# ---------------------------------------------------------------------------------------------------------------
TAKE_PROFIT_LEVELS = (15, 25)
TAKE_PROFIT_WAYS = ('seen', 'order')
LOSS_RARER_POINTS = {'order': {15: 7, 25: 4}, 'seen': {15: 5, 25: 4}}
BAD_CASE_MILDER_POINTS = 2
BAD_CASE_HALF_POINTS = 1
TAKE_PROFIT_TEST_P = 0.10
MIN_DOWNLOADED_SHARE = 0.90
MIN_JUDGED_SHARE = 0.80


def take_profit_at(percent):
    """An order placed in advance: sold at exactly +percent if any weekly high in the 26 weeks touched it
    (the provider's year bar counting with its close: `up26_order`)."""
    return lambda r: percent if r['up26_order'] >= percent else r['f26']


def take_profit_seen(percent, every=1):
    """Seen on the page: sold at the first weekly close at or above +percent, at that close, looking every `every` weeks."""
    def result(r):
        for week, close in enumerate(r['closes26'], start=1):
            if week % every == 0 and close >= percent:
                return close
        return r['f26']
    return result


def reached(way, percent):
    """Whether the rule would have sold the position before the 26 weeks were over."""
    if way == 'order':
        return lambda r: r['up26_order'] >= percent
    return lambda r: any(close >= percent for close in r['closes26'][:-1])
