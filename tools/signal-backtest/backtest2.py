import json, os, statistics, sys, bisect
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py')); bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
data = bt.load()

# --- add time info to rows by re-running with index
def run_t(data, **kw):
    rows = []
    for sym, sid in data['ids'].items():
        ser = data['charts'].get(sid); fs = data['shares'].get(sid)
        if not ser or not fs: continue
        ts = ser['timeStamps']
        bars = [(t, h, l, c, v) for t, h, l, c, v in zip(ts, ser['pricesHigh'], ser['pricesLow'], ser['prices'], ser['volumes']) if None not in (h, l, c, v) and v > 0 and h >= l]
        closes = [b[3] for b in bars]
        for t in range(56, len(bars) - 26, 4):
            c = closes[t]; hi52 = max(b[1] for b in bars[t-51:t+1]); dip = (hi52 - c) / hi52 * 100
            ma = sum(closes[t-39:t+1]) / 40; ma_prev = sum(closes[t-43:t-3]) / 40; vs = (c / ma - 1) * 100
            pr = bt.profit_ratio([b[1:] for b in bars[t-51:t+1]], fs, c)
            rows.append(dict(sym=sym, date=bars[t][0][:10], dip=dip >= 15, above=c >= ma, rising=ma >= ma_prev, vs=vs,
                intact=c >= ma or (vs >= -5 and ma >= ma_prev), pr=pr,
                f13=(closes[t+13]/c-1)*100, f26=(closes[t+26]/c-1)*100, dd13=(min(b[2] for b in bars[t+1:t+14])/c-1)*100))
    return rows

rows = run_t(data); dips = [r for r in rows if r['dip']]
dates = sorted(set(r['date'] for r in rows)); mid = dates[len(dates)//2]
print('evaluation dates', dates[0], '→', dates[-1], 'split at', mid)
for label, part in (('first half', [r for r in dips if r['date'] < mid]), ('second half', [r for r in dips if r['date'] >= mid])):
    print(f'\n-- {label} --')
    bt.summarize('all dips', part)
    bt.summarize('DIP BUY (trend intact)', [r for r in part if r['intact']])
    bt.summarize('WAIT (trend broken)', [r for r in part if not r['intact']])

print('\n-- holders in profit, among dips (regardless of trend) --')
for lo, hi in ((0, 10), (10, 30), (30, 60), (60, 101)):
    bt.summarize(f'holders {lo}-{hi}%', [r for r in dips if r['pr'] is not None and lo <= r['pr'] < hi])

print('\n-- trend rule variants, among dips --')
bt.summarize('price >= 200d MA', [r for r in dips if r['above']])
bt.summarize('price < 200d MA, MA rising', [r for r in dips if not r['above'] and r['rising']])
bt.summarize('price < 200d MA, MA falling', [r for r in dips if not r['above'] and not r['rising']])
bt.summarize('within 5% below MA, rising (band)', [r for r in dips if not r['above'] and r['rising'] and r['vs'] >= -5])

# per-stock concentration check: how many distinct symbols in DIP BUY group
go = [r for r in dips if r['intact']]
from collections import Counter
cnt = Counter(r['sym'] for r in go)
print('\nDIP BUY events by symbol: distinct', len(cnt), 'top', cnt.most_common(8))
# Excluding top-5 most frequent symbols
top = {s for s, _ in cnt.most_common(5)}
bt.summarize('DIP BUY excl. 5 most frequent symbols', [r for r in go if r['sym'] not in top])
bt.summarize('WAIT excl. those symbols', [r for r in dips if not r['intact'] and r['sym'] not in top])
