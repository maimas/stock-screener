"""
Market sentiment (VIX fear index) and geopolitical risk (GPR index) vs dip outcomes, monthly 1994-2026.

EXPLORATION (tuning universe only, see explore output in README):
  * GPR (level or spike vs its 12-month average): no consistent ordering. Rejected, not tested further.
  * VIX: dips bought when VIX >= 25 beat dips bought when VIX < 20 in every decade on the tuning stocks
    (mean 6m +34.8 vs +16.6 in the 1990s, +13.6 vs +4.9 in the 2000s, +19.3 vs +10.1 in the 2010s,
    +13.8 vs +11.2 in the 2020s), with a similar rate of further 20%+ drops. The 25 cut-off was picked after
    seeing the buckets (20-25 was the weakest), which is why it needs this test.

---------------------------------------------------------------------------------------------------------------
PRE-REGISTERED #3 (written 2026-11-05, after exploring the tuning universe only; the holdout, validation and
mid-cap universes have NOT been looked at for VIX or GPR):
  Candidate V = "dip bought while the VIX closed the month >= 25" vs dips bought while VIX < 25.
  Data: pooled holdout + validation + mid-cap stocks (408 + extras), monthly dips 1994-2026.
  Ship V as a context note in the app ONLY if ALL hold:
    1. V beats non-V in mean 6-month return with P(gap <= 0) < 10% under a YEAR-cluster bootstrap
       (VIX is market-wide, so calendar years, not stocks, are the independent units).
    2. V's median 6-month return is also higher.
    3. V's rate of a further 20%+ drop within 3 months is not more than 3 points higher.
    4. V beats non-V in mean in both halves, 1994-2009 and 2010-2026.
  Known limit: the same market episodes appear in every universe, so new stocks are not fully independent
  evidence for a market-wide signal; the year bootstrap is the honest measure of how few episodes there are.
---------------------------------------------------------------------------------------------------------------
"""
import random, statistics as st
from collections import defaultdict
import long_history as lh

VIX_HIGH = 25
data = lh.load_monthly()
rows = [r for u in ('holdout', 'validation', 'midcap') for r in lh.build_rows(data, u) if r['vix']]
V = lambda r: r['vix'] >= VIX_HIGH


def stats(xs):
    return (len(xs), st.mean(r['f6'] for r in xs), st.median(r['f6'] for r in xs),
            sum(r['f6'] > 0 for r in xs) / len(xs), sum(r['dd3'] <= -20 for r in xs) / len(xs))


def show(name, xs):
    n, mean, med, up, fell = stats(xs)
    print(f"{name:34} n={n:6} mean {mean:+6.1f}%  median {med:+6.1f}%  up {up:4.0%}  fell 20%+ {fell:4.0%}")


print(f"{len({r['sym'] for r in rows})} stocks, {len(rows)} dips, {min(r['month'] for r in rows)} to {max(r['month'] for r in rows)}\n")
show('Every dip', rows)
show(f'V: VIX >= {VIX_HIGH}', [r for r in rows if V(r)])
show(f'   VIX < {VIX_HIGH}', [r for r in rows if not V(r)])
for a, b in [('1994', '2009'), ('2010', '2026')]:
    xs = [r for r in rows if a <= r['year'] <= b]
    show(f' {a}-{b} V', [r for r in xs if V(r)]); show(f' {a}-{b} not V', [r for r in xs if not V(r)])


def gap(sample):
    v = [x for g in sample for x in g if V(x)]; o = [x for g in sample for x in g if not V(x)]
    return st.mean(r['f6'] for r in v) - st.mean(r['f6'] for r in o) if v and o else None


rng = random.Random(42)
for unit in ('year', 'sym'):
    groups = defaultdict(list)
    for r in rows:
        groups[r[unit]].append(r)
    keys = sorted(groups)
    diffs = sorted(d for d in (gap([groups[rng.choice(keys)] for _ in keys]) for _ in range(2000)) if d is not None)
    print(f"\n{unit:4}-cluster bootstrap ({len(keys)} clusters): V - not V = {st.mean(diffs):+.1f} pts, "
          f"90% CI [{diffs[int(.05 * len(diffs))]:+.1f}, {diffs[int(.95 * len(diffs))]:+.1f}], P(gap <= 0) = {sum(d <= 0 for d in diffs) / len(diffs):.1%}")


# ---------------------------------------------------------------------------------------------------------------
# Added 2026-11-21. The figures above that the app quotes, recorded for it (see quoted.py): they reach its texts
# through `npm run evidence`, never by hand.
# ---------------------------------------------------------------------------------------------------------------
import quoted


def part(xs):
    n, mean, med, up, fell = stats(xs)
    return dict(n=n, mean=mean, median=med, up=up, fell20=fell)


def fear_episodes(vix, first, last, gap_months=3):
    """Stretches of months with the VIX at or above VIX_HIGH; stretches less than `gap_months` apart count as one."""
    months = sorted(m for m in vix if first <= m <= last)
    count, last_high = 0, None
    for i, m in enumerate(months):
        if vix[m] >= VIX_HIGH:
            if last_high is None or i - last_high > gap_months:
                count += 1
            last_high = i
    return count


vix_by_month, _ = lh.load_sentiment(data)
quoted.put('sentiment', dict(
    stocks=len({r['sym'] for r in rows}), fromYear=int(min(r['year'] for r in rows)), toYear=int(max(r['year'] for r in rows)),
    vixHigh=VIX_HIGH, high=part([r for r in rows if V(r)]), low=part([r for r in rows if not V(r)]),
    episodes=fear_episodes(vix_by_month, min(r['month'] for r in rows), max(r['month'] for r in rows)),
))
