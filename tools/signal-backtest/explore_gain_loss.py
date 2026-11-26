"""
Exploration, NOT a test (2026-11-22; kept so it can be re-run).

The user asked which ten stocks to keep if a portfolio holding every stock marked DIP BUY (19 that day) had to
shrink to ten, and asked to study it by "max potential gain and least potential loss". In the app a stock's
potential gain and loss are its good case and its bad case: the best and the worst tenth of the 26-week results
of the tested DIP BUYs of its volatility kind. Both come from how much the price moves, so the two wishes pull
apart: the stocks with the biggest good case are the ones with the biggest bad case. This look asks what each way
of keeping ten did afterwards.

From the stocks marked on one date 19 are drawn, as on the user's page; ten of them are kept by a rule and held
for half a year. Every rule uses only what was known on that date:
  least loss, the app's way    the ten with the lowest volatility over the year before
  max gain, the app's way      the ten with the highest
  least loss, own record       the ten whose own worst tenth after their earlier drops was mildest
  max gain, own record         the ten whose own best tenth after their earlier drops was highest
  both, own record             the ten best placed on those two together (the two places added up)
against any ten (a random pick) and against keeping all 19. A stock's own record is its 6-month results after the
months in which it was 15%+ below its 12-month high, as far as they were known on the date; it needs MIN_RECORD
of them, and a stock without a record is only kept when fewer than ten of the 19 have one.

Added after the first run of those five, when the page was read again (it prints how far below its high a stock is
right beside the mark, and the market was fearful that day), and before looking at what they give:
  max gain, room to the high   the ten furthest below their 12-month high ("the most to win back")
  least loss, least fallen     the ten that fell least
  and, on the monthly sets, the same tables for the months in which the VIX closed at FEARFUL or more (the
  months pre-registered #3 is about).
The page's third "potential" number, the analysts' price targets, cannot be looked at: these sources keep no
history of them (the app's daily log started on 2026-11-21).

Each basket is counted twice: in equal amounts, and sized by equal risk (dollars in proportion to 1 / the tested
bad case of the stock's kind), which is how the user's pretend portfolio is sized.

Three sets of data, all of them looked at before for other questions:
  weekly    the DIP BUYs proper (dropped 15%+ and growing) of the six out-of-sample lists, bought 2022 to 2026
  monthly A stocks that dropped 15%+, 1994 to 2026: tuning, holdout, validation and mid caps (no "growing" check
            exists that far back)
  monthly B the same on the fresh, sixth and seventh lists

How the results are read, written down before the first run:
  "a bad half-year hurts less"  the ten's bad case (the result 1 basket in 10 did worse than) is at least
                                HURTS_LESS_POINTS milder than that of any ten on all three sets, and in the months
                                after which the market fell on both monthly sets.
  "earns more"                  the ten's typical result is at least EARNS_MORE_POINTS higher than that of any ten
                                on all three sets, AND the ten are ahead of any ten on DEPENDABLE_SHARE of the dates
                                or more on all three (the line this project already uses for a dependable order).
  A rule that does one and gives up the other is a trade, and is reported as one.
Nothing here can ship and nothing here says which stocks to buy: no list is unseen. An ordering that looks good
needs a pre-registered within-date test on the 202 names kept back (see the README's "Known limits").

    python explore_gain_loss.py      # needs numpy; reads the caches, writes nothing; about a minute
    python explore_gain_loss.py 15   # the same with 15 marked stocks to keep ten of (19 when left out)
"""
import bisect, json, os, random, statistics as st, sys
from collections import defaultdict
from datetime import date, timedelta

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import long_history as lh
import quality_rules as q
import benchmark
import backtest_several as several

bt = lh.bt

KEPT = 10
MARKED = int(sys.argv[1]) if len(sys.argv) > 1 else 19   # how many stocks are marked on the date
DRAWS = 200                    # draws of 19 on every date
MIN_RECORD = 24                # earlier drops with a known result before a stock's own record counts
BOOTSTRAPS = 1000
HURTS_LESS_POINTS = 2
EARNS_MORE_POINTS = 1
DEPENDABLE_SHARE = 0.60
FEARFUL = 25                   # the VIX at or above which a month counts as fearful (pre-registered #3)
CAP = 100                      # "capped": no stock counts for more than +100%, so a few huge winners cannot carry a basket

WEEKLY_LISTS = ('holdout', 'validation', 'midcap', 'fresh', 'sixth', 'seventh')
SEEN = ('tuning', 'holdout', 'validation', 'midcap')
TESTED = ('fresh', 'sixth', 'seventh')
FRESH = json.load(open(os.path.join(HERE, 'quoted_figures.json'), encoding='utf-8'))['fresh']   # the app's cases

ANY, ALL = 'any ten', f'all {MARKED}'
RULES = ('least loss, the app\'s way', 'max gain, the app\'s way',
         'least loss, own record', 'max gain, own record', 'both, own record',
         'max gain, room to the high', 'least loss, least fallen')
EQUAL, RISK = 'equal amounts', 'equal risk'


def bad_case(vol):
    """The tested bad case, in %, of the volatility kind the app would put this stock in."""
    kind = 'volatile' if vol >= FRESH['volatileFrom'] else 'calm' if vol < FRESH['calmBelow'] else 'middle'
    return FRESH['cases'][kind]['bad']


def week_of(day):
    """The Monday of the day's week: weekly prices are stamped on a Friday, or a day earlier in a holiday week."""
    d = date.fromisoformat(day)
    return (d - timedelta(days=d.weekday())).isoformat()


def month_before(day):
    """'2024-03-15' -> '2024-02': the last month whose closing price was known on that day."""
    y, m = int(day[:4]), int(day[5:7])
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


# ---- a stock's own record -----------------------------------------------------------------------------------------
def own_results(series):
    """Stock id -> (the months in which a result became known, the results), oldest first: 6 months after each drop."""
    out = {}
    for sid, bars in series.items():
        known, results = [], []
        for t in range(12, len(bars) - 6):
            if lh.drawdown(bars, t) >= lh.DIP_PERCENT:
                known.append(bars[t + 6][0])
                results.append((bars[t + 6][3] / bars[t][3] - 1) * 100)
        out[sid] = (known, results)
    return out


def record_as_of(results, cache, sid, last_known):
    """(own bad case, own good case) from the results known by that month, or None when there are too few."""
    key = (sid, last_known)
    if key not in cache:
        known, values = results.get(sid, ((), ()))
        n = bisect.bisect_right(known, last_known)
        if n < MIN_RECORD:
            cache[key] = None
        else:
            past = sorted(values[:n])
            cache[key] = (past[int(.10 * n)], past[min(n - 1, int(.90 * n))])
    return cache[key]


# ---- the candidates of every date -----------------------------------------------------------------------------------
def weekly_candidates():
    """Week -> the DIP BUYs of that week on the six lists: forward result, volatility, own record, the market."""
    series = dict(lh.load_monthly()['series'])
    series.update(several.load_tested()['series'])
    results, cache = own_results(series), {}
    rows = []
    for name in WEEKLY_LISTS:
        bt.CACHE = os.path.join(HERE, f'{name}_prices_cache.json')
        data = bt.load()
        earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()), os.path.join(HERE, f'{name}_earn_cache.json'),
                                            os.path.join(HERE, f'{name}_annual_cache.json'))
        for r in q.build_rows(data, earn, annual, step_weeks=1):
            if r['f'] and r['dip'] and q.dip_buy(r):
                rows.append(dict(sym=f"{name}:{r['sym']}", date=r['date'], f26=r['f26'], vol=r['vol'], below=r['dip_pct'],
                                 rec=record_as_of(results, cache, data['ids'][r['sym']], month_before(r['date']))))
    benchmark.add_excess(rows, benchmark.load(bt))
    by_date = defaultdict(list)
    for r in rows:
        if r['spy26'] is not None:
            by_date[week_of(r['date'])].append(dict(sym=r['sym'], f=r['f26'], vol=r['vol'], below=r['below'], rec=r['rec'],
                                                    market=r['spy26'], vix=None))
    return by_date


def monthly_candidates(data, universes):
    """Month -> the stocks 15%+ below their 12-month high in that month: the same, over 6 months."""
    results, cache = own_results(data['series']), {}
    by_date = defaultdict(list)
    for u in universes:
        ids = data['universes'][u]
        for r in lh.build_rows(data, u):
            sid = ids[r['sym'].split(':', 1)[1]]
            by_date[r['month']].append(dict(sym=r['sym'], f=r['f6'], vol=r['vol'], below=r['dip_pct'], market=r['mkt_f6'],
                                            vix=r['vix'], rec=record_as_of(results, cache, sid, r['month'])))
    return by_date


# ---- keeping ten of 19 ----------------------------------------------------------------------------------------------
def kept(rule, drawn):
    """The ten of the marked stocks a rule keeps. `drawn` comes in random order, so ties and fill-ins are random."""
    if rule == ANY:
        return drawn[:KEPT]
    if rule == RULES[0]:
        return sorted(drawn, key=lambda r: r['vol'])[:KEPT]
    if rule == RULES[1]:
        return sorted(drawn, key=lambda r: -r['vol'])[:KEPT]
    if rule == RULES[5]:
        return sorted(drawn, key=lambda r: -r['below'])[:KEPT]
    if rule == RULES[6]:
        return sorted(drawn, key=lambda r: r['below'])[:KEPT]
    known = [r for r in drawn if r['rec']]
    rest = [r for r in drawn if not r['rec']]
    if rule == RULES[2]:
        ordered = sorted(known, key=lambda r: -r['rec'][0])
    elif rule == RULES[3]:
        ordered = sorted(known, key=lambda r: -r['rec'][1])
    else:
        by_bad = {r['sym']: i for i, r in enumerate(sorted(known, key=lambda r: -r['rec'][0]))}
        by_good = {r['sym']: i for i, r in enumerate(sorted(known, key=lambda r: -r['rec'][1]))}
        ordered = sorted(known, key=lambda r: by_bad[r['sym']] + by_good[r['sym']])
    return (ordered + rest)[:KEPT]


def together(rows, sizing):
    if sizing == EQUAL:
        return st.fmean(r['f'] for r in rows)
    weights = [1 / bad_case(r['vol']) for r in rows]
    return sum(w * r['f'] for w, r in zip(weights, rows)) / sum(weights)


def run(by_date, seed):
    """Every date with 19+ candidates: DRAWS draws of 19, and what each way of keeping ten then did."""
    dates = sorted(d for d, rs in by_date.items() if len(rs) >= MARKED)
    rng = random.Random(seed)
    names = (ANY, ALL) + RULES
    out = {(name, sizing): np.empty((len(dates), DRAWS)) for name in names for sizing in (EQUAL, RISK)}
    capped = {name: np.empty((len(dates), DRAWS)) for name in names}
    volatility = {name: [] for name in names}
    with_record = []
    for i, d in enumerate(dates):
        for j in range(DRAWS):
            drawn = rng.sample(by_date[d], MARKED)
            with_record.append(sum(1 for r in drawn if r['rec']))
            for name in names:
                rows = drawn if name == ALL else kept(name, drawn)
                for sizing in (EQUAL, RISK):
                    out[(name, sizing)][i, j] = together(rows, sizing)
                capped[name][i, j] = st.fmean(min(r['f'], CAP) for r in rows)
                if j == 0:
                    volatility[name].append(st.median(r['vol'] for r in rows))
    market = np.array([by_date[d][0]['market'] for d in dates])
    fearful = np.array([by_date[d][0]['vix'] is not None and by_date[d][0]['vix'] >= FEARFUL for d in dates])
    return dict(dates=dates, out=out, capped=capped, market=market, fearful=fearful, with_record=st.fmean(with_record),
                volatility={name: st.median(v) for name, v in volatility.items()},
                sizes=[len(by_date[d]) for d in dates], stocks=len({r['sym'] for d in dates for r in by_date[d]}))


# ---- reading the results ----------------------------------------------------------------------------------------------
def three(values):
    """(bad case, typical, good case): the results 1 basket in 10 did worse than, half did, and 9 in 10 did."""
    return np.percentile(values, [10, 50, 90])


def table(study, sizing, rows=None, label='all dates'):
    out, market = study['out'], study['market']
    pick = slice(None) if rows is None else rows
    print(f"-- {label}, {sizing} ({len(market[pick])} dates)")
    for name in (ANY, ALL) + RULES:
        v = out[(name, sizing)][pick].ravel()
        bad, typical, good = three(v)
        extra = f"  capped average {study['capped'][name][pick].mean():+6.1f}%" if sizing == EQUAL else ''
        print(f"   {name:27} typical {typical:+6.1f}%  bad case {bad:+6.1f}%  good case {good:+6.1f}%  average {v.mean():+6.1f}%  "
              f"up {np.mean(v > 0):4.0%}  lost 20%+ {np.mean(v <= -20):4.0%}{extra}")
    mk = market[pick]
    bad, typical, good = three(mk)
    print(f"   {'the market (S&P 500)':27} typical {typical:+6.1f}%  bad case {bad:+6.1f}%  good case {good:+6.1f}%  average {mk.mean():+6.1f}%  "
          f"up {np.mean(mk > 0):4.0%}")


def against_any(study, sizing, block_of, seed=7):
    """Each rule's ten against any ten: the gaps, how steady they are when whole blocks of dates are resampled, and
    on what share of the dates the rule's ten were ahead."""
    out, dates = study['out'], study['dates']
    blocks = defaultdict(list)
    for i, d in enumerate(dates):
        blocks[block_of(d)].append(i)
    blocks = [np.array(v) for _, v in sorted(blocks.items())]
    rng = np.random.default_rng(seed)
    samples = {name: [] for name in RULES}
    for _ in range(BOOTSTRAPS):
        idx = np.concatenate([blocks[b] for b in rng.integers(0, len(blocks), len(blocks))])
        base = three(out[(ANY, sizing)][idx].ravel())
        for name in RULES:
            samples[name].append(three(out[(name, sizing)][idx].ravel()) - base)
    base_all = three(out[(ANY, sizing)].ravel())
    base_by_date = out[(ANY, sizing)].mean(axis=1)
    found = {}
    print(f"-- against any ten, {sizing} ({len(blocks)} blocks of dates resampled {BOOTSTRAPS} times; "
          f"in brackets the range 90% of the resamples fell in)")
    for name in RULES:
        gap = three(out[(name, sizing)].ravel()) - base_all
        s = np.array(samples[name])
        lo, hi = np.percentile(s, 5, axis=0), np.percentile(s, 95, axis=0)
        by_date = out[(name, sizing)].mean(axis=1)
        ahead = float(np.mean(by_date > base_by_date))
        found[name] = dict(bad=gap[0], typical=gap[1], good=gap[2], ahead=ahead)
        print(f"   {name:27} bad case {gap[0]:+5.1f} ({lo[0]:+5.1f} to {hi[0]:+5.1f})  typical {gap[1]:+5.1f} ({lo[1]:+5.1f} to {hi[1]:+5.1f})  "
              f"good case {gap[2]:+5.1f} ({lo[2]:+5.1f} to {hi[2]:+5.1f})  ahead on {ahead:4.0%} of dates, "
              f"typically by {np.median(by_date - base_by_date):+5.1f}")
    return found


def gaps(study, sizing, rows):
    out = study['out']
    base = three(out[(ANY, sizing)][rows].ravel())
    return {name: dict(zip(('bad', 'typical', 'good'), three(out[(name, sizing)][rows].ravel()) - base)) for name in RULES}


def report(title, study, block_of, halves=()):
    sizes = study['sizes']
    print(f"\n{'=' * 118}\n{title}\n{'=' * 118}")
    print(f"{study['stocks']} stocks; {len(study['dates'])} dates with {MARKED}+ candidates, {study['dates'][0]} to {study['dates'][-1]} "
          f"(typically {st.median(sizes):.0f} candidates, from {min(sizes)} to {max(sizes)}); of the {MARKED} drawn, "
          f"{study['with_record']:.1f} had a record of their own on average")
    print("typical volatility of what is kept: " + ', '.join(f"{name} {study['volatility'][name]:.0f}%" for name in (ANY,) + RULES))
    found = {}
    for sizing in (EQUAL, RISK):
        print()
        table(study, sizing)
        found[sizing] = against_any(study, sizing, block_of)
    falling = np.flatnonzero(study['market'] < 0)
    rising = np.flatnonzero(study['market'] >= 0)
    print()
    table(study, EQUAL, falling, 'dates after which the market fell')
    table(study, RISK, falling, 'dates after which the market fell')
    table(study, EQUAL, rising, 'dates after which the market rose')
    fearful = np.flatnonzero(study['fearful'])
    if len(fearful):
        table(study, EQUAL, fearful, f'dates on which the VIX was {FEARFUL} or more')
        table(study, RISK, fearful, f'dates on which the VIX was {FEARFUL} or more')
    for a, b in halves:
        rows = np.array([i for i, d in enumerate(study['dates']) if a <= d[:4] <= b])
        if len(rows):
            table(study, EQUAL, rows, f'{a} to {b}')
    return dict(all=found, falling={sizing: gaps(study, sizing, falling) for sizing in (EQUAL, RISK)}, falling_dates=len(falling))


if __name__ == '__main__':
    year = lambda d: d[:4]
    half_year = lambda d: (d[:4], (int(d[5:7]) - 1) // 6)
    halves = (('1994', '2009'), ('2010', '2026'))

    studies = [
        ('WEEKLY: the DIP BUYs of the six out-of-sample lists, held 26 weeks',
         run(weekly_candidates(), 11), half_year, ()),
        ('MONTHLY A: stocks that dropped 15%+, tuning + holdout + validation + mid caps, held 6 months',
         run(monthly_candidates(lh.load_monthly(), SEEN), 12), year, halves),
        ('MONTHLY B: stocks that dropped 15%+, fresh + sixth + seventh, held 6 months',
         run(monthly_candidates(several.load_tested(), TESTED), 13), year, halves),
    ]
    found = [report(title, study, block_of, hv) for title, study, block_of, hv in studies]

    print(f"\n{'=' * 118}\nREAD AS WRITTEN DOWN BEFOREHAND (weekly / monthly A / monthly B; gaps against any ten, in points)\n{'=' * 118}")
    for sizing in (EQUAL, RISK):
        print(f"-- {sizing}")
        for name in RULES:
            every = [f['all'][sizing][name] for f in found]
            fell = [f['falling'][sizing][name] for f in found[1:]]
            hurts_less = all(e['bad'] >= HURTS_LESS_POINTS for e in every) and all(x['bad'] >= HURTS_LESS_POINTS for x in fell)
            earns_more = all(e['typical'] >= EARNS_MORE_POINTS and e['ahead'] >= DEPENDABLE_SHARE for e in every)
            print(f"   {name:27} bad case {' / '.join(f'{e['bad']:+5.1f}' for e in every)}; when the market fell (monthly) "
                  f"{' / '.join(f'{x['bad']:+5.1f}' for x in fell)}  ->  a bad half-year hurts less: {'YES' if hurts_less else 'no'}")
            print(f"   {'':27} typical  {' / '.join(f'{e['typical']:+5.1f}' for e in every)}; ahead on "
                  f"{' / '.join(f'{e['ahead']:4.0%}' for e in every)} of dates  ->  earns more: {'YES' if earns_more else 'no'}")
