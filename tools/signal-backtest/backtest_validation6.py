"""
Sixth pre-registered validation, on the EIGHTH universe, the last one never used: does taking a profit at +15% or
at +25% make a loss rarer and the bad case milder, and what does the average give up for it? Two ways of selling
are judged, an order placed in advance and a sale after the level is seen at a week's close. The questions (T1 a
loss is rarer, T2 the bad case is milder), their pass marks and what each outcome does are in quality_rules.py
(PRE-REGISTERED #9), written before this universe was downloaded. The universe is the other half of the candidates
of backtest_validation5.py: every second one of the 404 never used, starting with the second.

    python backtest_validation6.py           # downloads on first run, then uses eighth_*_cache.json
    python backtest_validation6.py --as-run  # the bars as downloaded, as on the first run of 2026-11-25: it prints
                                             # that run's result again and records nothing
"""
import json, os, random, statistics, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import quality_rules as q
import backtest_validation4 as v4     # the loader and the definitions of #6 (nothing runs on import)
import backtest_validation5 as v5     # the candidates, written down by name on 2026-11-22

LIST = 'eighth'
v4.FILES[LIST] = (f'{LIST}_prices_cache.json', f'{LIST}_earn_cache.json', f'{LIST}_annual_cache.json')
WAY_WORDS = {'seen': "seen at a week's close", 'order': 'an order placed in advance'}
EPSILON = 1e-9      # a gap that is the mark to the last bit of a float counts as reaching it


def eighth_symbols():
    """The eighth universe: the half of the never-used candidates that the seventh left."""
    seventh, _ = v5.seventh_symbols()
    seen = (set(v4.bt.SYMBOLS) | v4.listed('backtest_holdout.py', 'HOLDOUT') | v4.listed('backtest_validation.py', 'VALIDATION')
            | v4.listed('backtest_validation2.py', 'MIDCAPS') | v4.listed('backtest_validation3.py', 'FRESH')
            | set(v4.SIXTH) | v4.ON_SCREEN)
    unused = [s for s in dict.fromkeys(v5.CANDIDATES) if s not in seen]
    eighth = unused[1::2]
    assert not set(eighth) & set(seventh), "the eighth universe must not share a stock with the seventh"
    return eighth


def downloaded(data):
    """How many of the list's stocks came back with weekly prices, and how many with an earnings history."""
    ids = set(data['ids'].values())
    with open(os.path.join(HERE, v4.FILES[LIST][1]), encoding='utf-8') as f:
        earn = json.load(f)
    with_history = {e.get('InstrumentId') for e in earn if isinstance(e, dict) and (e.get('History') or {}).get('quarterly')}
    return sum(1 for sid in ids if data['charts'].get(sid)), len(ids & with_history)


def rule_of(way, level, every=1):
    return q.take_profit_at(level) if way == 'order' else q.take_profit_seen(level, every)


def loss_rate(xs, key):
    """The share of positions that ended below what was paid, in percent."""
    xs = list(xs)
    return 100 * sum(key(r) < 0 for r in xs) / len(xs) if xs else None


def bad_case(xs, key):
    """The result 1 position in 10 did worse than."""
    values = sorted(key(r) for r in xs)
    return values[min(len(values) - 1, int(.10 * len(values)))] if values else None


def lost_fifth(xs, key):
    """The share of positions that lost 20% or more, in percent."""
    xs = list(xs)
    return 100 * sum(key(r) <= -20 for r in xs) / len(xs) if xs else None


def average(xs, key):
    xs = list(xs)
    return statistics.mean(key(r) for r in xs) if xs else None


def quarter(r):
    """The calendar quarter a position was bought in: positions of one quarter share its market."""
    return f"{r['date'][:4]}Q{(int(r['date'][5:7]) - 1) // 3 + 1}"


def halves(xs):
    """The positions bought before the middle purchase date, and the ones bought on or after it."""
    dates = sorted(r['date'] for r in xs)
    cut = dates[len(dates) // 2]
    return [r for r in xs if r['date'] < cut], [r for r in xs if r['date'] >= cut]


def resampled(rows, unit, gap, n=2000, seed=42):
    """`gap(sample)` over n resamples of the rows by `unit` (the stock, or the quarter of purchase), sorted."""
    by = defaultdict(list)
    for r in rows:
        by[unit(r)].append(r)
    keys = sorted(by)
    rng = random.Random(seed)
    gaps = []
    for _ in range(n):
        value = gap([r for k in (rng.choice(keys) for _ in keys) for r in by[k]])
        if value is not None:
            gaps.append(value)
    return sorted(gaps)


def under(gaps, mark):
    """The share of the resamples in which the gap stayed under the mark."""
    return sum(g < mark - EPSILON for g in gaps) / len(gaps)


def question(buys, parts, gap, mark, half_mark, p_decides):
    """One of T1 / T2: the gap, how often it stays under its mark in each resampling, the two halves, and the verdict.
    The P is part of the verdict for T1 (`p_decides`); for T2 it is worked out and recorded only."""
    value = gap(buys)
    by_stock, by_quarter = resampled(buys, lambda r: r['sym'], gap), resampled(buys, quarter, gap)
    in_halves = [gap(part) if part else None for part in parts]
    sure = under(by_stock, mark) < q.TAKE_PROFIT_TEST_P and under(by_quarter, mark) < q.TAKE_PROFIT_TEST_P
    passed = (value >= mark - EPSILON and (sure or not p_decides)
              and all(it is not None and it >= half_mark - EPSILON for it in in_halves))
    return dict(gap=value, mark=mark, pUnderMarkByStock=under(by_stock, mark), pUnderMarkByQuarter=under(by_quarter, mark),
                pDecides=p_decides, low=by_quarter[int(.05 * len(by_quarter))], high=by_quarter[int(.95 * len(by_quarter))],
                halves=in_halves, halfMark=half_mark, passed=passed)


def said(name, unit, it):
    halves_text = ' and '.join('none' if h is None else f"{h:+.1f}" for h in it['halves'])
    return (f"{name}: {it['gap']:+.1f} {unit} (needs {it['mark']:g}), 90% of quarter resamples [{it['low']:+.1f}, {it['high']:+.1f}]; "
            f"P(under the mark{'' if it['pDecides'] else ', reported only'}) {it['pUnderMarkByStock']:.1%} by stock, "
            f"{it['pUnderMarkByQuarter']:.1%} by quarter; "
            f"in the halves {halves_text} (each needs {it['halfMark']:g}): {'PASS' if it['passed'] else 'FAIL'}")


if __name__ == '__main__':
    symbols = eighth_symbols()
    tuning = list(v4.bt.SYMBOLS)
    v4.bt.SYMBOLS = symbols          # what is downloaded when the eighth universe is not on disk yet
    # The first run (2026-11-25) read the bars as downloaded: the provider's year bar counted with its close where
    # a sell order is filled (`up26_order`) and was otherwise as it came, also in the 52-week high a dip is measured
    # from. That run is the result, and its four verdicts decide what the app offers (TAKE_PROFIT_REGISTERED in
    # tools/evidence/figures.js). Since the owner's decision of 2026-11-26 the figures the app quotes are worked out
    # from the corrected bars, like those of every other test: 10 of the first run's 797 positions were a dip only
    # because of that bar. `--as-run` shows the first run again, and records nothing.
    as_run = '--as-run' in sys.argv
    data, rows = v4.load_rows(LIST, as_downloaded=as_run)
    v4.bt.SYMBOLS = tuning

    # ---- The download has to be whole, checked before anything is worked out ----
    with_prices, with_earnings = downloaded(data)
    with_rows = len({r['sym'] for r in rows})
    needed = q.MIN_DOWNLOADED_SHARE * len(symbols)
    print(f"{LIST}: {len(symbols)} never-used candidates, {len(data['ids'])} found, {with_prices} with weekly prices, "
          f"{with_earnings} with an earnings history, {with_rows} with at least one week that can be judged")
    if (with_prices < needed - EPSILON or with_earnings < needed - EPSILON
            or with_rows < q.MIN_JUDGED_SHARE * len(symbols) - EPSILON):
        print(f"STOPPED before working anything out: of the {len(symbols)} symbols, fewer than {q.MIN_DOWNLOADED_SHARE:.0%} came back "
              f"with prices or with an earnings history, or fewer than {q.MIN_JUDGED_SHARE:.0%} with a week that can be judged. "
              f"Delete {LIST}_prices_cache.json, {LIST}_earn_cache.json and {LIST}_annual_cache.json and run this again, once: "
              f"if that is not whole either, every verdict of #9 is INCONCLUSIVE (write that into the README by hand).")
        sys.exit(2)

    f26 = v4.f26
    med = lambda xs, key=f26: statistics.median(key(r) for r in xs)
    buys = [r for r in rows if v4.is_buy(r)]
    print(f"{len(rows)} observations, {len(buys)} DIP BUYs from {len({r['sym'] for r in buys})} stocks"
          + (f" ({min(r['date'] for r in buys)} -> {max(r['date'] for r in buys)})" if buys else ''))
    enough = v4.enough(buys)
    results, ways = {}, {way: {} for way in q.TAKE_PROFIT_WAYS}
    hold = {}
    if buys:
        hold = dict(mean=average(buys, f26), median=med(buys), lossRate=loss_rate(buys, f26), badCase=bad_case(buys, f26),
                    lostFifth=lost_fifth(buys, f26))
        print(f"\nkeep 26 weeks ({v4.size(buys)}): average {hold['mean']:+.1f}%, typical {hold['median']:+.1f}%, "
              f"1 in 10 below {hold['badCase']:+.1f}%, ended with a loss {hold['lossRate']:.1f}%")
    parts = halves(buys) if buys else ([], [])

    for way in q.TAKE_PROFIT_WAYS:
        for level in q.TAKE_PROFIT_LEVELS:
            key = f'{way}{level}'
            print(f"\n== sell at +{level}%, {WAY_WORDS[way]} ({v4.size(buys)}) ==")
            if not enough:
                results[key] = 'INCONCLUSIVE'
                ways[way][str(level)] = dict(verdict='INCONCLUSIVE')
                print(f"too few positions to say (needs {q.MIN_ROWS} from {q.MIN_STOCKS} stocks): INCONCLUSIVE")
                continue
            take = rule_of(way, level)
            got_there = [r for r in buys if q.reached(way, level)(r)]
            figures = dict(mean=average(buys, take), median=med(buys, take), lossRate=loss_rate(buys, take), badCase=bad_case(buys, take),
                           soldEarly=100 * len(got_there) / len(buys), lostFifth=lost_fifth(buys, take))

            # ---- T1: a loss is rarer ----
            t1 = question(buys, parts, lambda s: None if not s else loss_rate(s, f26) - loss_rate(s, take),
                          q.LOSS_RARER_POINTS[way][level], q.LOSS_RARER_POINTS[way][level] / 2, p_decides=True)
            print(f"ended with a loss {figures['lossRate']:.1f}% with it vs {hold['lossRate']:.1f}% keeping")
            print(said('T1 a loss is rarer', 'points', t1))

            # ---- T2: the bad case is milder ----
            t2 = question(buys, parts, lambda s: None if not s else bad_case(s, take) - bad_case(s, f26),
                          q.BAD_CASE_MILDER_POINTS, q.BAD_CASE_HALF_POINTS, p_decides=False)
            print(f"1 in 10 below {figures['badCase']:+.1f}% with it vs {hold['badCase']:+.1f}% keeping")
            print(said('T2 the bad case is milder', 'points', t2))

            # ---- What it costs, and what a reader faces when the rule applies: reported with the verdict ----
            cost = hold['mean'] - figures['mean']
            costs = resampled(buys, lambda r: r['sym'], lambda s: average(s, f26) - average(s, take))
            print(f"what it costs: average {figures['mean']:+.1f}% with it vs {hold['mean']:+.1f}% keeping ({cost:+.1f} points lower, "
                  f"90% [{costs[int(.05 * len(costs))]:+.1f}, {costs[int(.95 * len(costs))]:+.1f}]; lower on this list: {'yes' if cost > 0 else 'NO'}); "
                  f"sold early on {figures['soldEarly']:.0f}%; typical {figures['median']:+.1f}% with it vs {hold['median']:+.1f}% keeping")
            when = {}
            if got_there:
                when = dict(share=figures['soldEarly'], lossWhenKept=loss_rate(got_there, f26), meanWhenKept=average(got_there, f26),
                            meanWhenSold=average(got_there, take), medianWhenKept=med(got_there), badCaseWhenKept=bad_case(got_there, f26))
                print(f"of the {when['share']:.0f}% that got to +{level}%: {when['lossWhenKept']:.1f}% still ended with a loss when kept; "
                      f"kept they made {when['meanWhenKept']:+.1f}% on average (typical {when['medianWhenKept']:+.1f}%, 1 in 10 below "
                      f"{when['badCaseWhenKept']:+.1f}%), sold {when['meanWhenSold']:+.1f}%")
            passed = t1['passed'] and (t2['passed'] or way == 'seen')
            results[key] = 'PASS' if passed else 'FAIL'
            print(f"sell at +{level}%, {WAY_WORDS[way]}: {results[key]}"
                  + (" (T1 decides; T2 is reported)" if way == 'seen' else " (T1 and T2 both needed)"))
            figures.update(verdict=results[key], lossRarer=t1, badCaseMilder=t2, averageLower=cost, lowerOnThisList=cost > 0, whenReached=when)
            ways[way][str(level)] = figures

    print("\nPre-registered #9: " + ", ".join(
        f"{way} +{level}% {results[f'{way}{level}']}" for way in q.TAKE_PROFIT_WAYS for level in q.TAKE_PROFIT_LEVELS))

    # ---- Reported only: not eligible to ship or change anything ----
    # What looking every second and every fourth week gave is also recorded (added on 2026-11-25, after the run of
    # that day: the lines were printed then; recording them changed no figure and no line of the output).
    less_often = {}
    with_market = [r for r in buys if r.get('spy26') is not None]
    market_rose = 100 * sum(r['spy26'] > 0 for r in with_market) / len(with_market) if with_market else None
    if enough:
        print("\n== Context only ==")
        if market_rose is not None:
            print(f"the market (S&P 500) rose over the same 26 weeks for {market_rose:.0f}% of the positions")
        by_stock = defaultdict(list)
        for r in buys:
            by_stock[r['sym']].append(r)
        tenth = lambda xs: sorted(xs)[min(len(xs) - 1, int(.10 * len(xs)))]
        variants = [('keep 26 weeks', f26)] + [(f"+{level}% {way}", rule_of(way, level)) for way in q.TAKE_PROFIT_WAYS for level in q.TAKE_PROFIT_LEVELS]
        for label, key in variants:
            xs = [statistics.mean(key(r) for r in rs) for rs in by_stock.values()]
            print(f"one figure a stock, {label}: average {statistics.mean(xs):+.1f}%, typical {statistics.median(xs):+.1f}%, "
                  f"1 in 10 below {tenth(xs):+.1f}%, ended with a loss {sum(x < 0 for x in xs) / len(xs):.0%}")
        print(f"lost 20% or more: keeping {hold['lostFifth']:.0f}%" + "".join(
            f", +{level}% {way} {ways[way][str(level)]['lostFifth']:.0f}%" for way in q.TAKE_PROFIT_WAYS for level in q.TAKE_PROFIT_LEVELS))
        for level in q.TAKE_PROFIT_LEVELS:
            for every in (2, 4):
                take = rule_of('seen', level, every)
                less_often.setdefault(str(level), {})[str(every)] = dict(
                    lossRate=loss_rate(buys, take), badCase=bad_case(buys, take), mean=average(buys, take))
                print(f"seen at +{level}%, looking every {every} weeks: a loss rarer by {hold['lossRate'] - loss_rate(buys, take):+.1f} points, "
                      f"bad case milder by {bad_case(buys, take) - hold['badCase']:+.1f}, average {average(buys, take):+.1f}%")

    # The figures above that the app quotes, recorded for it (see quoted.py). Not those of `--as-run`: the app quotes
    # the corrected bars.
    if as_run:
        print("--as-run: the bars as downloaded, as on 2026-11-25. Nothing was recorded.", file=sys.stderr)
        sys.exit(0)
    import quoted
    quoted.put(LIST, dict(
        symbols=len(symbols), stocks=len(data['ids']), withPrices=with_prices, withEarnings=with_earnings, withRows=with_rows,
        dipBuys=len(buys), dipBuyStocks=len({r['sym'] for r in buys}),
        firstBuy=min(r['date'] for r in buys) if buys else None, lastBuy=max(r['date'] for r in buys) if buys else None,
        marketRose=market_rose, verdicts=results, holding=hold, takeProfit=ways, lookingLessOften=less_often,
    ))
