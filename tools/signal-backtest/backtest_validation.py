"""
Final validation on a THIRD universe that was never used for tuning or for choosing the candidate.
Rules and the pass/fail criterion are pre-registered in quality_rules.py (CANDIDATES); nothing here is tuned.
Symbols already in backtest.py (tuning) or backtest_holdout.py (holdout) are removed automatically.

    python backtest_validation.py   # downloads on first run, then uses validation_*_cache.json
"""
import importlib.util, os, random, re, statistics, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
sys.path.insert(0, HERE)
import quality_rules as q

VALIDATION = """ACN ADP AON APH AZO BDX BK BKR BSX BX CARR CB CDNS CHTR CMI CNC CPRT CTAS CTSH CTVA DHI DLR DXCM EA EFX
EL ENPH EQR ES EW FANG FAST FIS FITB GLW GPN GRMN HCA HIG HPQ HSY IDXX ILMN INCY IQV IR IT JCI KEYS KMI KMX LEN LH
LVS LYB MAA MCK MKC MLM MNST MOS MSCI MSI MTB MTD NDAQ NTAP NUE NVR ODFL OKE ORLY OTIS PAYX PCAR PEG PFG PGR PHM PPG
PWR RCL RMD ROP RSG SBAC SJM SNPS STE STT STZ SYY TDG TEL TROW TSCO TT TTWO TYL ULTA URI VMC VRSK VRSN WAB WAT WBA
WEC WELL WM WMB WST XEL XYL ZBH ZBRA CHD CLX CAH ALGN AKAM ANET APTV EXPD HPE HOLX JBHT NCLH CCL MGM WYNN PINS SNAP
ZS MDB HUBS TTD PODD""".split()

holdout_src = open(os.path.join(HERE, 'backtest_holdout.py'), encoding='utf-8').read()
holdout = set(re.search(r'HOLDOUT = """(.*?)"""', holdout_src, re.S).group(1).split())
seen = set(bt.SYMBOLS) | holdout
bt.SYMBOLS = [s for s in VALIDATION if s not in seen]
bt.CACHE = os.path.join(HERE, 'validation_prices_cache.json')
data = bt.load()
earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                    os.path.join(HERE, 'validation_earn_cache.json'), os.path.join(HERE, 'validation_annual_cache.json'))
rows = [r for r in q.build_rows(data, earn, annual) if r['f']]
dips = [r for r in rows if r['dip']]
print(f"validation: {len(data['ids'])} stocks, {len(rows)} observations with fundamentals, {len(dips)} dips "
      f"({min(r['date'] for r in rows)} → {max(r['date'] for r in rows)}); overlap with earlier universes: {len(seen & set(data['ids']))}")

print("\n== Pre-registered rules (among dips) ==")
for name, fn in q.CANDIDATES:
    bt.summarize(name, [r for r in dips if fn(r)])

dates = sorted(set(r['date'] for r in dips)); mid = dates[len(dates) // 2]
print(f"\n== Halves split at {mid} ==")
for lbl, part in (('first', [r for r in dips if r['date'] < mid]), ('second', [r for r in dips if r['date'] >= mid])):
    for name, fn in q.CANDIDATES[:4]:
        bt.summarize(f"{lbl}: {name[:40]}", [r for r in part if fn(r)])

per_sym = defaultdict(list)
for r in dips:
    per_sym[r['sym']].append(r)
print("\n== Symbol-weighted 26w mean ==")
for name, fn in q.CANDIDATES[:4]:
    g = [statistics.mean(r['f26'] for r in v if fn(r)) for v in per_sym.values() if any(fn(r) for r in v)]
    print(f"{name:52} {statistics.mean(g):+6.1f}%  ({len(g)} stocks)")

syms = sorted(per_sym); rng = random.Random(42); C = dict(q.CANDIDATES)


def pooled(sample, fn):
    xs = [r['f26'] for s in sample for r in per_sym[s] if fn(r)]
    return statistics.mean(xs) if xs else None


print("\n== Stock-level bootstrap, 2,000 resamples ==")
verdict = None
for x, y in (("F. Growing (pre-registered candidate)", "A. Buy every dip"),
             ("F. Growing (pre-registered candidate)", "   Not growing (growth 0 or -1)"),
             ("E. Trend + growing + no red flag (current app)", "A. Buy every dip"),
             ("B. Trend intact only", "A. Buy every dip")):
    diffs = []
    for _ in range(2000):
        s = [rng.choice(syms) for _ in syms]
        a, b = pooled(s, C[x]), pooled(s, C[y])
        if a is not None and b is not None:
            diffs.append(a - b)
    diffs.sort(); p = sum(d <= 0 for d in diffs) / len(diffs)
    print(f"{x[:2]} − {y.strip()[:22]:22} {statistics.mean(diffs):+6.1f} pts  90% CI [{diffs[100]:+6.1f}, {diffs[1900]:+6.1f}]  P(gap <= 0) = {p:.1%}")
    if verdict is None:
        verdict = p < 0.10
print(f"\nPre-registered criterion (F beats A with P < 10%): {'PASS' if verdict else 'FAIL'}")
