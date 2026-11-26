"""
Backtest of the Signal's TIMING layer (the part that turns a solid dip into DIP BUY vs WAIT),
using only price/volume history, which is available historically. Analyst targets/ratings have no
history in our sources, so the quality score cannot be backtested here.

At each evaluation week (every 4 weeks, to limit overlapping samples) for each stock:
  dipped        = close >= 15% below the trailing 52-week high
  trend_intact  = close >= 40-week MA (≈200-day), or within 5% of it while the MA rises (vs 4 weeks ago)
  holders_ok    = >= 10% of the trailing-52-week cost distribution below the close
Groups among dips:  GO = trend_intact & holders_ok  (→ DIP BUY),  WAIT = otherwise.
Forward outcomes: 13- and 26-week return, and max drawdown within the next 13 weeks.
"""
import json, os, sys, statistics, time, urllib.request

K = "0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM"
Q = f"apikey={K}&ocid=finance-utils-peregrine&cm=en-us&it=web&wrapodata=false"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'backtest_cache.json')
SYMBOLS = """AAPL MSFT NVDA AMZN META GOOGL AVGO TSLA AMD MU INTC QCOM TXN ADBE CRM ORCL NFLX PYPL DIS NKE SBUX
MCD KO PEP PG JNJ PFE MRK ABBV UNH CVS WMT TGT COST HD LOW BA CAT DE GE HON JPM BAC WFC C GS MS V MA XOM
CVX COP NEE DUK T VZ CMCSA UPS FDX MMM CSCO IBM CRWD PLTR SNOW ZM ROKU SHOP MRVL""".split()
US = {'XNAS', 'XNYS', 'ARCX', 'BATS', 'XASE'}


def get(url, tries=4):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except OSError:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def flat(x):
    out = []
    for g in x if isinstance(x, list) else [x]:
        out.extend(g if isinstance(g, list) else [g])
    return out


def load():
    if os.path.exists(CACHE):
        return json.load(open(CACHE, encoding='utf-8'))
    ids = {}
    for s in SYMBOLS:
        d = get(f"https://services.bingapis.com/contentservices-finance.csautosuggest/api/v1/Query?query={s.lower()}&market=en-us&count=10")
        rs = [json.loads(x) for x in d['data']['stocks']]
        exact = [r for r in rs if (r.get('RT00S') or '').upper() == s]
        pick = next((r for r in exact if r.get('LS01Z') in US), exact[0] if exact else None)
        if pick:
            ids[s] = pick['SecId']
    out = {'ids': ids, 'charts': {}, 'shares': {}}
    idlist = list(ids.values())
    for i in range(0, len(idlist), 15):
        batch = ','.join(idlist[i:i + 15])
        for c in flat(get(f"https://assets.msn.com/service/Finance/Charts?{Q}&ids={batch}&type=5Y")):
            if isinstance(c, dict) and c.get('series'):
                out['charts'][c['instrumentId']] = c['series']
        for qs in flat(get(f"https://assets.msn.com/service/Finance/QuoteSummary?{Q}&ids={batch}&intents=Quotes,Exchanges,QuoteDetails")):
            eq = (qs or {}).get('equity') or {}
            sh = ((eq.get('analysis') or {}).get('shareStatistics') or {}).get('sharesOutstanding')
            fl = (eq.get('ownershipSummary') or {}).get('floatOwnershipPercent')
            if sh:
                out['shares'][qs['instrumentId']] = sh * ((fl or 100) / 100 if fl and 0 < fl <= 100 else 1)
    json.dump(out, open(CACHE, 'w', encoding='utf-8'))
    return out


def profit_ratio(bars, float_shares, price, bins=120):
    lo = min(b[1] for b in bars); hi = max(b[0] for b in bars)
    if hi <= lo:
        return None
    step = (hi - lo) / bins
    w = [0.0] * bins
    for h, l, c, v in bars:
        t = min(1.0, v / float_shares)
        w = [x * (1 - t) for x in w]
        typ = (h + l + c) / 3
        i0 = max(0, int((l - lo) / step)); i1 = min(bins - 1, int((h - lo) / step))
        dw = []
        for i in range(i0, i1 + 1):
            p = lo + (i + .5) * step
            if h == l: x = 1
            elif p <= typ: x = (p - l) / (typ - l) if typ > l else 1
            else: x = (h - p) / (h - typ) if h > typ else 1
            dw.append(max(x, 1e-4))
        tot = sum(dw)
        for k, i in enumerate(range(i0, i1 + 1)):
            w[i] += t * dw[k] / tot
    s = sum(w)
    return 100 * sum(x for i, x in enumerate(w) if lo + (i + .5) * step <= price) / s if s else None


def run(data, dip_pct=15, holders_min=10, trend_band=5, step_weeks=4):
    rows = []
    for sym, sid in data['ids'].items():
        ser = data['charts'].get(sid); fs = data['shares'].get(sid)
        if not ser or not fs:
            continue
        bars = [(h, l, c, v) for h, l, c, v in zip(ser['pricesHigh'], ser['pricesLow'], ser['prices'], ser['volumes'])
                if None not in (h, l, c, v) and v > 0 and h >= l]
        closes = [b[2] for b in bars]
        for t in range(56, len(bars) - 26, step_weeks):
            c = closes[t]
            hi52 = max(b[0] for b in bars[t - 51:t + 1])
            dip = (hi52 - c) / hi52 * 100
            ma = sum(closes[t - 39:t + 1]) / 40
            ma_prev = sum(closes[t - 43:t - 3]) / 40
            vs = (c / ma - 1) * 100
            intact = c >= ma or (vs >= -trend_band and ma >= ma_prev)
            pr = profit_ratio(bars[t - 51:t + 1], fs, c)
            f13 = (closes[t + 13] / c - 1) * 100
            f26 = (closes[t + 26] / c - 1) * 100
            dd13 = (min(b[1] for b in bars[t + 1:t + 14]) / c - 1) * 100
            rows.append(dict(sym=sym, dip=dip >= dip_pct, intact=intact, holders_ok=(pr is not None and pr >= holders_min),
                             pr=pr, f13=f13, f26=f26, dd13=dd13))
    return rows


def summarize(name, rows):
    if not rows:
        print(f"{name:42} n=0"); return
    f13 = [r['f13'] for r in rows]; f26 = [r['f26'] for r in rows]; dd = [r['dd13'] for r in rows]
    bad = sum(1 for x in dd if x <= -20) / len(rows) * 100
    print(f"{name:42} n={len(rows):5}  13w mean {statistics.mean(f13):+6.1f}% med {statistics.median(f13):+6.1f}% "
          f"win {sum(x > 0 for x in f13) / len(f13) * 100:4.0f}% | 26w mean {statistics.mean(f26):+6.1f}% med {statistics.median(f26):+6.1f}% "
          f"| maxDD13 med {statistics.median(dd):+6.1f}%  ≤-20%: {bad:4.1f}%")


if __name__ == '__main__':
    data = load()
    print(f"universe: {len(data['ids'])} symbols, charts {len(data['charts'])}, shares {len(data['shares'])}")
    rows = run(data)
    dips = [r for r in rows if r['dip']]
    print("\n== Timing layer (current thresholds: dip 15%, holders 10%, trend band 5%) ==")
    summarize("All observations (baseline)", rows)
    summarize("All dips (buy every dip)", dips)
    summarize("DIP BUY  (dip + trend intact + holders ok)", [r for r in dips if r['intact'] and r['holders_ok']])
    summarize("WAIT     (dip, trend broken or holders <10%)", [r for r in dips if not (r['intact'] and r['holders_ok'])])
    summarize("  WAIT: trend broken", [r for r in dips if not r['intact']])
    summarize("  WAIT: trend ok, holders <10%", [r for r in dips if r['intact'] and not r['holders_ok']])
    summarize("Dip + trend intact (ignore holders)", [r for r in dips if r['intact']])
    summarize("Dip + holders ok (ignore trend)", [r for r in dips if r['holders_ok']])

    if '--sweep' in sys.argv:
        print("\n== Sensitivity (DIP BUY vs WAIT, 26w mean / ≤-20% DD rate) ==")
        for dp in (10, 15, 20):
            for hm in (5, 10, 20):
                rs = [r for r in run(data, dip_pct=dp, holders_min=hm) if r['dip']]
                go = [r for r in rs if r['intact'] and r['holders_ok']]; wt = [r for r in rs if not (r['intact'] and r['holders_ok'])]
                m = lambda xs, k: statistics.mean(r[k] for r in xs) if xs else float('nan')
                bad = lambda xs: sum(r['dd13'] <= -20 for r in xs) / len(xs) * 100 if xs else float('nan')
                print(f"dip {dp:2}% holders {hm:2}%:  GO n={len(go):4} 26w {m(go,'f26'):+6.1f}% bigDD {bad(go):4.1f}%  |  "
                      f"WAIT n={len(wt):4} 26w {m(wt,'f26'):+6.1f}% bigDD {bad(wt):4.1f}%")

    if '--by-period' in sys.argv:
        # Robustness: split the sample in two halves by time index
        print("\n== By period (first vs second half of evaluation weeks) ==")
        half = {}
        for r_i, r in enumerate(rows):
            pass
