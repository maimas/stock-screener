"""
Pre-registered #4: does "dip in a growing company" hold outside the 2023-2026 window the verdict was validated on?

WHY: every out-of-sample test of the app's verdict (holdout, validation, mid caps) covers buys made between
Aug 2023 and May 2026, one growth-led market. Quarterly point-in-time fundamentals do not exist before 2022 in our
sources, but ANNUAL statements go back to the 1980s, so an annual stand-in for "growing" can be tested across
2000-02, 2008, 2018, 2020 and 2022.

  Stand-in G = annual revenue growth >= 15%: revenue of the latest annual statement FILED by that month
               (`sourceDate`, the filing date; `reportDate` is only the fiscal year end) vs the previous one.
               Unknown if fewer than two filed statements, or the latest fiscal year ended more than 18 months ago.
  Dips       = month-end close >= 15% below the trailing 12-month high (same rows as long_history.build_rows),
               6-month forward return.

EXPLORATION (2026-11-21, TUNING universe only; reproduce with `python backtest_regime.py --explore`):
  68 stocks, 6,296 monthly dips. G agreed with the app's quarterly "growing" on 81% of 2023-2026 weekly dips.
  Gap G minus not-G in mean 6-month return: 1994-2022 +1.0 pts (year-cluster bootstrap 90% CI -2.5..+4.8,
  P(gap <= 0) = 34%); by era 1994-99 +2.7, 2000-02 -1.8, 2003-07 -1.1, 2008-09 -0.1, 2010-19 +9.7, 2020-22 -12.5,
  2023-26 +20.1; G won in 22 of 33 years. Over 12 months the 1994-2022 gap was +8.0 pts (P = 6%).
  So on this list the edge the app relies on is strong in 2023-2026 and not distinguishable from zero before.

---------------------------------------------------------------------------------------------------------------
PRE-REGISTERED #4 (written 2026-11-21, after exploring the tuning universe only; the holdout, validation and
mid-cap universes have NOT been looked at with annual growth or over long history for this question):
  Data: pooled holdout + validation + mid-cap stocks, monthly dips, entry months 1994-01 .. 2022-12.
  The growth edge counts as REGIME-ROBUST only if ALL hold:
    1. G beats not-G in mean 6-month return with P(gap <= 0) < 10% under a YEAR-cluster bootstrap
       (the growth-vs-the-rest spread is market-wide, so calendar years are the independent units).
    2. G's median 6-month return is also higher.
    3. G beats not-G in mean in both halves, 1994-2007 and 2008-2022.
  Consequences, fixed in advance:
    PASS -> the app may say that an annual-revenue version of the rule also held in 1994-2022.
    FAIL -> the app must say, in the Signal tooltip and the Dip candidates card, that the verdict's edge is
            unproven outside Aug 2023 - May 2026, quoting the 1994-2022 gap from this run. If the pooled gap is
            also negative in BOTH 2000-2002 and 2020-2022 (as it was on tuning), the note may add that growing
            dips did worse than other dips while those growth booms deflated.
  Either way the verdict rule itself does not change from this run.
  Reported for context only (not eligible to ship anything): 12-month returns, the era table, further-20%-drop
  rates, return vs the S&P 500, and how often G agrees with the quarterly "growing" on 2023-2026 dips.
  Known limits: every list is today's survivors (this flatters growing dips in busts: the failures are gone),
  and the annual stand-in is slower than the app's quarterly test.
---------------------------------------------------------------------------------------------------------------
"""
import json, os, random, statistics as st, sys
from collections import defaultdict
import long_history as lh

HERE = os.path.dirname(os.path.abspath(__file__))
ANNUAL = {'tuning': 'annual_cache.json', 'holdout': 'holdout_annual_cache.json',
          'validation': 'validation_annual_cache.json', 'midcap': 'midcap_annual_cache.json'}
TEST_UNIVERSES = ('holdout', 'validation', 'midcap')
GROWTH_REVENUE_PERCENT = 15
STALE_MONTHS = 18
ERAS = [('1994', '1999'), ('2000', '2002'), ('2003', '2007'), ('2008', '2009'), ('2010', '2019'), ('2020', '2022'),
        ('2023', '2026')]


def annual_revenue_growth(annual_rec, month):
    """% revenue growth between the two latest annual statements filed by `month` (YYYY-MM), or None if unknown."""
    filed = [((s.get('sourceDate') or '9999')[:7], (s.get('endDate') or '')[:10], s)
             for s in (annual_rec or {}).values() if s.get('revenue') and s.get('endDate')]
    avail = sorted((x for x in filed if x[0] <= month), key=lambda x: x[1])
    if len(avail) < 2:
        return None
    last_end = avail[-1][1]
    if (int(month[:4]) * 12 + int(month[5:7])) - (int(last_end[:4]) * 12 + int(last_end[5:7])) > STALE_MONTHS:
        return None
    cur, prev = avail[-1][2], avail[-2][2]
    return (cur['revenue'] / prev['revenue'] - 1) * 100 if prev['revenue'] > 0 else None


def build(data, universe, horizon=6):
    """Monthly dips with the annual growth stand-in. With horizon=6 these are long_history.build_rows' dips."""
    annual = json.load(open(os.path.join(HERE, ANNUAL[universe]), encoding='utf-8'))
    spy = data['series'][lh.SPY_ID]
    spy_at = {b[0]: i for i, b in enumerate(spy)}
    rows = []
    for sym, sid in data['universes'][universe].items():
        bars = data['series'].get(sid) or []
        for t in range(12, len(bars) - horizon):
            month, c = bars[t][0], bars[t][3]
            j = spy_at.get(month)
            if lh.drawdown(bars, t) < lh.DIP_PERCENT or j is None or j < 12 or j + horizon >= len(spy):
                continue
            g = annual_revenue_growth(annual.get(sid), month)
            if g is None:
                continue
            f = (bars[t + horizon][3] / c - 1) * 100
            rows.append(dict(sym=f'{universe}:{sym}', month=month, year=month[:4], grow=g >= GROWTH_REVENUE_PERCENT, f=f,
                             x=f - (spy[j + horizon][3] / spy[j][3] - 1) * 100,
                             dd3=(min(b[2] for b in bars[t + 1:t + 4]) / c - 1) * 100))
    return rows


def mean(xs, k='f'):
    return st.mean(r[k] for r in xs) if xs else float('nan')


def gap(rows):
    g = [r for r in rows if r['grow']]
    n = [r for r in rows if not r['grow']]
    return mean(g) - mean(n) if g and n else None


def year_bootstrap(rows, n=2000, seed=42):
    """Resample calendar years with replacement; returns (mean gap, 5th pct, 95th pct, P(gap <= 0), years)."""
    groups = defaultdict(list)
    for r in rows:
        groups[r['year']].append(r)
    keys = sorted(groups)
    rng = random.Random(seed)
    diffs = []
    for _ in range(n):
        d = gap([x for k in (rng.choice(keys) for _ in keys) for x in groups[k]])
        if d is not None:
            diffs.append(d)
    diffs.sort()
    return (st.mean(diffs), diffs[int(.05 * len(diffs))], diffs[int(.95 * len(diffs))],
            sum(d <= 0 for d in diffs) / len(diffs), len(keys))


def line(name, rows):
    g = [r for r in rows if r['grow']]
    n = [r for r in rows if not r['grow']]
    if not g or not n:
        print(f"{name:11} too few dips"); return
    fell = lambda xs: sum(r['dd3'] <= -20 for r in xs) / len(xs)
    print(f"{name:11} growing n={len(g):5} mean {mean(g):+6.1f} median {st.median(r['f'] for r in g):+6.1f} fell20 {fell(g):4.0%} vs S&P {mean(g, 'x'):+6.1f} | "
          f"not growing n={len(n):5} mean {mean(n):+6.1f} median {st.median(r['f'] for r in n):+6.1f} fell20 {fell(n):4.0%} vs S&P {mean(n, 'x'):+6.1f} | "
          f"gap {mean(g) - mean(n):+6.1f}")


def report(rows, title):
    print(f"\n== {title}: {len({r['sym'] for r in rows})} stocks, {len(rows)} monthly dips, {min(r['month'] for r in rows)} .. {max(r['month'] for r in rows)} ==")
    line('all years', rows)
    for a, b in ERAS:
        line(f'{a}-{b}', [r for r in rows if a <= r['year'] <= b])
    by = defaultdict(list)
    for r in rows:
        by[r['year']].append(r)
    gaps = {y: gap(xs) for y, xs in sorted(by.items())
            if sum(r['grow'] for r in xs) >= 5 and sum(not r['grow'] for r in xs) >= 5}
    print(f"years where growing beat not growing: {sum(v > 0 for v in gaps.values())} of {len(gaps)}")


def boot_line(label, rows):
    m, lo, hi, p, years = year_bootstrap(rows)
    print(f"  {label:22} growing - not growing = {m:+5.1f} pts, 90% CI [{lo:+5.1f}, {hi:+5.1f}], P(gap <= 0) = {p:.1%}  ({years} years)")
    return m, lo, hi, p


def quarterly_agreement(universes):
    """Context: how often the annual stand-in agrees with the app's quarterly 'growing' on weekly 2023-2026 dips."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
    bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
    sys.path.insert(0, HERE)
    import quality_rules as q
    prefix = {'tuning': ('backtest_cache.json', 'earn_hist_cache.json'), 'holdout': ('holdout_prices_cache.json', 'holdout_earn_cache.json'),
              'validation': ('validation_prices_cache.json', 'validation_earn_cache.json'), 'midcap': ('midcap_prices_cache.json', 'midcap_earn_cache.json')}
    both = agree = 0
    for u in universes:
        prices, earn_file = prefix[u]
        bt.CACHE = os.path.join(HERE, prices)
        data = bt.load()
        earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()), os.path.join(HERE, earn_file), os.path.join(HERE, ANNUAL[u]))
        for r in q.build_rows(data, earn, annual):
            if not r['f'] or not r['dip']:
                continue
            g = annual_revenue_growth(annual.get(data['ids'][r['sym']]), r['date'][:7])
            if g is None:
                continue
            both += 1
            agree += (g >= GROWTH_REVENUE_PERCENT) == (r['f']['growth'] == 1)
    print(f"\nAgreement with the app's quarterly 'growing' on 2023-2026 weekly dips ({', '.join(universes)}): {agree / both:.0%} of {both}")


if __name__ == '__main__':
    data = lh.load_monthly()
    if '--explore' in sys.argv:
        rows = build(data, 'tuning')
        report(rows, 'EXPLORATION, tuning universe, 6-month forward return')
        boot_line('1994-2022', [r for r in rows if r['year'] <= '2022'])
        boot_line('all years', rows)
        rows12 = build(data, 'tuning', horizon=12)
        print("12-month forward return:")
        boot_line('1994-2022', [r for r in rows12 if r['year'] <= '2022'])
        quarterly_agreement(['tuning'])
        sys.exit(0)

    rows = [r for u in TEST_UNIVERSES for r in build(data, u)]
    test = [r for r in rows if '1994' <= r['year'] <= '2022']
    report(rows, 'Pooled holdout + validation + mid-cap, 6-month forward return')
    print("\n== Pre-registered test, entry months 1994-2022 ==")
    g = [r for r in test if r['grow']]
    n = [r for r in test if not r['grow']]
    m, lo, hi, p = boot_line('1994-2022', test)
    med_g, med_n = st.median(r['f'] for r in g), st.median(r['f'] for r in n)
    h1, h2 = gap([r for r in test if r['year'] <= '2007']), gap([r for r in test if r['year'] >= '2008'])
    c1, c2, c3 = p < 0.10, med_g > med_n, h1 > 0 and h2 > 0
    print(f"  1. mean gap with P(gap <= 0) < 10%:  {'yes' if c1 else 'no'}  (mean {mean(g):+.1f}% vs {mean(n):+.1f}%, P = {p:.1%})")
    print(f"  2. median also higher:               {'yes' if c2 else 'no'}  ({med_g:+.1f}% vs {med_n:+.1f}%)")
    print(f"  3. positive in both halves:          {'yes' if c3 else 'no'}  (1994-2007 {h1:+.1f} pts, 2008-2022 {h2:+.1f} pts)")
    print(f"\nPre-registered criterion #4 (growth edge is regime-robust): {'PASS' if c1 and c2 and c3 else 'FAIL'}")
    busts = [gap([r for r in rows if a <= r['year'] <= b]) for a, b in (('2000', '2002'), ('2020', '2022'))]
    print(f"Gap while growth booms deflated: 2000-2002 {busts[0]:+.1f} pts, 2020-2022 {busts[1]:+.1f} pts "
          f"({'both negative' if max(busts) < 0 else 'not both negative'})")

    print("\n== Context only (not part of the criterion) ==")
    boot_line('2023-2026', [r for r in rows if r['year'] >= '2023'])
    rows12 = [r for u in TEST_UNIVERSES for r in build(data, u, horizon=12)]
    print("12-month forward return:")
    boot_line('1994-2022', [r for r in rows12 if '1994' <= r['year'] <= '2022'])
    quarterly_agreement(TEST_UNIVERSES)

    # The figures of the pre-registered test that the app quotes, recorded for it (see quoted.py).
    import quoted
    quoted.put('regime', dict(stocks=len({r['sym'] for r in rows}), fromYear=1994, toYear=2022,
                              growing=mean(g), others=mean(n), gap=m, pGapNotPositive=p,
                              gap2000to2002=busts[0], gap2020to2022=busts[1],
                              verdict='PASS' if c1 and c2 and c3 else 'FAIL'))
