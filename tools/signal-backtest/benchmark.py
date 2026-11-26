"""
S&P 500 yardstick: weekly closes of SPY (the S&P 500 ETF), so a rule's dips can be compared with simply buying the
index over the same weeks. Downloaded once with the same MSN call as the stock charts, then cached.
"""
import bisect, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SPY_ID = 'a23hqh'
CACHE = os.path.join(HERE, 'spy_weekly_cache.json')


def load(bt):
    """[(date, close)] oldest first."""
    if os.path.exists(CACHE):
        return [tuple(b) for b in json.load(open(CACHE, encoding='utf-8'))]
    series = [c for c in bt.flat(bt.get(f"https://assets.msn.com/service/Finance/Charts?{bt.Q}&ids={SPY_ID}&type=5Y"))
              if isinstance(c, dict) and c.get('series')][0]['series']
    bars = [(t[:10], p) for t, p in zip(series['timeStamps'], series['prices']) if p]
    json.dump(bars, open(CACHE, 'w', encoding='utf-8'))
    return bars


def forward_return(bars, date, weeks):
    """SPY's % return over the `weeks` after `date` (YYYY-MM-DD), or None if outside the downloaded range."""
    dates = [b[0] for b in bars]
    i = bisect.bisect_right(dates, date) - 1
    if i < 0 or i + weeks >= len(bars):
        return None
    return (bars[i + weeks][1] / bars[i][1] - 1) * 100


def add_excess(rows, bars, weeks=26, key='f26', out='x26'):
    """Adds row[out] = the row's forward return minus SPY's over the same weeks (None when SPY is unavailable)."""
    for r in rows:
        m = forward_return(bars, r['date'], weeks)
        r['spy' + str(weeks)] = m
        r[out] = r[key] - m if m is not None else None
    return rows
