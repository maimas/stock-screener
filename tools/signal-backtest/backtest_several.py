"""
How many to hold: three stocks that dropped, bought in the same month, against one alone (monthly, 1994-2026).

The question, the method, the pass marks and what each outcome does are in quality_rules.py (PRE-REGISTERED #8).
It is asked on the long monthly history of the fresh, sixth and seventh lists, which no long-history question had
looked at. Price-only: there is no "growing" check this far back, so this is about stocks that dropped, of which
the app's DIP BUYs are the growing ones.

    python backtest_several.py            # downloads that history on first run, then uses several_monthly_cache.json
    python backtest_several.py --explore  # what was looked at before #8 was written, on the four lists used before
"""
import json, os, random, statistics as st, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import long_history as lh
import quality_rules as q
import quoted

TESTED = ('fresh', 'sixth', 'seventh')
SEEN = ('tuning', 'holdout', 'validation', 'midcap')
CACHE = os.path.join(HERE, 'several_monthly_cache.json')
HALVES = (('1994', '2009'), ('2010', '2026'))
ALSO_REPORTED = (2, 5, 10)
BOOTSTRAPS = 2000


def load_tested():
    """
    The long monthly history of the three lists, downloaded once. The market and the VIX are taken from the cache
    of the earlier long-history tests, so every long-history test measures against the same market months.
    """
    seen = lh.load_monthly()
    if os.path.exists(CACHE):
        own = json.load(open(CACHE, encoding='utf-8'))
    else:
        own = {'universes': {}, 'series': {}}
        for name in TESTED:
            own['universes'][name] = json.load(open(os.path.join(HERE, f'{name}_prices_cache.json'), encoding='utf-8'))['ids']
        ids = sorted({sid for u in own['universes'].values() for sid in u.values()})
        bt = lh.bt
        for i in range(0, len(ids), 15):
            for c in bt.flat(bt.get(f"https://assets.msn.com/service/Finance/Charts?{bt.Q}&ids={','.join(ids[i:i+15])}&type=All")):
                if isinstance(c, dict) and c.get('series'):
                    s = c['series']
                    own['series'][c['instrumentId']] = [(t[:7], h, l, p) for t, h, l, p in
                                                        zip(s['timeStamps'], s['pricesHigh'], s['pricesLow'], s['prices'])
                                                        if None not in (h, l, p) and p > 0]
        json.dump(own, open(CACHE, 'w', encoding='utf-8'))
    series = dict(own['series'])
    series[lh.SPY_ID] = seen['series'][lh.SPY_ID]
    series[lh.VIX_ID] = seen['series'][lh.VIX_ID]
    return {'universes': own['universes'], 'series': series}


def pct(values, p):
    """The result that a share `p` of the values are below (the same reading as backtest_plan.py's)."""
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(p * len(ordered)))]


def picks(by_month, months, k, seed):
    """For every month, SEVERAL_DRAWS random picks of k of its stocks: month -> the picks' mean 6-month results."""
    rng = random.Random(seed)
    return {m: [st.mean(r['f6'] for r in rng.sample(by_month[m], k)) for _ in range(q.SEVERAL_DRAWS)] for m in months}


def summary(results, months, market=None):
    """How the picks of these months did: every month counts the same, since each has the same number of picks."""
    values = [v for m in months for v in results[m]]
    out = dict(mean=st.mean(values), typical=st.median(values), bad=pct(values, .10),
               up=sum(v > 0 for v in values) / len(values), lost20=sum(v <= -20 for v in values) / len(values))
    if market:
        out['beat'] = sum(v > market[m] for m in months for v in results[m]) / len(values)
    return out


def gaps(one, three, months):
    """Three together minus one alone: (typical result, bad case)."""
    a = [v for m in months for v in one[m]]
    b = [v for m in months for v in three[m]]
    return st.median(b) - st.median(a), pct(b, .10) - pct(a, .10)


def year_bootstrap(one, three, months, seed=7):
    """Year-cluster bootstrap of the two gaps: (P(typical gap <= 0), P(bad-case gap <= 0), 90% ranges)."""
    by_year = defaultdict(list)
    for m in months:
        by_year[m[:4]].append(m)
    years = sorted(by_year)
    rng = random.Random(seed)
    typical, bad = [], []
    for _ in range(BOOTSTRAPS):
        sample = [m for y in (rng.choice(years) for _ in years) for m in by_year[y]]
        t, b = gaps(one, three, sample)
        typical.append(t); bad.append(b)
    typical.sort(); bad.sort()
    edge = lambda xs: (xs[int(.05 * len(xs))], xs[int(.95 * len(xs))])
    return (sum(v <= 0 for v in typical) / len(typical), sum(v <= 0 for v in bad) / len(bad), edge(typical), edge(bad), len(years))


def study(data, universes):
    rows = [r for u in universes for r in lh.build_rows(data, u)]
    by_month = defaultdict(list)
    for r in rows:
        by_month[r['month']].append(r)
    months = sorted(m for m, rs in by_month.items() if len(rs) >= q.SEVERAL_MIN_CANDIDATES)
    market = {m: by_month[m][0]['mkt_f6'] for m in months}
    results = {k: picks(by_month, months, k, 40 + k) for k in (1, q.SEVERAL_TOGETHER) + ALSO_REPORTED}
    return rows, by_month, months, market, results


def report(rows, by_month, months, market, results):
    k3 = q.SEVERAL_TOGETHER
    one, three = results[1], results[k3]
    print(f"{len({r['sym'] for r in rows})} stocks, {len(rows)} dips, {min(by_month)} to {max(by_month)}; "
          f"{len(months)} of {len(by_month)} months have {q.SEVERAL_MIN_CANDIDATES}+ stocks that dropped "
          f"(typically {st.median(len(by_month[m]) for m in months):.0f} a month)\n")

    def table(label, ms):
        print(f"-- {label} ({len(ms)} months)")
        for k in sorted(results):
            s = summary(results[k], ms, market)
            print(f"   {k:2} together: average {s['mean']:+6.1f}%  typical {s['typical']:+6.1f}%  up {s['up']:4.0%}  "
                  f"1 in 10 below {s['bad']:+6.1f}%  lost 20%+ {s['lost20']:4.0%}  beat the market {s['beat']:4.0%}")
        mk = [market[m] for m in ms]
        print(f"   the market : average {st.mean(mk):+6.1f}%  typical {st.median(mk):+6.1f}%  up {sum(v > 0 for v in mk) / len(mk):4.0%}  "
              f"1 in 10 below {pct(mk, .10):+6.1f}%")

    falling = [m for m in months if market[m] < 0]
    halves = [[m for m in months if a <= m[:4] <= b] for a, b in HALVES]
    table('all months', months)
    for (a, b), ms in zip(HALVES, halves):
        table(f'{a}-{b}', ms)
    table('months after which the market fell over the 6 months', falling)
    print(f"\n== by 5 years: {k3} together against one alone (typical result; '1 in 10 below') ==")
    for start in range(1994, 2027, 5):
        ms = [m for m in months if start <= int(m[:4]) < start + 5]
        if len(ms) < 12:
            continue
        a, b = summary(one, ms), summary(three, ms)
        print(f"   {start}-{min(2026, start + 4)} ({len(ms):3} months): typical {a['typical']:+6.1f}% -> {b['typical']:+6.1f}% ({b['typical'] - a['typical']:+5.1f})   "
              f"1 in 10 below {a['bad']:+6.1f}% -> {b['bad']:+6.1f}% ({b['bad'] - a['bad']:+5.1f})")
    return falling, halves


if __name__ == '__main__':
    if '--explore' in sys.argv:
        print("EXPLORATION on the four lists used before for long-history questions (what #8 was written from):\n")
        rows, by_month, months, market, results = study(lh.load_monthly(), SEEN)
        report(rows, by_month, months, market, results)
        typical_gap, bad_gap = gaps(results[1], results[q.SEVERAL_TOGETHER], months)
        p_typical, p_bad, typical_range, bad_range, years = year_bootstrap(results[1], results[q.SEVERAL_TOGETHER], months)
        print(f"\n{q.SEVERAL_TOGETHER} together minus one alone, all months: typical {typical_gap:+.1f} points "
              f"(90% of year-resamples {typical_range[0]:+.1f} to {typical_range[1]:+.1f}), bad case {bad_gap:+.1f} points "
              f"({bad_range[0]:+.1f} to {bad_range[1]:+.1f}); {years} years")
        sys.exit(0)

    rows, by_month, months, market, results = study(load_tested(), TESTED)
    falling, halves = report(rows, by_month, months, market, results)
    k3 = q.SEVERAL_TOGETHER
    one, three = results[1], results[k3]
    typical_gap, bad_gap = gaps(one, three, months)
    p_typical, p_bad, typical_range, bad_range, years = year_bootstrap(one, three, months)
    half_gaps = [gaps(one, three, ms) for ms in halves]
    falling_gap = gaps(one, three, falling)

    print(f"\n== PRE-REGISTERED #8: {k3} together against one alone ({years} years, year-cluster bootstrap) ==")
    s1 = (bad_gap >= q.SEVERAL_BAD_CASE_POINTS and p_bad < q.SEVERAL_P and all(g[1] > 0 for g in half_gaps) and falling_gap[1] > 0)
    s2 = (typical_gap >= q.SEVERAL_TYPICAL_POINTS and p_typical < q.SEVERAL_P and all(g[0] > 0 for g in half_gaps))
    print(f"S1 a bad half-year hurts less: the bad case is {bad_gap:+.1f} points milder (needs {q.SEVERAL_BAD_CASE_POINTS}+), "
          f"P(gap <= 0) = {p_bad:.1%}, 90% range {bad_range[0]:+.1f} to {bad_range[1]:+.1f}; "
          + ', '.join(f"{a}-{b}: {g[1]:+.1f}" for (a, b), g in zip(HALVES, half_gaps))
          + f"; after which the market fell: {falling_gap[1]:+.1f}  ->  {'PASS' if s1 else 'FAIL'}")
    print(f"S2 the typical result is higher: {typical_gap:+.1f} points (needs {q.SEVERAL_TYPICAL_POINTS}+), "
          f"P(gap <= 0) = {p_typical:.1%}, 90% range {typical_range[0]:+.1f} to {typical_range[1]:+.1f}; "
          + ', '.join(f"{a}-{b}: {g[0]:+.1f}" for (a, b), g in zip(HALVES, half_gaps))
          + f"  ->  {'PASS' if s2 else 'FAIL'}")
    print(f"(not a hypothesis: after which the market fell, the typical result was {summary(three, falling)['typical']:+.1f}% "
          f"for {k3} together and {summary(one, falling)['typical']:+.1f}% for one alone)")

    # The figures the app quotes, recorded for it (see quoted.py).
    mk = [market[m] for m in months]
    quoted.put('several', dict(
        stocks=len({r['sym'] for r in rows}), dips=len(rows), months=len(months), years=years,
        fromYear=int(months[0][:4]), toYear=int(months[-1][:4]),
        together=k3, minCandidates=q.SEVERAL_MIN_CANDIDATES,
        one=summary(one, months, market), several=summary(three, months, market),
        others={str(k): summary(results[k], months, market) for k in ALSO_REPORTED},
        market=dict(mean=st.mean(mk), typical=st.median(mk), bad=pct(mk, .10), up=sum(v > 0 for v in mk) / len(mk)),
        gap=dict(typical=typical_gap, bad=bad_gap, pTypical=p_typical, pBad=p_bad),
        halves=[dict(fromYear=int(a), toYear=int(b), typical=g[0], bad=g[1]) for (a, b), g in zip(HALVES, half_gaps)],
        falling=dict(months=len(falling), one=summary(one, falling), several=summary(three, falling), typical=falling_gap[0], bad=falling_gap[1]),
        verdicts=dict(S1='PASS' if s1 else 'FAIL', S2='PASS' if s2 else 'FAIL'),
    ))
