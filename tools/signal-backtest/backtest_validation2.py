"""
Second pre-registered validation, on a FOURTH universe (mid caps) never used before. Rules and the pass/fail
criterion are in quality_rules.py (CANDIDATES_2). Symbols in any earlier universe are removed automatically.

    python backtest_validation2.py   # downloads on first run, then uses midcap_*_cache.json
"""
import importlib.util, os, random, re, statistics, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
sys.path.insert(0, HERE)
import quality_rules as q

MIDCAPS = """AAON ACM AFG AGCO ALK ALLY AMG AN AR ARW ASGN ATR AVT AYI BC BJ BLD BRBR BRKR BWA BWXT CACI CASY CBSH CELH
CG CHDN CHE CHRW CIEN CLH CMC COHR COKE COLM CR CROX CSL CW DAR DBX DCI DECK DINO DKS DT DUOL EHC ELF EME ENTG EQH
EVR EWBC EXEL EXP FAF FCN FFIV FHN FIX FLR FND FNF FTI GGG GME GNTX GPK HALO HLI HQY HRB HXL IBKR INGR ITT JAZZ
JBL JEF JLL KBR KNSL KNX LAD LAMR LECO LII LNW LPX LSCC MANH MASI MAT MEDP MIDD MKSI MORN MTDR MTN MTZ MUSA NBIX NFG
NOV NVT NYT OC OGE OLED OLLI ORI OSK OVV PAG PCTY PEN PFGC PNFP POOL PRI PSTG RBC RGA RGEN RH RLI RNR RRC RRX RS
SAIA SCI SEIC SF SFM SNX SON SSD ST STLD THC TKR TOL TPX TREX TTC TXRH UFPI UNM USFD UTHR VNT WCC WEX WFRD WH WING
WMS WSM WSO WTRG WWD XPO YETI ZION""".split()


def listed(name, var):
    src = open(os.path.join(HERE, name), encoding='utf-8').read()
    return set(re.search(var + r' = """(.*?)"""', src, re.S).group(1).split())


seen = set(bt.SYMBOLS) | listed('backtest_holdout.py', 'HOLDOUT') | listed('backtest_validation.py', 'VALIDATION')
bt.SYMBOLS = [s for s in MIDCAPS if s not in seen]
bt.CACHE = os.path.join(HERE, 'midcap_prices_cache.json')
data = bt.load()
earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                    os.path.join(HERE, 'midcap_earn_cache.json'), os.path.join(HERE, 'midcap_annual_cache.json'))
rows = [r for r in q.build_rows(data, earn, annual) if r['f']]
dips = [r for r in rows if r['dip']]
print(f"mid caps: {len(data['ids'])} stocks, {len(rows)} observations with fundamentals, {len(dips)} dips "
      f"({min(r['date'] for r in rows)} → {max(r['date'] for r in rows)}); overlap with earlier universes: {len(seen & set(data['ids']))}")

print("\n== Pre-registered rules (among dips) ==")
for name, fn in q.CANDIDATES_2:
    bt.summarize(name, [r for r in dips if fn(r)])

C = dict(q.CANDIDATES_2)
S, R, F, A = (C[k] for k in ("S. Growing, earnings-backed (EPS outlook >= 10%)", "R. Growing, revenue-only", "F. Growing", "A. Buy every dip"))
dates = sorted(set(r['date'] for r in dips)); mid = dates[len(dates) // 2]
print(f"\n== Halves split at {mid} ==")
for lbl, part in (('first', [r for r in dips if r['date'] < mid]), ('second', [r for r in dips if r['date'] >= mid])):
    for name, fn in (("A", A), ("F", F), ("S", S), ("R", R)):
        bt.summarize(f"{lbl}: {name}", [r for r in part if fn(r)])

per_sym = defaultdict(list)
for r in dips:
    per_sym[r['sym']].append(r)
print("\n== Symbol-weighted 26w mean ==")
for name, fn in (("A every dip", A), ("F growing", F), ("S earnings-backed", S), ("R revenue-only", R)):
    g = [statistics.mean(r['f26'] for r in v if fn(r)) for v in per_sym.values() if any(fn(r) for r in v)]
    print(f"{name:22} {statistics.mean(g):+6.1f}%  ({len(g)} stocks)")

syms = sorted(per_sym); rng = random.Random(42)


def pooled(sample, fn):
    xs = [r['f26'] for s in sample for r in per_sym[s] if fn(r)]
    return statistics.mean(xs) if xs else None


def boot(fx, fy):
    diffs = []
    for _ in range(2000):
        s = [rng.choice(syms) for _ in syms]
        a, b = pooled(s, fx), pooled(s, fy)
        if a is not None and b is not None:
            diffs.append(a - b)
    diffs.sort()
    return statistics.mean(diffs), diffs[int(.05 * len(diffs))], diffs[int(.95 * len(diffs))], sum(d <= 0 for d in diffs) / len(diffs)


print("\n== Stock-level bootstrap, 2,000 resamples ==")
res = {}
for label, fx, fy in (("S − R", S, R), ("F − A", F, A), ("S − A", S, A)):
    m, lo, hi, p = res[label] = boot(fx, fy)
    print(f"{label}: {m:+6.1f} pts  90% CI [{lo:+6.1f}, {hi:+6.1f}]  P(gap <= 0) = {p:.1%}")

dd = lambda fn: sum(r['dd13'] <= -20 for r in dips if fn(r)) / max(1, sum(1 for r in dips if fn(r)))
ok = res["S − R"][3] < 0.10 and dd(S) < dd(R)
print(f"\nFurther 20%+ drop rate: S {dd(S):.1%} vs R {dd(R):.1%}")
print(f"Pre-registered criterion #2 (S beats R with P < 10% AND lower drop rate): {'PASS' if ok else 'FAIL'}")
