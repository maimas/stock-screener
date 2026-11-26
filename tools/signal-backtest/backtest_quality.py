"""
Point-in-time backtest of the fundamental factors and benchmark of rules on the TUNING universe (backtest.py's list).
This is where the rules were explored, so these numbers are in-sample; see backtest_holdout.py and
backtest_validation.py for the out-of-sample checks. Rule definitions live in quality_rules.py.
The analyst factors (upside, consensus) have no history in these sources and are NOT included.
"""
import importlib.util, os, statistics, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
sys.path.insert(0, HERE)
import quality_rules as q

data = bt.load()
earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                    os.path.join(HERE, 'earn_hist_cache.json'), os.path.join(HERE, 'annual_cache.json'))
rows = q.build_rows(data, earn, annual)

have = [r for r in rows if r['f']]
print(f"observations with point-in-time fundamentals: {len(have)} of {len(rows)} "
      f"({min(r['date'] for r in have)} → {max(r['date'] for r in have)})")
dips = [r for r in have if r['dip']]
S = lambda name, xs: bt.summarize(name, xs)

print("\n== Each fundamental factor on its own, among dips ==")
for k in ('growth', 'value'):
    for val in (1, 0, -1):
        S(f"{k} = {val:+d}", [r for r in dips if r['f'][k] == val])
S("red flag (losing money or debt > 2)", [r for r in dips if r['f']['red'] > 0])
S("no red flag", [r for r in dips if r['f']['red'] == 0])

print("\n== Benchmarks (all among the same dips, same period) ==")
S("Baseline: every observation", have)
S("A. Buy every dip", dips)
S("B. Trend only (price >= 200d MA)", [r for r in dips if r['above']])
solid = lambda r: r['f']['score'] >= 1 and r['f']['red'] == 0
S("C. Fundamentals only (score >= 1, no red flag)", [r for r in dips if solid(r)])
S("D. Trend + fundamentals score (previous app rule)", [r for r in dips if r['above'] and solid(r)])
S("   Trend ok, fundamentals weak", [r for r in dips if r['above'] and not solid(r)])
S("   Fundamentals ok, trend broken (app: WAIT)", [r for r in dips if not r['above'] and solid(r)])
S("   Neither", [r for r in dips if not r['above'] and not solid(r)])

dates = sorted(set(r['date'] for r in dips)); mid = dates[len(dates)//2]
print(f"\n== Robustness: halves split at {mid} ==")
for lbl, part in (('first', [r for r in dips if r['date'] < mid]), ('second', [r for r in dips if r['date'] >= mid])):
    S(f"{lbl}: B trend only", [r for r in part if r['above']])
    S(f"{lbl}: D trend + fundamentals", [r for r in part if r['above'] and solid(r)])
    S(f"{lbl}: A every dip", part)

# Per-stock fairness: average per symbol first, so a few volatile names can't dominate
def per_symbol(xs, k='f26'):
    by = defaultdict(list)
    for r in xs:
        by[r['sym']].append(r[k])
    return statistics.mean(statistics.mean(v) for v in by.values()) if by else float('nan'), len(by)
print("\n== Symbol-weighted 26w mean (each stock counts once) ==")
for name, xs in (("A every dip", dips), ("B trend only", [r for r in dips if r['above']]),
                 ("C fundamentals only", [r for r in dips if solid(r)]), ("D trend + fundamentals", [r for r in dips if r['above'] and solid(r)])):
    m, n = per_symbol(xs)
    print(f"{name:28} {m:+6.1f}%  ({n} stocks)")

# Rule E looked best here but did not hold on the holdout universe (see backtest_holdout.py).
# "cheap vs its own P/E history" did not (+11.1% vs +21.9% for normal valuation), so value is penalty-only.
grower = lambda r: r['f']['growth'] == 1 and r['f']['red'] == 0
print("\n== App rule: trend intact + growing + no red flag ==")
S("E. Trend + growing, no red flag (failed out of sample)", [r for r in dips if r['above'] and grower(r)])
S("   Growing, no red flag, trend broken (app: WAIT)", [r for r in dips if not r['above'] and grower(r)])
for lbl, part in (('first', [r for r in dips if r['date'] < mid]), ('second', [r for r in dips if r['date'] >= mid])):
    S(f"{lbl}: E trend + growing", [r for r in part if r['above'] and grower(r)])
m, n = per_symbol([r for r in dips if r['above'] and grower(r)])
print(f"{'E symbol-weighted':28} {m:+6.1f}%  ({n} stocks)")
