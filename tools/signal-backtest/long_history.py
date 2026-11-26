"""
Long monthly price history (MSN Charts type=All, split-adjusted, back to 1986) for every universe, plus SPY.
Used to test hypotheses that need many market regimes (2000-02, 2008, 2018, 2020, 2022), which the weekly
2021-2026 data cannot cover. Price-only: no point-in-time fundamentals exist this far back in our sources.

Caveat: every universe is today's survivors, so absolute dip returns over decades are flattered. Comparisons
between groups of dips are less affected, and the bias favours stock-specific dips (failed companies had
stock-specific dips and then vanished from the lists).
"""
import importlib.util, json, os, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bt', os.path.join(HERE, 'backtest.py'))
bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)

UNIVERSES = {'tuning': 'backtest_cache.json', 'holdout': 'holdout_prices_cache.json',
             'validation': 'validation_prices_cache.json', 'midcap': 'midcap_prices_cache.json'}
SPY_ID = 'a23hqh'
VIX_ID = 'a33pk2'   # CBOE Volatility Index ("fear index"), monthly since 1990
GPR_CACHE = os.path.join(HERE, 'gpr_cache.json')   # Caldara & Iacoviello Geopolitical Risk index, monthly since 1985
# (source: matteoiacoviello.com/gpr.htm, data_gpr_export.xls, column GPR; 100 = 1985-2019 average)
CACHE = os.path.join(HERE, 'monthly_cache.json')
DIP_PERCENT = 15


def load_monthly():
    if os.path.exists(CACHE):
        return json.load(open(CACHE, encoding='utf-8'))
    out = {'universes': {}, 'series': {}}
    for name, f in UNIVERSES.items():
        out['universes'][name] = json.load(open(os.path.join(HERE, f), encoding='utf-8'))['ids']
    ids = sorted({sid for u in out['universes'].values() for sid in u.values()} | {SPY_ID})
    for i in range(0, len(ids), 15):
        for c in bt.flat(bt.get(f"https://assets.msn.com/service/Finance/Charts?{bt.Q}&ids={','.join(ids[i:i+15])}&type=All")):
            if isinstance(c, dict) and c.get('series'):
                s = c['series']
                out['series'][c['instrumentId']] = [(t[:7], h, l, p) for t, h, l, p in
                                                    zip(s['timeStamps'], s['pricesHigh'], s['pricesLow'], s['prices'])
                                                    if None not in (h, l, p) and p > 0]
    json.dump(out, open(CACHE, 'w', encoding='utf-8'))
    return out


def load_sentiment(data):
    """Month -> VIX month-end close, and month -> GPR. Adds VIX to the monthly cache on first use."""
    if VIX_ID not in data['series']:
        c = bt.flat(bt.get(f"https://assets.msn.com/service/Finance/Charts?{bt.Q}&ids={VIX_ID}&type=All"))[0]['series']
        data['series'][VIX_ID] = [(t[:7], h, l, p) for t, h, l, p in
                                  zip(c['timeStamps'], c['pricesHigh'], c['pricesLow'], c['prices']) if p]
        json.dump(data, open(CACHE, 'w', encoding='utf-8'))
    vix = {b[0]: b[3] for b in data['series'][VIX_ID]}
    gpr = json.load(open(GPR_CACHE, encoding='utf-8'))
    return vix, gpr


def drawdown(bars, t):
    hi = max(b[1] for b in bars[max(0, t - 11):t + 1])
    return (hi - bars[t][3]) / hi * 100


def avg12(series, months, month):
    """Average of the 12 months before `month` (not including it), or None."""
    if month not in series:
        return None
    i = months.index(month)
    prev = [series[m] for m in months[max(0, i - 12):i]]
    return sum(prev) / len(prev) if len(prev) == 12 else None


def build_rows(data, universe):
    """One row per stock-month among dips (>= 15% below the trailing 12-month high), with market context."""
    spy = data['series'][SPY_ID]
    spy_at = {b[0]: i for i, b in enumerate(spy)}
    vix, gpr = load_sentiment(data)
    months = sorted(vix)
    rows = []
    for sym, sid in data['universes'][universe].items():
        bars = data['series'].get(sid) or []
        for t in range(12, len(bars) - 6):
            month, c = bars[t][0], bars[t][3]
            dd = drawdown(bars, t)
            j = spy_at.get(month)
            if dd < DIP_PERCENT or j is None or j < 12 or j + 6 >= len(spy):
                continue
            rets = [bars[i][3] / bars[i - 1][3] - 1 for i in range(t - 11, t + 1)]
            rows.append(dict(sym=f'{universe}:{sym}', month=month, year=month[:4], dip_pct=dd,
                             mkt_dd=drawdown(spy, j), vix=vix.get(month), gpr=gpr.get(month),
                             vix_avg=avg12(vix, months, month), gpr_avg=avg12(gpr, sorted(gpr), month), mkt_f6=(spy[j + 6][3] / spy[j][3] - 1) * 100,
                             vol=statistics.pstdev(rets) * 12 ** 0.5 * 100,
                             f6=(bars[t + 6][3] / c - 1) * 100,
                             dd3=(min(b[2] for b in bars[t + 1:t + 4]) / c - 1) * 100))
    return rows
