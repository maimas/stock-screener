"""
EXPLORATION ONLY (tuning universe, 1994-2026 monthly): does a market-wide sell-off change how a dip works out?
Result 2026-11-01: no usable signal. Dips while the S&P was 10-20% down did worst (+3.1% / 6m, 22% fell 20%+),
dips while it was 20%+ down did best (+17.6%), and dips with the market near its high were in between (+11.3%).
The pattern is not monotonic and rests on ~7 crisis years, so it describes a few episodes (2000-02, 2008, 2020,
2022) rather than a repeatable rule. Return vs the S&P (excess) was similar in every bucket (+5 to +8.5 pts).
Not pre-registered or shipped; holdout/validation/midcap were not examined for this question.
"""
import statistics as st
import long_history as lh

rows = lh.build_rows(lh.load_monthly(), 'tuning')


def show(name, xs):
    print(f"{name:22} n={len(xs):5} years={len({r['year'] for r in xs}):2} mean {st.mean(r['f6'] for r in xs):+6.1f}% "
          f"median {st.median(r['f6'] for r in xs):+6.1f}% up {sum(r['f6'] > 0 for r in xs) / len(xs):4.0%} "
          f"fell 20%+ {sum(r['dd3'] <= -20 for r in xs) / len(xs):4.0%} vs S&P {st.mean(r['f6'] - r['mkt_f6'] for r in xs):+5.1f}")


show('every dip', rows)
for lo, hi in [(0, 5), (5, 10), (10, 20), (20, 99)]:
    show(f'S&P down {lo}-{hi}%', [r for r in rows if lo <= r['mkt_dd'] < hi])
