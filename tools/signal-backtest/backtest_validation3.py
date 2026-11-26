"""
Third pre-registered validation, on a FIFTH universe ("fresh") never used before. The four hypotheses and their
pass/fail criteria are in quality_rules.py (PRE-REGISTERED #5). Symbols in any earlier universe, and the app's own
watchlist, are removed automatically.

    python backtest_validation3.py   # downloads on first run, then uses fresh_*_cache.json
"""
import importlib.util, os, random, re, statistics, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
sys.path.insert(0, HERE)
import quality_rules as q
import benchmark

# Picked by name only on 2026-11-21: faster-growing, more volatile companies first (the app's watchlist is mostly
# such names, and the deep-dip and volatility questions need them), then steadier large caps for the calm side.
FRESH = """APP COIN HOOD RBLX U AFRM SOFI UPST DKNG CVNA W CHWY PTON ESTC CFLT GTLB S PATH AI BILL PCOR TOST FSLY
DOCN FROG NTNX BOX APPF PAYC VEEV XYZ SPOT SE MELI NU GRAB CPNG BABA JD PDD BIDU TSM ASML IOT ONON SMCI TER MPWR
SEDG FSLR RUN ONTO AMKR QRVO CRUS SLAB POWI DIOD SYNA RMBS ACLS AEHR CAMT NVMI ALGM AMBA SITM MTSI UCTT ICHR FORM
KLIC STX WDC DELL LITE VIAV CALX EXTR GEN CHKP TENB RPD QLYS VRNS BROS SHAK SG TRIP TCOM MTCH BMBL NTES PENN CZR
BNTX NVAX CRSP NTLA BEAM EXAS NTRA GH TDOC DOCS HIMS INSP TNDM ALNY BMRN SRPT IONS VKTX MDGL AXSM ARGX LEGN
ICLR CRL A BIO TECH RVTY LPLA RJF KKR APO ARES OWL FCNCA WAL KEY RF HBAN CFG SYF AJG MMC WTW BRO ACGL TRV ALL AFL
CINF WRB HUBB AME DOV FTV GWW IEX NDSN SNA TXT HWM HEI AXON LHX LDOS BAH J AAL H TSN HRL KDP TAP GPC ANF AEO URBN
RL TPR HAS LKQ ALV PNR AOS MAS BLDR AEM WPM FNV AA ATI CRS ALB CF NTR IFF DD RPM AVY BALL IP PKG EQT TRGP LNG EPD
ENB CNQ SU SHEL NRG VST PCG DTE ED AWK PSA EXR AVB INVH VTR ARE VICI IRM BAX COO DGX MOH FICO GDDY EPAM BR CDW PTC
TRMB TDY TMUS WBD LYV ADM""".split()
# The app's watchlist names that are in no earlier universe: their current prices were on screen when this was written.
WATCHLIST = set("NBIS ARM VRT GEV CEG BLK RIVN ET ANT".split())


def listed(name, var):
    src = open(os.path.join(HERE, name), encoding='utf-8').read()
    return set(re.search(var + r' = """(.*?)"""', src, re.S).group(1).split())


seen = (set(bt.SYMBOLS) | listed('backtest_holdout.py', 'HOLDOUT') | listed('backtest_validation.py', 'VALIDATION')
        | listed('backtest_validation2.py', 'MIDCAPS') | WATCHLIST)
bt.SYMBOLS = [s for s in dict.fromkeys(FRESH) if s not in seen]
bt.CACHE = os.path.join(HERE, 'fresh_prices_cache.json')
data = bt.load()
earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                    os.path.join(HERE, 'fresh_earn_cache.json'), os.path.join(HERE, 'fresh_annual_cache.json'))
rows = [r for r in q.build_rows(data, earn, annual) if r['f']]
benchmark.add_excess(rows, benchmark.load(bt))
dips = [r for r in rows if r['dip']]
buys = [r for r in dips if q.dip_buy(r)]
print(f"fresh: {len(data['ids'])} stocks resolved, {len({r['sym'] for r in rows})} with fundamentals, {len(rows)} observations, "
      f"{len(dips)} dips, {len(buys)} DIP BUYs from {len({r['sym'] for r in buys})} stocks "
      f"({min(r['date'] for r in rows)} -> {max(r['date'] for r in rows)}); overlap with earlier universes: {len(seen & set(data['ids']))}")

per_sym = defaultdict(list)
for r in rows:
    per_sym[r['sym']].append(r)
syms = sorted(per_sym)


def mean(xs, key):
    xs = list(xs)
    return statistics.mean(key(r) for r in xs) if xs else None


def rate(xs, cond):
    xs = list(xs)
    return sum(cond(r) for r in xs) / len(xs) if xs else None


def boot(stat_x, stat_y, n=2000, seed=42):
    """Stock-level bootstrap of stat_x(sample) - stat_y(sample): (mean, 5th pct, 95th pct, P(diff <= 0))."""
    rng = random.Random(seed)
    diffs = []
    for _ in range(n):
        sample = [r for s in (rng.choice(syms) for _ in syms) for r in per_sym[s]]
        a, b = stat_x(sample), stat_y(sample)
        if a is not None and b is not None:
            diffs.append(a - b)
    diffs.sort()
    return statistics.mean(diffs), diffs[int(.05 * len(diffs))], diffs[int(.95 * len(diffs))], sum(d <= 0 for d in diffs) / len(diffs)


def enough(xs):
    return len(xs) >= q.MIN_ROWS and len({r['sym'] for r in xs}) >= q.MIN_STOCKS


def size(xs):
    return f"{len(xs)} rows / {len({r['sym'] for r in xs})} stocks"


is_buy = lambda r: r['dip'] and q.dip_buy(r)
fell = lambda r: r['dd13'] <= -20
f26 = lambda r: r['f26']
results = {}

# ---- H1: deep dips ----
deep = lambda r: is_buy(r) and r['dip_pct'] >= q.DEEP_DIP_PERCENT
regular = lambda r: is_buy(r) and r['dip_pct'] < q.DEEP_DIP_PERCENT
D, Rg = [r for r in rows if deep(r)], [r for r in rows if regular(r)]
print(f"\n== H1 deep dips: {q.DEEP_DIP_PERCENT}%+ below the high ({size(D)}) vs 15-{q.DEEP_DIP_PERCENT}% ({size(Rg)}) ==")
if enough(D) and Rg:
    bt.summarize(f"deep ({q.DEEP_DIP_PERCENT}%+)", D); bt.summarize("regular", Rg)
    m, lo, hi, p = boot(lambda s: rate([r for r in s if deep(r)], fell), lambda s: rate([r for r in s if regular(r)], fell))
    gap = rate(D, fell) - rate(Rg, fell)
    print(f"fell another 20%+ within 13 weeks: deep {rate(D, fell):.0%} vs regular {rate(Rg, fell):.0%}; "
          f"difference {gap * 100:+.1f} points, 90% CI [{lo * 100:+.1f}, {hi * 100:+.1f}], P(diff <= 0) = {p:.1%}")
    results['H1'] = 'PASS' if gap >= 0.10 and p < 0.10 else 'FAIL'
else:
    results['H1'] = 'INCONCLUSIVE'
print(f"H1 (deep-dip caution): {results['H1']}")

# ---- H2: volatility ----
high = lambda r: is_buy(r) and r['vol'] >= q.VOL_HIGH
low = lambda r: is_buy(r) and r['vol'] < q.VOL_LOW
Hi, Lo = [r for r in rows if high(r)], [r for r in rows if low(r)]
print(f"\n== H2 volatility: {q.VOL_HIGH}%+ a year ({size(Hi)}) vs under {q.VOL_LOW}% ({size(Lo)}) ==")
if enough(Hi) and enough(Lo):
    bt.summarize(f"high volatility ({q.VOL_HIGH}%+)", Hi); bt.summarize(f"low volatility (<{q.VOL_LOW}%)", Lo)
    bt.summarize("in between", [r for r in buys if q.VOL_LOW <= r['vol'] < q.VOL_HIGH])
    m, lo, hi, p = boot(lambda s: rate([r for r in s if high(r)], fell), lambda s: rate([r for r in s if low(r)], fell))
    gap = rate(Hi, fell) - rate(Lo, fell)
    print(f"fell another 20%+ within 13 weeks: high {rate(Hi, fell):.0%} vs low {rate(Lo, fell):.0%}; "
          f"difference {gap * 100:+.1f} points, 90% CI [{lo * 100:+.1f}, {hi * 100:+.1f}], P(diff <= 0) = {p:.1%}")
    results['H2'] = 'PASS' if gap >= 0.10 and p < 0.10 else 'FAIL'
else:
    results['H2'] = 'INCONCLUSIVE'
print(f"H2 (volatility risk line): {results['H2']}")

# ---- H3: stop-loss ----
print(f"\n== H3 a {q.STOP_PERCENT}% stop-loss on DIP BUYs ({size(buys)}) ==")
hold_mean, stop_mean = mean(buys, f26), mean(buys, q.stop_return)
m, lo, hi, p = boot(lambda s: mean([r for r in s if is_buy(r)], f26), lambda s: mean([r for r in s if is_buy(r)], q.stop_return))
stopped = rate(buys, lambda r: r['dd26'] <= -q.STOP_PERCENT)
print(f"hold 26 weeks: mean {hold_mean:+.1f}% median {statistics.median(f26(r) for r in buys):+.1f}% | "
      f"with the stop: mean {stop_mean:+.1f}% median {statistics.median(q.stop_return(r) for r in buys):+.1f}% (stopped out {stopped:.0%})")
print(f"hold - stop = {hold_mean - stop_mean:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(diff <= 0) = {p:.1%}")
results['H3'] = 'PASS' if hold_mean > stop_mean and p < 0.10 else 'FAIL'
print(f"H3 (a 20% stop lowered the average result): {results['H3']}")

# ---- H4: shallow dips (recommend only) ----
deeper = lambda r: is_buy(r) and r['dip_pct'] >= q.SHALLOW_DIP_PERCENT
shallow = lambda r: is_buy(r) and r['dip_pct'] < q.SHALLOW_DIP_PERCENT
De, Sh = [r for r in rows if deeper(r)], [r for r in rows if shallow(r)]
print(f"\n== H4 shallow dips: growing dips of {q.SHALLOW_DIP_PERCENT}%+ ({size(De)}) vs 15-{q.SHALLOW_DIP_PERCENT}% ({size(Sh)}) ==")
bt.summarize(f"growing, {q.SHALLOW_DIP_PERCENT}%+ below the high", De); bt.summarize(f"growing, 15-{q.SHALLOW_DIP_PERCENT}% below", Sh)
bt.summarize("every dip", dips)
m, lo, hi, p = boot(lambda s: mean([r for r in s if deeper(r)], f26), lambda s: mean([r for r in s if shallow(r)], f26))
gap = mean(De, f26) - mean(Sh, f26)
shallow_beats_every = mean(Sh, f26) > mean(dips, f26)
print(f"{q.SHALLOW_DIP_PERCENT}%+ minus 15-{q.SHALLOW_DIP_PERCENT}% = {gap:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(diff <= 0) = {p:.1%}; "
      f"15-{q.SHALLOW_DIP_PERCENT}% growing dips {'beat' if shallow_beats_every else 'did not beat'} every dip")
results['H4'] = 'PASS' if gap > 0 and p < 0.10 and not shallow_beats_every else 'FAIL'
print(f"H4 (recommend a {q.SHALLOW_DIP_PERCENT}% dip threshold to the user): {results['H4']}")

print("\nPre-registered #5: " + ", ".join(f"{k} {v}" for k, v in results.items()))

# ---- Reported only: not eligible to ship or change anything ----
print("\n== Context only ==")
bt.summarize("A. Buy every dip", dips)
bt.summarize("F. Growing (app's DIP BUY)", buys)
bt.summarize("   Not growing", [r for r in dips if not q.dip_buy(r)])
m, lo, hi, p = boot(lambda s: mean([r for r in s if is_buy(r)], f26), lambda s: mean([r for r in s if r['dip']], f26))
print(f"F - A: {m:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(gap <= 0) = {p:.1%}")
growers = [r for r in rows if q.dip_buy(r)]
bt.summarize("Growing, no dip (WATCH)", [r for r in growers if not r['dip']])
m, lo, hi, p = boot(lambda s: mean([r for r in s if is_buy(r)], f26), lambda s: mean([r for r in s if q.dip_buy(r) and not r['dip']], f26))
print(f"DIP BUY - WATCH: {m:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(gap <= 0) = {p:.1%}")
with_spy = [r for r in buys if r['x26'] is not None]
m, lo, hi, p = boot(lambda s: mean([r for r in s if is_buy(r) and r['x26'] is not None], lambda r: r['x26']), lambda s: 0.0)
print(f"DIP BUY vs the S&P 500 over the same weeks: {mean(with_spy, f26):+.1f}% vs {mean(with_spy, lambda r: r['spy26']):+.1f}%; "
      f"excess {m:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(no edge) = {p:.1%}; "
      f"median excess {statistics.median(r['x26'] for r in with_spy):+.1f}, beat the index {rate(with_spy, lambda r: r['x26'] > 0):.0%}")

# ---- Descriptive, for the app's position-sizing calculator (added 2026-11-21, after the results above were known).
# Not a hypothesis and not a prediction: how bad the bad cases were, by the volatility groups fixed in H2.
print("\n== For position sizing: the 26-week result of DIP BUYs by volatility group (descriptive) ==")
pct = lambda v, p: sorted(v)[min(len(v) - 1, int(p * len(v)))]
for name, fn in ((f"volatile ({q.VOL_HIGH}%+)", lambda r: r['vol'] >= q.VOL_HIGH),
                 ("in between", lambda r: q.VOL_LOW <= r['vol'] < q.VOL_HIGH),
                 (f"calm (<{q.VOL_LOW}%)", lambda r: r['vol'] < q.VOL_LOW), ("all DIP BUYs", lambda r: True)):
    xs = [r for r in buys if fn(r)]
    res, low = [r['f26'] for r in xs], [r['dd26'] for r in xs]
    print(f"{name:16} {size(xs):26} worst tenth lost {-pct(res, .10):4.1f}% or more, worst twentieth {-pct(res, .05):4.1f}% | "
          f"lowest point on the way: median {statistics.median(low):+5.1f}%, worst tenth {pct(low, .10):+5.1f}%")

# The other side of the same table (added 2026-11-21 so a holding's bad case is not shown alone): what the typical
# and the best tenth of the same DIP BUYs did. Descriptive like the bad case: not a hypothesis, not a prediction.
print("\n== The same DIP BUYs: the typical result and the best tenth (descriptive) ==")
for name, fn in ((f"volatile ({q.VOL_HIGH}%+)", lambda r: r['vol'] >= q.VOL_HIGH),
                 ("in between", lambda r: q.VOL_LOW <= r['vol'] < q.VOL_HIGH),
                 (f"calm (<{q.VOL_LOW}%)", lambda r: r['vol'] < q.VOL_LOW), ("all DIP BUYs", lambda r: True)):
    res = [r['f26'] for r in buys if fn(r)]
    print(f"{name:16} typical (median) {statistics.median(res):+5.1f}%, mean {statistics.mean(res):+5.1f}%, "
          f"best tenth gained {pct(res, .90):4.1f}% or more, up after 26 weeks {sum(x > 0 for x in res) / len(res):.0%}")


# ---------------------------------------------------------------------------------------------------------------
# The figures above that the app quotes, recorded for it (see quoted.py): they reach its texts through
# `npm run evidence`, never by hand.
# ---------------------------------------------------------------------------------------------------------------
import quoted


def case(xs):
    res = [r['f26'] for r in xs]
    return dict(n=len(xs), stocks=len({r['sym'] for r in xs}),
                bad=-pct(res, .10), typical=statistics.median(res), good=pct(res, .90))


quoted.put('fresh', dict(
    stocks=len(data['ids']), dipBuys=len(buys), firstBuy=min(r['date'] for r in buys), lastBuy=max(r['date'] for r in buys),
    everyDip=mean(dips, f26), growing=mean(buys, f26), holding=hold_mean, withStop=stop_mean, stopped=stopped,
    fellVolatile=rate(Hi, fell), fellCalm=rate(Lo, fell), verdicts=results,
    volatileFrom=q.VOL_HIGH, calmBelow=q.VOL_LOW, stopPercent=q.STOP_PERCENT,
    cases=dict(volatile=case([r for r in buys if r['vol'] >= q.VOL_HIGH]),
               middle=case([r for r in buys if q.VOL_LOW <= r['vol'] < q.VOL_HIGH]),
               calm=case([r for r in buys if r['vol'] < q.VOL_LOW])),
))
