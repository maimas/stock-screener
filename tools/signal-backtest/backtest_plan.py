"""
The plan as a whole, replayed step by step (descriptive; added 2026-11-22).

The app's "Your plan today" card turns the tested pieces into steps: buy a DIP BUY, sized to a loss budget, hold it
for 26 weeks without a stop-loss, then look again. Each piece has its own pre-registered test:

  what to buy        dip of 15%+ in a growing company                      backtest_validation.py (PASS), later weaker
  how much           the loss budget divided by the tested bad case        backtest_validation3.py (H2 PASS; descriptive sizes)
  no stop-loss       a 20% stop lowered the average result                 backtest_validation3.py (H3 PASS)
  26 weeks           the holding period every test measured

Run by itself this script adds no rule and tests no hypothesis, so nothing here can change the verdict or ship a new
marker. It replays those exact steps on the out-of-sample lists and reports how the monthly batches did, so the
card can say how often the plan as a whole made money and how often it beat the S&P 500, instead of quoting one
average. (backtest_validation5.py uses the same replay, on one list never used before, for its pre-registered
question G3: do several positions beat one?)

How the replay works:
  * A stock is bought in the first week in which it is a DIP BUY and is not already held, and is held for
    26 weeks. If it is a DIP BUY again after that, it is bought again. (The pooled tables count every evaluation
    date, so a stock in a long dip appears there many times over; here it is one position at a time.)
  * Positions are sized as the app sizes them: the same loss budget for each, divided by the bad case of its
    volatility group (so a volatile stock gets a smaller position than a calm one).
  * A batch is everything bought in one calendar month. Batches of fewer than MIN_TRADES positions are left out.
  * Baskets: for each batch, random picks of 1, 5 and 10 of its positions, to show how much one person's result
    depends on how many DIP BUYs they hold.

Limits, as for every table here: today's survivors, one market period (a rising one), and the batches overlap in
time (a batch's 26 weeks cover the five batches after it), so "N of M batches" is not M independent trials.

    python backtest_plan.py   # needs the caches of the out-of-sample lists (run the universe scripts first)
"""
import importlib.util, os, random, statistics, sys
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
sys.path.insert(0, HERE)
import quality_rules as q
import benchmark
import quoted

HOLD_WEEKS = 26
MIN_TRADES = 5
BASKETS = (1, 5, 10)
PICKS_PER_BATCH = 400
# Every out-of-sample list, whichever way it points.
LISTS = ('holdout', 'validation', 'midcap', 'fresh', 'sixth', 'seventh')

pct = lambda v, p: sorted(v)[min(len(v) - 1, int(p * len(v)))]


def group(r):
    return 'volatile' if r['vol'] >= q.VOL_HIGH else 'calm' if r['vol'] < q.VOL_LOW else 'middle'


def dip_buys(names):
    """Every week in which a stock of these lists was a DIP BUY, with the S&P 500 over the same 26 weeks."""
    rows = []
    for name in names:
        cache = os.path.join(HERE, f'{name}_prices_cache.json')
        if not os.path.exists(cache):
            sys.exit(f"(no data for the {name} list: run its universe script first)")
        bt.CACHE = cache
        data = bt.load()
        earn, annual = q.fetch_fundamentals(bt, list(data['ids'].values()),
                                            os.path.join(HERE, f'{name}_earn_cache.json'), os.path.join(HERE, f'{name}_annual_cache.json'))
        # Every week, not every fourth as in the pooled tables: a position is opened the first week the stock is a DIP BUY.
        # (With a four-week grid the result depended on which weeks happened to be on the grid.)
        rows += [dict(r, sym=f"{name}:{r['sym']}", universe=name) for r in q.build_rows(data, earn, annual, step_weeks=1)
                 if r['f'] and r['dip'] and q.dip_buy(r)]
    benchmark.add_excess(rows, benchmark.load(bt))
    return rows


def bad_cases(rows):
    """The bad case of each volatility group, exactly as the app's sizing takes it: the fresh list's worst tenth."""
    return {g: -pct([r['f26'] for r in rows if r['universe'] == 'fresh' and group(r) == g], .10) for g in ('volatile', 'middle', 'calm')}


def replay(rows, bad, seed=42):
    """
    The plan on these DIP BUY weeks: one position at a time per stock, sized by the bad case of its group, grouped by
    the month of purchase, with random baskets of 1, 5 and 10 positions out of each month's batch.
    """
    size = lambda r: 1 / bad[group(r)]     # dollars per unit of loss budget

    def result(ts, key):
        """What a set of positions returned on the money put into them, sized by the loss budget."""
        weights = [size(t) for t in ts]
        return sum(w * t[key] for w, t in zip(weights, ts)) / sum(weights)

    by_stock = defaultdict(list)
    for r in sorted(rows, key=lambda r: r['date']):
        by_stock[r['sym']].append(r)
    trades = []
    for rs in by_stock.values():
        free_from = ''
        for r in rs:
            if r['date'] >= free_from and r['spy26'] is not None:
                trades.append(r)
                free_from = (date.fromisoformat(r['date']) + timedelta(weeks=HOLD_WEEKS)).isoformat()

    batches = defaultdict(list)
    for t in trades:
        batches[t['date'][:7]].append(t)
    kept = {m: ts for m, ts in sorted(batches.items()) if len(ts) >= MIN_TRADES}
    counted = [t for ts in kept.values() for t in ts]
    months = [dict(month=m, n=len(ts), plan=result(ts, 'f26'), spy=result(ts, 'spy26')) for m, ts in kept.items()]

    rng = random.Random(seed)
    baskets = {}
    for k in BASKETS:
        ups, beats = [], []
        for ts in kept.values():
            if len(ts) < k:
                continue
            picks = [rng.sample(ts, k) for _ in range(PICKS_PER_BATCH)]
            ups.append(sum(result(p, 'f26') > 0 for p in picks) / len(picks))
            beats.append(sum(result(p, 'f26') > result(p, 'spy26') for p in picks) / len(picks))
        baskets[str(k)] = dict(up=statistics.mean(ups) if ups else None, beat=statistics.mean(beats) if beats else None, months=len(ups))
    return dict(stocks=len(by_stock), trades=trades, left_out=len(batches) - len(kept), months=months, counted=counted, baskets=baskets,
                together=result(counted, 'f26') if counted else None, spy_together=result(counted, 'spy26') if counted else None)


if __name__ == '__main__':
    rows = dip_buys(LISTS)
    bad = bad_cases(rows)
    r = replay(rows, bad)
    months, counted, baskets = r['months'], r['counted'], r['baskets']

    print(f"{len(rows)} DIP BUY evaluation dates -> {len(r['trades'])} positions held one at a time per stock, from {r['stocks']} stocks")
    print(f"sized by loss budget / bad case: volatile {bad['volatile']:.1f}%, in between {bad['middle']:.1f}%, calm {bad['calm']:.1f}%")
    print(f"\n{'bought in':10} {'positions':>9} {'plan 26w':>9} {'S&P 26w':>9} {'beat it':>8}")
    for m in months:
        print(f"{m['month']:10} {m['n']:9} {m['plan']:+8.1f}% {m['spy']:+8.1f}% {'yes' if m['plan'] > m['spy'] else 'no':>8}")
    if r['left_out']:
        print(f"({r['left_out']} month{'s' if r['left_out'] != 1 else ''} with fewer than {MIN_TRADES} positions left out)")

    plans, index = [m['plan'] for m in months], [m['spy'] for m in months]
    up, beat = sum(p > 0 for p in plans), sum(m['plan'] > m['spy'] for m in months)
    print(f"\n{len(months)} monthly batches, {len(counted)} positions: {up} were up after 26 weeks, {beat} beat the S&P 500; "
          f"worst {min(plans):+.1f}%, median {statistics.median(plans):+.1f}%, best {max(plans):+.1f}%; "
          f"all positions together {r['together']:+.1f}% vs S&P {r['spy_together']:+.1f}%")
    print(f"the S&P 500 over the same weeks: {sum(x > 0 for x in index)} of {len(index)} up; "
          f"worst {min(index):+.1f}%, median {statistics.median(index):+.1f}%, best {max(index):+.1f}%")

    print("\n== How much one person's result depends on how many DIP BUYs they hold ==")
    for k in BASKETS:
        b = baskets[str(k)]
        print(f"{k:2} position{'s' if k != 1 else ' '} from one month's batch: up after 26 weeks {b['up']:.0%} of the time, "
              f"beat the S&P 500 {b['beat']:.0%} ({b['months']} batches)")

    # The figures above that the app quotes, recorded for it (see quoted.py).
    quoted.put('plan', dict(
        holdWeeks=HOLD_WEEKS, minTrades=MIN_TRADES, positions=len(counted), stocks=len({t['sym'] for t in counted}),
        firstMonth=months[0]['month'], lastMonth=months[-1]['month'],
        months=len(months), monthsUp=up, monthsBeat=beat,
        worst=min(plans), median=statistics.median(plans), best=max(plans), together=r['together'],
        sp500=dict(monthsUp=sum(x > 0 for x in index), worst=min(index), median=statistics.median(index), best=max(index),
                   together=r['spy_together']),
        baskets=baskets,
    ))
