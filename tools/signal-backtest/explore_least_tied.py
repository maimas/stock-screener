"""
Exploration, NOT a test (2026-11-22; the free look behind pre-registered #8, kept so it can be re-run).

The user asked whether the app could suggest what to add to a portfolio. On the six out-of-sample lists already
used, among the stocks marked DIP BUY in the SAME week and held 26 weeks:
  1. how many to hold: random picks of 1, 2, 3, 5 and 10;
  2. which one to add: the second stock "least tied" to the first (lowest correlation of weekly returns over the
     year before), against any other and against the most tied; the same for three stocks, and inside each list;
  3. whether how tied two stocks were says how tied they will be.
Every figure weighs each week the same. Nothing here can ship: these lists have been looked at before.

Found: "least tied" trimmed the pair's bad case by two points while the pick itself earned about half as much, and
it was uneven from list to list, so it was dropped. How many mattered: that became pre-registered #8, tested on
data nobody had looked at (backtest_several.py).

    python explore_least_tied.py   # needs numpy and pandas; reads the caches, writes nothing
"""
import importlib.util, os, random, statistics, sys
from collections import defaultdict
from datetime import date, timedelta

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
sys.path.insert(0, HERE)
import quality_rules as q
import benchmark

LISTS = ('holdout', 'validation', 'midcap', 'fresh', 'sixth', 'seventh')


def week_of(day):
    """The Monday of the day's week: weekly prices are stamped on a Friday, or a day earlier in a holiday week."""
    d = date.fromisoformat(day)
    return (d - timedelta(days=d.weekday())).isoformat()

TRAIL, AHEAD = 52, 26          # weeks of returns before the purchase (to measure "tied") and after (the holding)
MIN_COMMON = 40                # two stocks need this many of the 52 weeks in common
DRAWS = 300                    # random picks per week
rng = random.Random(42)


def load(name):
    bt.CACHE = os.path.join(HERE, f'{name}_prices_cache.json')
    data = bt.load()
    earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                        os.path.join(HERE, f'{name}_earn_cache.json'), os.path.join(HERE, f'{name}_annual_cache.json'))
    rows = [dict(r, sym=f"{name}:{r['sym']}", universe=name) for r in q.build_rows(data, earn, annual, step_weeks=1)
            if r['f'] and r['dip'] and q.dip_buy(r)]
    rets = {}
    for sym, sid in data['ids'].items():
        ser = data['charts'].get(sid)
        if not ser:
            continue
        bars = [(t[:10], c) for t, h, l, c in zip(ser['timeStamps'], ser['pricesHigh'], ser['pricesLow'], ser['prices'])
                if None not in (h, l, c)]
        rets[f"{name}:{sym}"] = {week_of(bars[i][0]): bars[i][1] / bars[i - 1][1] - 1 for i in range(1, len(bars)) if bars[i - 1][1] > 0}
    return rows, rets


rows, rets = [], {}
for name in LISTS:
    r, x = load(name)
    rows += r
    rets.update(x)
benchmark.add_excess(rows, benchmark.load(bt))
rows = [r for r in rows if r['spy26'] is not None]

calendar = sorted({d for series in rets.values() for d in series})
position = {d: i for i, d in enumerate(calendar)}
frame = pd.DataFrame({sym: pd.Series(series) for sym, series in rets.items()}).reindex(calendar)   # weeks x stocks

by_date = defaultdict(list)
for r in rows:
    by_date[week_of(r['date'])].append(r)
dates = sorted(d for d, rs in by_date.items() if d in position and position[d] >= TRAIL and position[d] + AHEAD < len(calendar))

print(f"{len(rows)} DIP BUY weeks of {len({r['sym'] for r in rows})} stocks; {len(calendar)} weeks in the calendar "
      f"({calendar[0]} to {calendar[-1]}); {len(dates)} purchase weeks from {dates[0]} to {dates[-1]}")
sizes = [len(by_date[d]) for d in dates]
print(f"candidates marked DIP BUY in one week: fewest {min(sizes)}, typical {statistics.median(sizes):.0f}, most {max(sizes)}")
coverage = statistics.mean(frame.iloc[position[d] - TRAIL + 1:position[d] + 1][[r['sym'] for r in by_date[d]]].notna().mean().mean() for d in dates[::10])
print(f"weeks of the trailing year a candidate has a return for (1 = all; checks that the lists share one calendar): {coverage:.3f}")


def pct(values, p):
    return float(np.percentile(values, p))


def line(label, values, market=None):
    v = np.array(values, dtype=float)
    beat = '' if market is None else f"  beat the market {np.mean(v > np.array(market)):4.0%}"
    return (f"{label:34} average {v.mean():+6.1f}%  typical {np.median(v):+6.1f}%  up {np.mean(v > 0):4.0%}  "
            f"1 in 10 below {pct(v, 10):+6.1f}%  lost 20%+ {np.mean(v <= -20):4.0%}{beat}")


# ---- 1. Several rather than one: random baskets from one week's candidates ---------------------------------------
print("\n== 1. How many to hold: random picks from one week's DIP BUYs, equal amounts, held 26 weeks ==")
for k in (1, 2, 3, 5, 10):
    outcomes, market = [], []
    for d in dates:
        rs = by_date[d]
        if len(rs) < 10:           # the same weeks for every basket size
            continue
        for _ in range(DRAWS):
            pick = rng.sample(rs, k)
            outcomes.append(statistics.mean(r['f26'] for r in pick))
            market.append(pick[0]['spy26'])
    print(line(f"{k:2} stock{'s' if k > 1 else ' '}", outcomes, market))
print(line("the market (S&P 500), same weeks", [by_date[d][0]['spy26'] for d in dates if len(by_date[d]) >= 10]))


# ---- 2. The second stock: least tied to the first, most tied, or any -------------------------------------------
def correlations(d, syms, start, stop, min_common):
    window = frame.iloc[position[d] + start:position[d] + stop][syms]
    return window.corr(min_periods=min_common).to_numpy()


pairs = {'least tied': [], 'any': [], 'most tied': []}
partner = {'least tied': [], 'any': [], 'most tied': []}
both_fell = {'least tied': [], 'any': [], 'most tied': []}
ahead_weeks = {'least tied': [], 'most tied': []}       # per week: did those partners do better than the week's average candidate?
trios = {'least tied': [], 'any': [], 'most tied': []}
forward_by_third = [[], [], []]
rank_links = []
per_date = {}                                            # for the stability check at the end
for d in dates:
    rs = by_date[d]
    if len(rs) < 10:
        continue
    syms = [r['sym'] for r in rs]
    f = np.array([r['f26'] for r in rs])
    trailing = correlations(d, syms, -TRAIL + 1, 1, MIN_COMMON)
    np.fill_diagonal(trailing, np.nan)
    forward = correlations(d, syms, 1, AHEAD + 1, 20)
    np.fill_diagonal(forward, np.nan)

    # does how tied two stocks WERE say how tied they WILL BE over the holding period?
    upper = np.triu_indices(len(rs), 1)
    t, w = trailing[upper], forward[upper]
    ok = ~np.isnan(t) & ~np.isnan(w)
    if ok.sum() >= 30:
        t, w = t[ok], w[ok]
        cuts = np.percentile(t, [33.3, 66.7])
        for i, mask in enumerate((t <= cuts[0], (t > cuts[0]) & (t <= cuts[1]), t > cuts[1])):
            forward_by_third[i].append(w[mask].mean())
        rank_links.append(pd.Series(t).rank().corr(pd.Series(w).rank()))   # a rank link, without scipy

    usable = [i for i in range(len(rs)) if not np.all(np.isnan(trailing[i]))]
    least = {i: int(np.nanargmin(trailing[i])) for i in usable}
    most = {i: int(np.nanargmax(trailing[i])) for i in usable}
    week = {name: [] for name in pairs}
    week_partner = {name: [] for name in pairs}
    for _ in range(DRAWS):
        i = rng.choice(usable)
        other = rng.choice([j for j in range(len(rs)) if j != i])
        for name, j in (('least tied', least[i]), ('any', other), ('most tied', most[i])):
            week[name].append((f[i] + f[j]) / 2)
            week_partner[name].append(f[j])
            both_fell[name].append(f[i] <= -20 and f[j] <= -20)
        # three stocks: start from one, then twice add the one least (or most) tied to those already picked
        for name, pick in (('least tied', np.nanargmin), ('most tied', np.nanargmax)):
            chosen = [i]
            for _step in range(2):
                tie = np.nanmean(trailing[chosen], axis=0)
                tie[chosen] = np.nan
                chosen.append(int(pick(tie)))
            trios[name].append(f[chosen].mean())
        trios['any'].append(f[rng.sample(range(len(rs)), 3)].mean())
    for name in pairs:
        pairs[name] += week[name]
        partner[name] += week_partner[name]
    for name in ahead_weeks:
        ahead_weeks[name].append(statistics.mean(week_partner[name]) > f.mean())
    per_date[d] = {name: week[name] for name in pairs}

print("\n== 2. You own one DIP BUY; the second is picked from the same week's others (the pair, equal amounts) ==")
for name in pairs:
    print(line(f"second stock: {name}", pairs[name]) + f"  both lost 20%+ {np.mean(both_fell[name]):4.0%}")
print("\n   The second stock on its own (does picking it this way earn more, or cost?):")
for name in partner:
    print('   ' + line(f"{name}", partner[name]))
for name in ahead_weeks:
    print(f"   weeks in which the {name} picks did better than that week's average candidate: {np.mean(ahead_weeks[name]):.0%} of {len(ahead_weeks[name])}")

print("\n== 3. Three stocks: start from one, add twice the one least (or most) tied to those picked ==")
for name in trios:
    print(line(f"three, {name}", trios[name]))

print("\n== 4. Does how tied two stocks were (the year before) say how tied they will be (the 26 weeks after)? ==")
print("   pairs of one week, in thirds by how tied they were -> how tied they then were (1 = moved as one):")
for label, values in zip(('least tied third', 'middle third', 'most tied third'), forward_by_third):
    print(f"   {label:18} {statistics.mean(values):.2f}")
print(f"   rank link between before and after, typical week: {statistics.median(rank_links):.2f} (0 = none, 1 = perfect)")

# ---- 5. How steady is the gap? Resample half-years of purchase weeks ---------------------------------------------
print("\n== 5. Is the gap steady? The pair's '1 in 10 below' and typical result, least tied minus most tied ==")
kept = sorted(per_date)
blocks = defaultdict(list)
for d in kept:
    blocks[(d[:4], (int(d[5:7]) - 1) // 6)].append(d)
keys = sorted(blocks)
print("   by half-year of purchase:")
for key in keys:
    ds = blocks[key]
    a = [x for d in ds for x in per_date[d]['least tied']]
    b = [x for d in ds for x in per_date[d]['most tied']]
    print(f"   {key[0]} H{key[1] + 1} ({len(ds):3} weeks): 1 in 10 below {pct(a, 10):+6.1f}% vs {pct(b, 10):+6.1f}%   "
          f"typical {np.median(a):+6.1f}% vs {np.median(b):+6.1f}%")
gaps_bad, gaps_mid = [], []
boot = random.Random(7)
for _ in range(1000):
    sample = [d for key in (boot.choice(keys) for _ in keys) for d in blocks[key]]
    a = [x for d in sample for x in per_date[d]['least tied']]
    b = [x for d in sample for x in per_date[d]['most tied']]
    gaps_bad.append(pct(a, 10) - pct(b, 10))
    gaps_mid.append(np.median(a) - np.median(b))
print(f"   resampling half-years 1000 times: the '1 in 10 below' gap is {np.mean(gaps_bad):+.1f} points "
      f"(5th to 95th: {pct(gaps_bad, 5):+.1f} to {pct(gaps_bad, 95):+.1f}; above zero in {np.mean(np.array(gaps_bad) > 0):.0%}); "
      f"the typical-result gap is {np.mean(gaps_mid):+.1f} ({pct(gaps_mid, 5):+.1f} to {pct(gaps_mid, 95):+.1f})")


# ---- 6. The same choice of a second stock inside each list (candidates of that list only) ----------------------
print("\n== 6. Inside each list: the pair with the second stock least tied, any, most tied ==")
for universe in LISTS:
    out = {'least tied': ([], []), 'any': ([], []), 'most tied': ([], [])}
    weeks = 0
    for d in dates:
        rs = [r for r in by_date[d] if r['universe'] == universe]
        if len(rs) < 8:
            continue
        f = np.array([r['f26'] for r in rs])
        trailing = correlations(d, [r['sym'] for r in rs], -TRAIL + 1, 1, MIN_COMMON)
        np.fill_diagonal(trailing, np.nan)
        usable = [i for i in range(len(rs)) if not np.all(np.isnan(trailing[i]))]
        if not usable:
            continue
        weeks += 1
        for _ in range(120):
            i = rng.choice(usable)
            choice = {'least tied': int(np.nanargmin(trailing[i])), 'any': rng.choice([j for j in range(len(rs)) if j != i]),
                      'most tied': int(np.nanargmax(trailing[i]))}
            for name, j in choice.items():
                out[name][0].append((f[i] + f[j]) / 2)
                out[name][1].append(f[j])
    print(f"-- {universe} ({weeks} weeks)")
    for name, (pair, second) in out.items():
        print(f"   {name:11} pair: average {np.mean(pair):+6.1f}%  typical {np.median(pair):+6.1f}%  1 in 10 below {pct(pair, 10):+6.1f}%"
              f"   | the second stock alone: average {np.mean(second):+6.1f}%  typical {np.median(second):+6.1f}%")
