"""
Out-of-sample check of the frozen Signal rules (quality_rules.py) on stocks that were NOT used while choosing them.
The holdout list was fixed before running this script and shares no symbol with backtest.py's list.
Includes a stock-level bootstrap of the gap between rules, so a few lucky names can't carry the result.

    python backtest_holdout.py      # downloads ~130 stocks on first run, then uses holdout_*_cache.json
"""
import importlib.util, os, random, statistics
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
import sys; sys.path.insert(0, HERE)
import quality_rules as q

HOLDOUT = """ADI AMAT LRCX KLAC NXPI ON MCHP SWKS INTU NOW PANW FTNT ADSK WDAY TEAM DDOG NET OKTA DOCU TWLO ETSY EBAY BKNG
ABNB UBER LYFT DASH EXPE MAR HLT CMG YUM DPZ LULU TJX ROST DG DLTR BBY KR KHC GIS MDLZ CL KMB MO PM LLY BMY AMGN
GILD REGN VRTX BIIB MRNA ISRG TMO DHR ABT MDT SYK ZTS ELV CI HUM AXP SCHW SPGI MCO ICE CME PNC USB TFC COF AIG MET
PRU LMT RTX NOC GD UNP CSX NSC DAL UAL LUV F GM ETN EMR ITW PH ROK SLB EOG OXY PSX MPC VLO HAL DVN SO D AEP EXC SRE
PLD AMT CCI EQIX SPG O NEM FCX DOW LIN SHW APD ECL""".split()

original = set(bt.SYMBOLS)
bt.SYMBOLS = [s for s in HOLDOUT if s not in original]
bt.CACHE = os.path.join(HERE, 'holdout_prices_cache.json')
data = bt.load()
earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                    os.path.join(HERE, 'holdout_earn_cache.json'), os.path.join(HERE, 'holdout_annual_cache.json'))

rows = [r for r in q.build_rows(data, earn, annual) if r['f']]
dips = [r for r in rows if r['dip']]
print(f"holdout: {len(data['ids'])} stocks resolved, {len(rows)} observations with fundamentals, {len(dips)} dips "
      f"({min(r['date'] for r in rows)} → {max(r['date'] for r in rows)}); overlap with tuning list: {len(original & set(data['ids']))}")

print("\n== Frozen rules on the holdout (among dips, 26w forward) ==")
for name, fn in q.RULES:
    bt.summarize(name, [r for r in dips if fn(r)])

dates = sorted(set(r['date'] for r in dips)); mid = dates[len(dates) // 2]
print(f"\n== Halves split at {mid} ==")
for lbl, part in (('first', [r for r in dips if r['date'] < mid]), ('second', [r for r in dips if r['date'] >= mid])):
    for name, fn in q.RULES[:2] + q.RULES[3:5]:
        bt.summarize(f"{lbl}: {name[:40]}", [r for r in part if fn(r)])


def by_symbol(xs):
    out = defaultdict(list)
    for r in xs:
        out[r['sym']].append(r['f26'])
    return out


print("\n== Symbol-weighted 26w mean (each stock counts once) ==")
for name, fn in q.RULES[:5]:
    g = by_symbol([r for r in dips if fn(r)])
    print(f"{name:52} {statistics.mean(statistics.mean(v) for v in g.values()):+6.1f}%  ({len(g)} stocks)")

# Stock-level (cluster) bootstrap: resample stocks with replacement, recompute each rule's pooled mean.
rule = dict(q.RULES)
E, B, A, D = (rule[k] for k in ("E. Trend + growing + no red flag (app DIP BUY)", "B. Trend intact only",
                                "A. Buy every dip", "D. Trend + fundamental score (previous app rule)"))
per_sym = defaultdict(list)
for r in dips:
    per_sym[r['sym']].append(r)
syms = sorted(per_sym)
rng = random.Random(42)


def pooled(sample, fn):
    xs = [r['f26'] for s in sample for r in per_sym[s] if fn(r)]
    return statistics.mean(xs) if xs else None


print("\n== Stock-level bootstrap, 2,000 resamples: 26w mean of rule X minus rule Y ==")
for (nx, fx), (ny, fy) in ((("E", E), ("A every dip", A)), (("E", E), ("B trend only", B)), (("E", E), ("D previous rule", D))):
    diffs = []
    for _ in range(2000):
        sample = [rng.choice(syms) for _ in syms]
        x, y = pooled(sample, fx), pooled(sample, fy)
        if x is not None and y is not None:
            diffs.append(x - y)
    diffs.sort()
    lo, hi = diffs[int(.05 * len(diffs))], diffs[int(.95 * len(diffs))]
    print(f"{nx} − {ny:16} mean {statistics.mean(diffs):+6.1f} pts   90% CI [{lo:+6.1f}, {hi:+6.1f}]   "
          f"P(gap <= 0) = {sum(d <= 0 for d in diffs) / len(diffs):.1%}")
