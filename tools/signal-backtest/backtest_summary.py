"""
Pooled out-of-sample estimate for the app's verdicts: holdout + validation + mid-cap universes (none used for tuning).
These are the numbers quoted in the app's Signal tooltips. Run the three universe scripts first (they build the caches).
"""
import importlib.util, os, random, statistics, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
sys.path.insert(0, HERE)
import quality_rules as q

dips = []
for name in ('holdout', 'validation', 'midcap'):
    bt.CACHE = os.path.join(HERE, f'{name}_prices_cache.json')
    data = bt.load()
    earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                        os.path.join(HERE, f'{name}_earn_cache.json'), os.path.join(HERE, f'{name}_annual_cache.json'))
    dips += [dict(r, sym=f"{name}:{r['sym']}") for r in q.build_rows(data, earn, annual) if r['f'] and r['dip']]

groups = [
    ("Every dip", lambda r: True),
    ("DIP BUY: growing", lambda r: r['f']['growth'] == 1),
    ("PASS: not growing", lambda r: r['f']['growth'] < 1),
]
print(f"pooled out-of-sample: {len(set(r['sym'] for r in dips))} stocks, {len(dips)} dips\n")
print(f"{'group':20} {'n':>5} {'mean 26w':>9} {'median':>8} {'up after 26w':>13} {'fell 20%+ first':>16}")
for name, fn in groups:
    xs = [r for r in dips if fn(r)]
    print(f"{name:20} {len(xs):5} {statistics.mean(r['f26'] for r in xs):+8.1f}% {statistics.median(r['f26'] for r in xs):+7.1f}% "
          f"{sum(r['f26'] > 0 for r in xs) / len(xs):12.0%} {sum(r['dd13'] <= -20 for r in xs) / len(xs):15.0%}")

per_sym = defaultdict(list)
for r in dips:
    per_sym[r['sym']].append(r)
syms = sorted(per_sym); rng = random.Random(42)
grow, every = groups[1][1], groups[0][1]


def pooled(sample, fn):
    xs = [r['f26'] for s in sample for r in per_sym[s] if fn(r)]
    return statistics.mean(xs) if xs else None


diffs = []
for _ in range(2000):
    s = [rng.choice(syms) for _ in syms]
    diffs.append(pooled(s, grow) - pooled(s, every))
diffs.sort()
print(f"\ngrowing − every dip: {statistics.mean(diffs):+.1f} pts, 90% CI [{diffs[100]:+.1f}, {diffs[1900]:+.1f}], "
      f"P(gap <= 0) = {sum(d <= 0 for d in diffs) / len(diffs):.1%}")


# ---------------------------------------------------------------------------------------------------------------
# Added 2026-11-21. The table above is unchanged, so the numbers quoted before this date still reproduce.
# Below: the fifth ("fresh") universe pooled in, the S&P 500 as a yardstick, and how far the tested dips reach.
# The app quotes every out-of-sample list pooled from here on (five, once the sixth universe is added further
# down): leaving a list out because of the way it points would bend the numbers.
# ---------------------------------------------------------------------------------------------------------------
import benchmark

fresh_cache = os.path.join(HERE, 'fresh_prices_cache.json')
if not os.path.exists(fresh_cache):
    sys.exit("\n(run backtest_validation3.py first to add the fresh universe)")
bt.CACHE = fresh_cache
data = bt.load()
earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                    os.path.join(HERE, 'fresh_earn_cache.json'), os.path.join(HERE, 'fresh_annual_cache.json'))
all_dips = dips + [dict(r, sym=f"fresh:{r['sym']}") for r in q.build_rows(data, earn, annual) if r['f'] and r['dip']]

# Added 2026-11-21: the sixth universe (backtest_validation4.py) pooled in too, for the same reason as the fifth.
# The app quotes every out-of-sample list together, whichever way the newest one points.
sixth_cache = os.path.join(HERE, 'sixth_prices_cache.json')
if not os.path.exists(sixth_cache):
    sys.exit("\n(run backtest_validation4.py first to add the sixth universe)")
bt.CACHE = sixth_cache
data = bt.load()
earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                    os.path.join(HERE, 'sixth_earn_cache.json'), os.path.join(HERE, 'sixth_annual_cache.json'))
four_lists = list(all_dips)
all_dips = all_dips + [dict(r, sym=f"sixth:{r['sym']}") for r in q.build_rows(data, earn, annual) if r['f'] and r['dip']]

# Added 2026-11-22: the seventh universe (backtest_validation5.py) pooled in too, like every list before it.
seventh_cache = os.path.join(HERE, 'seventh_prices_cache.json')
if not os.path.exists(seventh_cache):
    sys.exit("\n(run backtest_validation5.py first to add the seventh universe)")
bt.CACHE = seventh_cache
data = bt.load()
earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                    os.path.join(HERE, 'seventh_earn_cache.json'), os.path.join(HERE, 'seventh_annual_cache.json'))
five_lists = list(all_dips)
all_dips = all_dips + [dict(r, sym=f"seventh:{r['sym']}") for r in q.build_rows(data, earn, annual) if r['f'] and r['dip']]
benchmark.add_excess(all_dips, benchmark.load(bt))


def cluster_boot(rows, stat, n=2000, seed=42):
    """Stock-level bootstrap of stat(sample): (mean, 5th pct, 95th pct, P(stat <= 0))."""
    by = defaultdict(list)
    for r in rows:
        by[r['sym']].append(r)
    keys = sorted(by); rnd = random.Random(seed); out = []
    for _ in range(n):
        v = stat([r for k in (rnd.choice(keys) for _ in keys) for r in by[k]])
        if v is not None:
            out.append(v)
    out.sort()
    return statistics.mean(out), out[int(.05 * len(out))], out[int(.95 * len(out))], sum(d <= 0 for d in out) / len(out)


def gap_stat(sample):
    g = [r['f26'] for r in sample if grow(r)]
    return statistics.mean(g) - statistics.mean(r['f26'] for r in sample) if g else None


def table(title, xs):
    print(f"\n{title}: {len(set(r['sym'] for r in xs))} stocks, {len(xs)} dips, bought {min(r['date'] for r in xs)} .. {max(r['date'] for r in xs)}")
    print(f"{'group':20} {'n':>5} {'mean 26w':>9} {'median':>8} {'up after 26w':>13} {'fell 20%+ first':>16}")
    for name, fn in groups:
        ys = [r for r in xs if fn(r)]
        print(f"{name:20} {len(ys):5} {statistics.mean(r['f26'] for r in ys):+8.1f}% {statistics.median(r['f26'] for r in ys):+7.1f}% "
              f"{sum(r['f26'] > 0 for r in ys) / len(ys):12.0%} {sum(r['dd13'] <= -20 for r in ys) / len(ys):15.0%}")
    m, lo, hi, p = cluster_boot(xs, gap_stat)
    print(f"growing - every dip: {m:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(gap <= 0) = {p:.1%}")


print("\n\n================ With the fresh, the sixth and the seventh universe (2026-11-22) ================")
for name in ('holdout', 'validation', 'midcap', 'fresh', 'sixth', 'seventh'):
    xs = [r for r in all_dips if r['sym'].startswith(name + ':')]
    m, lo, hi, p = cluster_boot(xs, gap_stat)
    print(f"{name:11} every dip {statistics.mean(r['f26'] for r in xs):+5.1f}%  growing {statistics.mean(r['f26'] for r in xs if grow(r)):+5.1f}%  "
          f"gap {m:+5.1f} pts [{lo:+5.1f}, {hi:+5.1f}]  P(gap <= 0) = {p:.1%}")
table("The four lists before the sixth", four_lists)
table("The five lists before the seventh", five_lists)
table("ALL SIX out-of-sample lists (the numbers the app quotes)", all_dips)

print("\n== The S&P 500 as a yardstick: SPY over the same 26 weeks as each DIP BUY ==")
for title, xs in (("first four lists", four_lists), ("first five lists", five_lists), ("all six lists", all_dips)):
    b = [r for r in xs if grow(r) and r['x26'] is not None]
    m, lo, hi, p = cluster_boot(b, lambda s: statistics.mean(r['x26'] for r in s))
    print(f"{title:20} DIP BUY {statistics.mean(r['f26'] for r in b):+5.1f}% vs S&P {statistics.mean(r['spy26'] for r in b):+5.1f}%: "
          f"excess {m:+.1f} pts [{lo:+.1f}, {hi:+.1f}], P(no edge) = {p:.1%}; median excess {statistics.median(r['x26'] for r in b):+.1f}, "
          f"beat the index {sum(r['x26'] > 0 for r in b) / len(b):.0%}")

buys = [r for r in all_dips if grow(r)]
pct = lambda v, p: sorted(v)[min(len(v) - 1, int(p * len(v)))]
depth, vol, low = [r['dip_pct'] for r in buys], [r['vol'] for r in buys], [r['dd13'] for r in buys]
print(f"\n== How far the {len(buys)} tested DIP BUYs reach ({len(set(r['sym'] for r in buys))} stocks) ==")
print(f"depth below the 52-week high: median {pct(depth, .5):.0f}%, 90th pct {pct(depth, .9):.0f}%, 95th {pct(depth, .95):.0f}%, 99th {pct(depth, .99):.0f}%, max {max(depth):.0f}%")
print(f"volatility (a year):          median {pct(vol, .5):.0f}%, 90th pct {pct(vol, .9):.0f}%, 95th {pct(vol, .95):.0f}%, 99th {pct(vol, .99):.0f}%, max {max(vol):.0f}%")
print(f"lowest point in the next 13 weeks: median {statistics.median(low):+.1f}%; fell another 10%+ {sum(x <= -10 for x in low) / len(low):.0%}, "
      f"20%+ {sum(x <= -20 for x in low) / len(low):.0%}, 30%+ {sum(x <= -30 for x in low) / len(low):.0%}")
f = sorted(r['f26'] for r in buys)
print(f"26-week result: worst tenth lost {-pct(f, .10):.0f}% or more, best tenth gained {pct(f, .90):.0f}% or more")


# ---------------------------------------------------------------------------------------------------------------
# Added 2026-11-21. The all-four-lists figures printed above, recorded for the app (see quoted.py): they reach
# its texts through `npm run evidence`, never by hand.
# ---------------------------------------------------------------------------------------------------------------
import quoted


def figures(xs):
    return dict(n=len(xs), mean=statistics.mean(r['f26'] for r in xs), median=statistics.median(r['f26'] for r in xs),
                up=sum(r['f26'] > 0 for r in xs) / len(xs), fell20=sum(r['dd13'] <= -20 for r in xs) / len(xs))


with_spy = [r for r in buys if r['x26'] is not None]
gap_mean, gap_low, gap_high, gap_p = cluster_boot(all_dips, gap_stat)
quoted.put('summary', dict(
    dipPercent=q.DIP_PERCENT, stocks=len(set(r['sym'] for r in all_dips)), dips=len(all_dips),
    firstBuy=min(r['date'] for r in buys), lastBuy=max(r['date'] for r in buys),
    everyDip=figures(all_dips), dipBuy=figures(buys), notGrowing=figures([r for r in all_dips if not grow(r)]),
    gap=dict(mean=gap_mean, low=gap_low, high=gap_high, pNoEdge=gap_p),
    sp500=dict(mean=statistics.mean(r['spy26'] for r in with_spy), beat=sum(r['x26'] > 0 for r in with_spy) / len(with_spy)),
    lowIn13Weeks=statistics.median(low), depthP95=pct(depth, .95), volatilityP95=pct(vol, .95),
    worstTenth=-pct(f, .10), bestTenth=pct(f, .90),
))
