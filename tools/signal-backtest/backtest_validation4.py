"""
Fourth pre-registered validation, on a SIXTH universe never used before. The three hypotheses and their pass/fail
criteria are in quality_rules.py (PRE-REGISTERED #6): which DIP BUY first, whether to take profits early, and what
to do when the 26 weeks are over. Symbols in any earlier universe, and the app's own lists and holdings, are removed
automatically.

    python backtest_validation4.py            # downloads on first run, then uses sixth_*_cache.json
    python backtest_validation4.py --explore  # the exploration that led to #6, on the five lists used before
    python backtest_validation4.py --robust   # looked at AFTER the verdicts: how much they rest on a few winners,
                                              # and P1 inside one week (descriptive; the README quotes it)
    python backtest_validation4.py --orderings  # is ANY order among one week's DIP BUYs ahead dependably? (descriptive)
"""
import importlib.util, os, random, re, statistics, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
sys.path.insert(0, HERE)
import quality_rules as q
import benchmark

# Picked by name only on 2026-11-21, from what was left: every large and mid cap that came to mind and had not been
# used in any of the five earlier lists (software and hardware, consumer, health care, finance, industry, energy,
# utilities, property, staples, and companies listed abroad). Kept in the order written.
SIXTH = """MNDY ASAN NCNO PEGA GWRE FIVN RNG BRZE KVYO QTWO WK WIX GLBE FVRR UPWK YELP Z OPEN RKT LMND SOUN IONQ RGTI
ASTS RKLB JOBY ACHR WOLF COHU PLAB VECO CRDO ALAB FLEX SANM CLS FN IPGP LFUS LOGI SONO RVLV FIVE BURL KSS M SKX
UAA VFC PVH LEVI HOG PII THO AAP GPI QSR DRI EAT CAKE WEN PZZA CAVA PLNT GEHC ALKS RARE ACAD CORT OSCR UHS DVA
MSTR MARA RIOT CLSK LC JKHY FOUR BEN IVZ AMP MKTX TW CBOE FDS CMA SNV CFR WTFC DY STRL TTEK HII KTOS AVAV JBLU
GXO WCN ROL ALLE WY CLF SCCO MP EMN CE WLK AXTA FMC APA CTRA CNX RIG AEE CMS ETR FE PPL CNP NI ATO AES ESS UDR
CPT AMH SUI CUBE KIM REG BXP VNO HST K CPB CAG SAM LW POST BG TM HMC SONY SAP NVO AZN GSK SNY NVS UL DEO BTI BUD
RIO BHP VALE BP TTE EQNR PBR ITUB NIO XPEV LI BILI TME FUTU GLOB STNE XP INFY HDB IBN UMC STM ERIC NOK TRP BN
MFC TD RY BMO""".split()
# The app's own lists and holdings on 2026-11-21: their current prices were on screen when this was written.
ON_SCREEN = set("""AAPL MSFT GOOGL AMZN META NVDA AVGO AMD MU SNDK MRVL ARM ANT ORCL NBIS CRWD VRT CSCO GEV BE CEG VST
TSLA SPCX RIVN NEE BLK SMH SCHD COHR ET""".split())

FILES = {'tuning': ('backtest_cache.json', 'earn_hist_cache.json', 'annual_cache.json')}
for _name in ('holdout', 'validation', 'midcap', 'fresh', 'sixth', 'seventh'):
    FILES[_name] = (f'{_name}_prices_cache.json', f'{_name}_earn_cache.json', f'{_name}_annual_cache.json')


def listed(name, var):
    src = open(os.path.join(HERE, name), encoding='utf-8').read()
    return set(re.search(var + r' = """(.*?)"""', src, re.S).group(1).split())


def load_rows(name, as_downloaded=False):
    """Every evaluation date with fundamentals for one list, with the S&P 500 over the same 26 and 52 weeks.
    `as_downloaded`: the provider's year bar as it came (quality_rules.weekly_bars); pre-registered #9 only."""
    prices, earn_file, annual_file = FILES[name]
    bt.CACHE = os.path.join(HERE, prices)
    data = bt.load()
    earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()), os.path.join(HERE, earn_file), os.path.join(HERE, annual_file))
    rows = [dict(r, sym=f"{name}:{r['sym']}", universe=name)
            for r in q.build_rows(data, earn, annual, as_downloaded=as_downloaded) if r['f']]
    spy = benchmark.load(bt)
    benchmark.add_excess(rows, spy)
    for r in rows:
        r['spy52'] = benchmark.forward_return(spy, r['date'], 52)
    return data, rows


def late(r):
    """The position's return over weeks 26-52."""
    return ((1 + r['f52'] / 100) / (1 + r['f26'] / 100) - 1) * 100


def spy_late(r):
    return ((1 + r['spy52'] / 100) / (1 + r['spy26'] / 100) - 1) * 100


def mean(xs, key=lambda r: r['f26']):
    xs = list(xs)
    return statistics.mean(key(r) for r in xs) if xs else None


def rate(xs, cond):
    xs = list(xs)
    return sum(cond(r) for r in xs) / len(xs) if xs else None


def boot(rows, stat_x, stat_y, n=2000, seed=42):
    """Stock-level bootstrap of stat_x(sample) - stat_y(sample): (mean, 5th pct, 95th pct, P(diff <= 0), P(diff >= 0))."""
    by = defaultdict(list)
    for r in rows:
        by[r['sym']].append(r)
    keys = sorted(by); rng = random.Random(seed); diffs = []
    for _ in range(n):
        sample = [r for k in (rng.choice(keys) for _ in keys) for r in by[k]]
        a, b = stat_x(sample), stat_y(sample)
        if a is not None and b is not None:
            diffs.append(a - b)
    diffs.sort()
    return (statistics.mean(diffs), diffs[int(.05 * len(diffs))], diffs[int(.95 * len(diffs))],
            sum(d <= 0 for d in diffs) / len(diffs), sum(d >= 0 for d in diffs) / len(diffs))


def week_gaps(buys):
    """For every week that had both kinds: the mean result of the sharp fallers minus that of the other DIP BUYs bought that week."""
    by_date = defaultdict(list)
    for r in buys:
        by_date[r['date']].append(r)
    gaps = []
    for rs in by_date.values():
        sharp = [r['f26'] for r in rs if q.sharp_fall(r)]
        rest = [r['f26'] for r in rs if not q.sharp_fall(r)]
        if sharp and rest:
            gaps.append(statistics.mean(sharp) - statistics.mean(rest))
    return gaps


def size(xs):
    return f"{len(xs)} rows / {len({r['sym'] for r in xs})} stocks"


def enough(xs):
    return len(xs) >= q.MIN_ROWS and len({r['sym'] for r in xs}) >= q.MIN_STOCKS


is_buy = lambda r: r['dip'] and q.dip_buy(r)
fell = lambda r: r['dd13'] <= -20
f26 = lambda r: r['f26']
with_52 = lambda r: r['f52'] is not None and r['spy52'] is not None and r['spy26'] is not None


def explore():
    """What was looked at before #6 was written, on the five lists already used (reproducible)."""
    lists = {name: [r for r in load_rows(name)[1] if is_buy(r)] for name in ('tuning', 'holdout', 'validation', 'midcap', 'fresh')}
    pooled = [r for rs in lists.values() for r in rs]
    oos = [r for r in pooled if r['universe'] != 'tuning']
    m = lambda xs: statistics.mean(xs) if xs else float('nan')
    print("== take-profit: sell at +X% if a weekly high touches it within 26 weeks, else hold 26 weeks (mean result) ==")
    for name, rs in list(lists.items()) + [('ALL', pooled)]:
        tp = lambda x: m([x if r['up26'] >= x else r['f26'] for r in rs])
        print(f"{name:11} n={len(rs):5} hold {m([r['f26'] for r in rs]):+6.1f}%  " + '  '.join(f"+{x}%: {tp(x):+5.1f}%" for x in (20, 25, 30, 50)))
    print("\n== after 26 weeks: the same positions over weeks 26-52, against the S&P 500 over those weeks ==")
    for name, rs in list(lists.items()) + [('ALL', pooled)]:
        rs = [r for r in rs if with_52(r)]
        print(f"{name:11} n={len(rs):5} weeks 26-52 {m([late(r) for r in rs]):+6.1f}% vs S&P {m([spy_late(r) for r in rs]):+5.1f}%  "
              f"beat it {sum(late(r) > spy_late(r) for r in rs) / len(rs):4.0%}")
    print("\n== orderings among DIP BUYs: mean 26-week result of the first group / the second, by list ==")
    orderings = [
        ('fell 25%+ in the 13 weeks before / fell less', q.sharp_fall, lambda r: not q.sharp_fall(r)),
        ('beat the last quarter / missed or matched', lambda r: (r['f']['surprise'] or 0) > 0, lambda r: (r['f']['surprise'] or 0) <= 0),
        ('revenue growth >= 30% / less', lambda r: (r['f']['rev_g'] or -1e9) >= 30, lambda r: (r['f']['rev_g'] or -1e9) < 30),
        ('volatile (45%+) / calm (<35%)', lambda r: r['vol'] >= q.VOL_HIGH, lambda r: r['vol'] < q.VOL_LOW),
        ('above its 40-week average / below', lambda r: r['above'], lambda r: not r['above']),
    ]
    for label, first, second in orderings:
        cells = []
        for name, rs in list(lists.items()) + [('ALL', pooled)]:
            a, b = [r['f26'] for r in rs if first(r)], [r['f26'] for r in rs if second(r)]
            cells.append(f"{name[:5]} {m(a):+5.1f}/{m(b):+5.1f}" if len(a) >= 15 and len(b) >= 15 else f"{name[:5]}     -     ")
        print(f"{label:46} " + '  '.join(cells))
    a, b = [r for r in oos if q.sharp_fall(r)], [r for r in oos if not q.sharp_fall(r)]
    g, lo, hi, p, _ = boot(oos, lambda s: mean(r for r in s if q.sharp_fall(r)), lambda s: mean(r for r in s if not q.sharp_fall(r)), n=1000)
    print(f"\nsharp fall, four out-of-sample lists pooled: {m([r['f26'] for r in a]):+.1f}% vs {m([r['f26'] for r in b]):+.1f}%, "
          f"median {statistics.median(r['f26'] for r in a):+.1f}% vs {statistics.median(r['f26'] for r in b):+.1f}%, "
          f"fell another 20%+ {rate(a, fell):.0%} vs {rate(b, fell):.0%}; gap {g:+.1f} pts [{lo:+.1f}, {hi:+.1f}], P(gap <= 0) = {p:.1%}")


def within_week(label, buys, n=1000):
    """P1 inside one week: each result minus the average of all DIP BUYs bought that week, sharp fallers against the rest."""
    by_date = defaultdict(list)
    for r in buys:
        by_date[r['date']].append(r)
    rel = []
    for rs in by_date.values():
        if any(q.sharp_fall(r) for r in rs) and not all(q.sharp_fall(r) for r in rs):
            average = statistics.mean(r['f26'] for r in rs)
            rel += [dict(sym=r['sym'], sharp=q.sharp_fall(r), rel=r['f26'] - average) for r in rs]
    gaps = week_gaps(buys)
    if not gaps:
        print(f"{label:26} no week with both kinds")
        return
    gap_of = lambda xs: (mean((x for x in xs if x['sharp']), lambda x: x['rel']), mean((x for x in xs if not x['sharp']), lambda x: x['rel']))
    by_sym = defaultdict(list)
    for x in rel:
        by_sym[x['sym']].append(x)
    keys = sorted(by_sym); rng = random.Random(42); diffs = []
    for _ in range(n):
        a, b = gap_of([x for k in (rng.choice(keys) for _ in keys) for x in by_sym[k]])
        if a is not None and b is not None:
            diffs.append(a - b)
    diffs.sort()
    a, b = gap_of(rel)
    print(f"{label:26} {len(gaps):3} weeks with both kinds: ahead in {sum(g > 0 for g in gaps) / len(gaps):4.0%} of weeks, typical weekly gap "
          f"{statistics.median(gaps):+5.1f} pts | with each week's average taken out: {a - b:+5.1f} pts, 90% CI "
          f"[{diffs[int(.05 * len(diffs))]:+.1f}, {diffs[int(.95 * len(diffs))]:+.1f}], P(gap <= 0) = {sum(d <= 0 for d in diffs) / len(diffs):.1%}")


def robust():
    """Looked at after the verdicts of #6 were known. Descriptive: nothing here can ship or change anything."""
    lists = {name: [r for r in load_rows(name)[1] if is_buy(r)] for name in ('tuning', 'holdout', 'validation', 'midcap', 'fresh', 'sixth')}
    buys = lists['sixth']
    sharp, rest = [r for r in buys if q.sharp_fall(r)], [r for r in buys if not q.sharp_fall(r)]
    med = lambda xs, key=f26: statistics.median(key(r) for r in xs)
    capped = lambda xs, key=f26: mean(xs, lambda r: min(key(r), 100))

    print("\n== P1 on the sixth list: who made the average ==")
    total = defaultdict(float)
    for r in sharp:
        total[r['sym']] += r['f26']
    lead = sorted(total, key=total.get, reverse=True)[:5]
    without = [r for r in sharp if r['sym'] not in lead]
    print(f"five stocks ({', '.join(x.split(':')[1] for x in lead)}) made {sum(total[x] for x in lead) / sum(total.values()):.0%} of the sharp "
          f"fallers' total gain; without them: mean {mean(without):+.1f}%, median {med(without):+.1f}% "
          f"(the rest: mean {mean(rest):+.1f}%, median {med(rest):+.1f}%)")
    print(f"every result capped at +100%: sharp fallers {capped(sharp):+.1f}% vs the rest {capped(rest):+.1f}%")
    print("largest: " + ', '.join(f"{r['sym'].split(':')[1]} {r['date']} {r['f26']:+.0f}%" for r in sorted(sharp, key=f26, reverse=True)[:6]))

    print("\n== P1 inside one week (the plan orders one day's candidates; P1 pooled every date) ==")
    for name, rs in lists.items():
        within_week(name, rs)
    within_week('four before the sixth', [r for name, rs in lists.items() if name not in ('tuning', 'sixth') for r in rs])
    within_week('five out-of-sample', [r for name, rs in lists.items() if name != 'tuning' for r in rs])

    print("\n== P2 on the sixth list ==")
    print(f"typical result: {med(buys, q.take_profit_return):+.1f}% with the take-profit vs {med(buys):+.1f}% holding; "
          f"every result capped at +100%: {capped(buys, q.take_profit_return):+.1f}% vs {capped(buys):+.1f}%")

    print("\n== P3 on the sixth list ==")
    longer = [r for r in buys if with_52(r)]
    excess = lambda r: late(r) - spy_late(r)
    print(f"excess over weeks 26-52: mean {mean(longer, excess):+.1f} pts, typical {med(longer, excess):+.1f} pts, "
          f"capped at +100: {capped(longer, excess):+.1f} pts; beat the index {rate(longer, lambda r: excess(r) > 0):.0%}")


def orderings():
    """
    Looked at on 2026-11-22, on the lists already used: eleven ways to split one week's DIP BUYs in two, each judged
    inside the week (weeks with at least two of each kind). Descriptive: nothing here can ship. An ordering that
    looked dependable would still need a pre-registered within-week test on a list never used.
    """
    num = lambda v, default: default if v is None else v
    candidates = [
        ('fell 25%+ in 13 weeks / fell less', q.sharp_fall, lambda r: not q.sharp_fall(r)),
        ('calm (<35%) / volatile (45%+)', lambda r: r['vol'] < q.VOL_LOW, lambda r: r['vol'] >= q.VOL_HIGH),
        ('deep dip (30%+ below high) / 15-30%', lambda r: r['dip_pct'] >= 30, lambda r: r['dip_pct'] < 30),
        ('revenue growth 30%+ / less', lambda r: num(r['f']['rev_g'], -1e9) >= 30, lambda r: num(r['f']['rev_g'], -1e9) < 30),
        ('earnings-backed growth / revenue only', lambda r: num(r['f']['eps_outlook'], -1e9) >= 10, lambda r: num(r['f']['eps_outlook'], -1e9) < 10),
        ('beat last quarter / did not', lambda r: num(r['f']['surprise'], 0) > 0, lambda r: num(r['f']['surprise'], 0) <= 0),
        ('above 40-week average / below', lambda r: r['above'], lambda r: not r['above']),
        ('up over the year / down', lambda r: r['mom'] > 0, lambda r: r['mom'] <= 0),
        ('no red flag / losing money or high debt', lambda r: r['f']['red'] == 0, lambda r: r['f']['red'] > 0),
        ('not expensive vs own history / expensive', lambda r: r['f']['value'] >= 0, lambda r: r['f']['value'] < 0),
        ('revenue speeding up / slowing', lambda r: num(r['f']['rev_g'], 0) > num(r['f']['rev_g_prev'], 0),
         lambda r: num(r['f']['rev_g'], 0) <= num(r['f']['rev_g_prev'], 0)),
    ]

    def inside(buys, first, second, n=600):
        by_date = defaultdict(list)
        for r in buys:
            by_date[r['date']].append(r)
        weeks, rel = [], []
        for rs in by_date.values():
            a = [r['f26'] for r in rs if first(r)]; b = [r['f26'] for r in rs if second(r)]
            if len(a) >= 2 and len(b) >= 2:
                weeks.append((statistics.mean(a) - statistics.mean(b), statistics.median(a) - statistics.median(b)))
                both = [r for r in rs if first(r) or second(r)]
                average = statistics.mean(r['f26'] for r in both)
                rel += [(r['sym'], first(r), r['f26'] - average) for r in both]
        if len(weeks) < 8:
            return None
        gap_of = lambda xs: statistics.mean(x[2] for x in xs if x[1]) - statistics.mean(x[2] for x in xs if not x[1])
        by_sym = defaultdict(list)
        for x in rel:
            by_sym[x[0]].append(x)
        keys = sorted(by_sym); rng = random.Random(42); diffs = []
        for _ in range(n):
            sample = [x for k in (rng.choice(keys) for _ in keys) for x in by_sym[k]]
            if any(x[1] for x in sample) and not all(x[1] for x in sample):
                diffs.append(gap_of(sample))
        return dict(weeks=len(weeks), ahead=sum(w[0] > 0 for w in weeks) / len(weeks), typical=sum(w[1] > 0 for w in weeks) / len(weeks),
                    weekly=statistics.median(w[0] for w in weeks), gap=gap_of(rel), p=sum(d <= 0 for d in diffs) / len(diffs))

    lists = {name: [r for r in load_rows(name)[1] if is_buy(r)] for name in ('holdout', 'validation', 'midcap', 'fresh', 'sixth')}
    pooled = [r for rs in lists.values() for r in rs]
    print(f"\n{'first kind / second kind (five out-of-sample lists pooled)':44} {'weeks':>5} {'first ahead':>12} {'by the typical stock':>21} "
          f"{'typical weekly gap':>19} {'gap, week average out':>22} {'P(gap <= 0)':>12}   lists where ahead in 55%+ of weeks")
    for label, first, second in candidates:
        w = inside(pooled, first, second)
        if not w:
            print(f"{label:44} too few weeks with two of each kind")
            continue
        each = [(name, inside(rs, first, second, n=1)) for name, rs in lists.items()]
        good = [f"{name} {x['ahead']:.0%}" for name, x in each if x and x['ahead'] >= 0.55]
        print(f"{label:44} {w['weeks']:5} {w['ahead']:12.0%} {w['typical']:21.0%} {w['weekly']:+19.1f} {w['gap']:+22.1f} {w['p']:12.1%}   "
              f"{len(good)} of {sum(x is not None for _, x in each)}: {', '.join(good) if good else '-'}")


if __name__ == '__main__':
    if '--explore' in sys.argv:
        explore()
        sys.exit(0)
    if '--orderings' in sys.argv:
        orderings()
        sys.exit(0)
    if '--robust' in sys.argv:
        robust()
        sys.exit(0)

    seen = (set(bt.SYMBOLS) | listed('backtest_holdout.py', 'HOLDOUT') | listed('backtest_validation.py', 'VALIDATION')
            | listed('backtest_validation2.py', 'MIDCAPS') | listed('backtest_validation3.py', 'FRESH') | ON_SCREEN)
    bt.SYMBOLS = [s for s in dict.fromkeys(SIXTH) if s not in seen]
    data, rows = load_rows('sixth')
    dips = [r for r in rows if r['dip']]
    buys = [r for r in dips if q.dip_buy(r)]
    print(f"sixth: {len(data['ids'])} stocks resolved, {len({r['sym'] for r in rows})} with fundamentals, {len(rows)} observations, "
          f"{len(dips)} dips, {len(buys)} DIP BUYs from {len({r['sym'] for r in buys})} stocks "
          f"({min(r['date'] for r in rows)} -> {max(r['date'] for r in rows)}); overlap with earlier universes: {len(seen & set(data['ids']))}")
    results = {}

    # ---- P1: which DIP BUY first ----
    sharp, rest = [r for r in buys if q.sharp_fall(r)], [r for r in buys if not q.sharp_fall(r)]
    print(f"\n== P1 buy first: fell {q.SHARP_FALL_PERCENT}%+ in the {q.SHARP_WEEKS} weeks before ({size(sharp)}) vs the rest ({size(rest)}) ==")
    p1 = dict(sharpRows=len(sharp), sharpStocks=len({r['sym'] for r in sharp}))
    if enough(sharp) and rest:
        bt.summarize(f"sharp fall ({q.SHARP_FALL_PERCENT}%+ in {q.SHARP_WEEKS} weeks)", sharp); bt.summarize("the rest", rest)
        g, lo, hi, p, _ = boot(buys, lambda s: mean(r for r in s if q.sharp_fall(r)), lambda s: mean(r for r in s if not q.sharp_fall(r)))
        med_s, med_r = statistics.median(f26(r) for r in sharp), statistics.median(f26(r) for r in rest)
        drop_gap = (rate(sharp, fell) - rate(rest, fell)) * 100
        print(f"mean {mean(sharp):+.1f}% vs {mean(rest):+.1f}%: gap {g:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(gap <= 0) = {p:.1%}; "
              f"median {med_s:+.1f}% vs {med_r:+.1f}%; fell another 20%+ {rate(sharp, fell):.0%} vs {rate(rest, fell):.0%} ({drop_gap:+.1f} points)")
        results['P1'] = 'PASS' if mean(sharp) > mean(rest) and p < 0.10 and med_s >= med_r and drop_gap <= q.MAX_EXTRA_DROP_POINTS else 'FAIL'
        p1.update(sharp=mean(sharp), rest=mean(rest), sharpMedian=med_s, restMedian=med_r, sharpFell=rate(sharp, fell), restFell=rate(rest, fell),
                  gap=g, pNoGap=p)
        # Reported only, added 2026-11-22 AFTER the verdict above was known; not part of the criteria. P1 pools every
        # date, while the plan orders the candidates of ONE day, and sharp falls cluster in sell-offs, when whatever is
        # bought tends to do well. So: inside each week that had both kinds, how often were the sharp fallers ahead?
        gaps = week_gaps(buys)
        if gaps:
            ahead = sum(x > 0 for x in gaps) / len(gaps)
            print(f"inside the same week ({len(gaps)} weeks with both kinds): sharp fallers ahead of the other DIP BUYs bought that week in "
                  f"{ahead:.0%} of weeks; typical weekly gap {statistics.median(gaps):+.1f} pts, average {statistics.mean(gaps):+.1f} pts")
            p1.update(weeksCompared=len(gaps), aheadWeeks=ahead, typicalWeekGap=statistics.median(gaps))
    else:
        results['P1'] = 'INCONCLUSIVE'
    print(f"P1 (list the sharp fallers first): {results['P1']}")

    # ---- P2: take profit ----
    print(f"\n== P2 a +{q.TAKE_PROFIT_PERCENT}% take-profit on DIP BUYs ({size(buys)}) ==")
    hold_mean, take_mean = mean(buys), mean(buys, q.take_profit_return)
    g, lo, hi, p, _ = boot(buys, lambda s: mean(r for r in s if is_buy(r)), lambda s: mean((r for r in s if is_buy(r)), q.take_profit_return))
    touched = rate(buys, lambda r: r['up26'] >= q.TAKE_PROFIT_PERCENT)
    print(f"hold 26 weeks: mean {hold_mean:+.1f}% median {statistics.median(f26(r) for r in buys):+.1f}% | with the take-profit: mean {take_mean:+.1f}% "
          f"median {statistics.median(q.take_profit_return(r) for r in buys):+.1f}% (sold early on {touched:.0%})")
    print(f"hold - take-profit = {hold_mean - take_mean:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(diff <= 0) = {p:.1%}")
    results['P2'] = 'PASS' if hold_mean > take_mean and p < 0.10 else 'FAIL'
    p2 = dict(holding=hold_mean, withTakeProfit=take_mean, soldEarly=touched, gap=g, pNoGap=p,
              holdingMedian=statistics.median(f26(r) for r in buys))
    print(f"P2 (taking profits at +{q.TAKE_PROFIT_PERCENT}% lowered the average result): {results['P2']}")

    # ---- P3: after 26 weeks ----
    longer = [r for r in buys if with_52(r)]
    print(f"\n== P3 after 26 weeks: the same positions over weeks 26-52 vs the S&P 500 ({size(longer)}) ==")
    p3 = dict(rows=len(longer), stocks=len({r['sym'] for r in longer}))
    if enough(longer):
        stay, index = mean(longer, late), mean(longer, spy_late)
        g, lo, hi, p_low, p_high = boot(longer, lambda s: mean((r for r in s if is_buy(r) and with_52(r)), late),
                                        lambda s: mean((r for r in s if is_buy(r) and with_52(r)), spy_late))
        beat = rate(longer, lambda r: late(r) > spy_late(r))
        print(f"weeks 26-52: positions {stay:+.1f}% vs S&P 500 {index:+.1f}%: excess {g:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], "
              f"P(excess <= 0) = {p_low:.1%}, P(excess >= 0) = {p_high:.1%}; beat the index {beat:.0%}; "
              f"median {statistics.median(late(r) for r in longer):+.1f}%")
        results['P3'] = 'KEEP' if stay > index and p_low < 0.10 else 'SELL' if stay < index and p_high < 0.10 else 'SILENT'
        p3.update(stay=stay, sp500=index, excess=g, pNotBetter=p_low, pNotWorse=p_high, beat=beat,
                  medianExcess=statistics.median(late(r) - spy_late(r) for r in longer))
    else:
        results['P3'] = 'INCONCLUSIVE'
    print(f"P3 (what to do when the 26 weeks are over): {results['P3']}")

    print("\nPre-registered #6: " + ", ".join(f"{k} {v}" for k, v in results.items()))

    # ---- Reported only: not eligible to ship or change anything ----
    print("\n== Context only ==")
    bt.summarize("A. Buy every dip", dips)
    bt.summarize("F. Growing (app's DIP BUY)", buys)
    g, lo, hi, p, _ = boot(rows, lambda s: mean(r for r in s if is_buy(r)), lambda s: mean(r for r in s if r['dip']))
    print(f"F - A: {g:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(gap <= 0) = {p:.1%}")
    with_spy = [r for r in buys if r['x26'] is not None]
    print(f"DIP BUY vs the S&P 500 over the same weeks: {mean(with_spy):+.1f}% vs {mean(with_spy, lambda r: r['spy26']):+.1f}%, "
          f"beat the index {rate(with_spy, lambda r: r['x26'] > 0):.0%}")
    high, low = [r for r in buys if r['vol'] >= q.VOL_HIGH], [r for r in buys if r['vol'] < q.VOL_LOW]
    if high and low:
        print(f"H2 again (volatility): fell another 20%+ within 13 weeks {rate(high, fell):.0%} of volatile ({size(high)}) vs {rate(low, fell):.0%} of calm ({size(low)})")
    print(f"H3 again (a {q.STOP_PERCENT}% stop-loss): {mean(buys, q.stop_return):+.1f}% with the stop vs {hold_mean:+.1f}% holding")

    # The figures above that the app quotes, recorded for it (see quoted.py).
    import quoted
    quoted.put('sixth', dict(
        stocks=len(data['ids']), dipBuys=len(buys), dipBuyStocks=len({r['sym'] for r in buys}),
        firstBuy=min(r['date'] for r in buys), lastBuy=max(r['date'] for r in buys),
        sharpFallPercent=q.SHARP_FALL_PERCENT, sharpWeeks=q.SHARP_WEEKS, takeProfitPercent=q.TAKE_PROFIT_PERCENT,
        verdicts=results, buyFirst=p1,
        takeProfit=p2,
        afterHolding=p3,
    ))
