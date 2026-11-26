"""Does missing EPS estimates predict worse forward returns (post-earnings drift)?"""
import json, os, statistics, urllib.request, bisect
HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py')); bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
data = bt.load()
EC = os.path.join(HERE, 'earn_hist_cache.json')
if os.path.exists(EC):
    earn = json.load(open(EC, encoding='utf-8'))
else:
    earn = []
    ids = list(data['ids'].values())
    for i in range(0, len(ids), 15):
        earn += [e for e in bt.flat(bt.get(f"https://assets.msn.com/service/Finance/Events/Earnings?{bt.Q}&ids={','.join(ids[i:i+15])}")) if isinstance(e, dict)]
    json.dump(earn, open(EC, 'w', encoding='utf-8'))
print('earnings records', len(earn))
events = []
for e in earn:
    ser = data['charts'].get(e.get('InstrumentId'))
    if not ser: continue
    ts = [t[:10] for t in ser['timeStamps']]; closes = ser['prices']
    for period, q in ((e.get('History') or {}).get('quarterly') or {}).items():
        d = (q.get('EarningReleaseDate') or '')[:10]; s = q.get('EpsSurprisePercent')
        if not d or s is None: continue
        i = bisect.bisect_right(ts, d)  # first weekly bar after the release
        if i + 26 >= len(ts) or i < 1 or closes[i] is None or closes[i - 1] is None: continue
        if closes[i + 13] is None or closes[i + 26] is None: continue
        events.append(dict(sym=e.get('Symbol'), date=d, surprise=s, react=(closes[i] / closes[i-1] - 1) * 100,
                           f13=(closes[i+13] / closes[i] - 1) * 100, f26=(closes[i+26] / closes[i] - 1) * 100))
print('events with forward data', len(events), 'from', min(x['date'] for x in events), 'to', max(x['date'] for x in events))
def show(name, xs):
    if not xs: print(f'{name:34} n=0'); return
    print(f"{name:34} n={len(xs):4}  reaction wk {statistics.mean(x['react'] for x in xs):+5.1f}%  "
          f"13w after mean {statistics.mean(x['f13'] for x in xs):+5.1f}% med {statistics.median(x['f13'] for x in xs):+5.1f}%  "
          f"26w after mean {statistics.mean(x['f26'] for x in xs):+5.1f}% med {statistics.median(x['f26'] for x in xs):+5.1f}%  "
          f"win13 {sum(x['f13']>0 for x in xs)/len(xs)*100:3.0f}%")
show('all reports', events)
show('missed (surprise <= -2%)', [x for x in events if x['surprise'] <= -2])
show('small miss/inline (-2%..+2%)', [x for x in events if -2 < x['surprise'] < 2])
show('beat (>= +2%)', [x for x in events if x['surprise'] >= 2])
show('big beat (>= +10%)', [x for x in events if x['surprise'] >= 10])
show('big miss (<= -10%)', [x for x in events if x['surprise'] <= -10])
