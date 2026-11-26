import os, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('b2', os.path.join(HERE, 'backtest2.py'))
src = open(os.path.join(HERE, 'backtest2.py'), encoding='utf-8').read().split("rows = run_t(data)")[0]
ns = {"__file__": os.path.join(HERE, "backtest2.py")}; exec(src, ns)
rows = ns['run_t'](ns['data']); bt = ns['bt']
dips = [r for r in rows if r['dip']]
print('FINAL RULE: dip >= 15% below 52w high; DIP BUY if price >= 200d MA, else WAIT')
bt.summarize('Baseline (all observations)', rows)
bt.summarize('Buy every dip', dips)
bt.summarize('DIP BUY (price >= 200d MA)', [r for r in dips if r['above']])
bt.summarize('WAIT (price < 200d MA)', [r for r in dips if not r['above']])
dates = sorted(set(r['date'] for r in rows)); mid = dates[len(dates)//2]
for lbl, part in (('first half', [r for r in dips if r['date'] < mid]), ('second half', [r for r in dips if r['date'] >= mid])):
    bt.summarize(f'  {lbl}: DIP BUY', [r for r in part if r['above']])
    bt.summarize(f'  {lbl}: WAIT', [r for r in part if not r['above']])
