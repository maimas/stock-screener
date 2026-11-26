"""
Fifth pre-registered validation, on a SEVENTH universe never used before: does following the plan make a profit?
The five questions (G1 profit, G2 more than the market, G3 several not one, G4 the second half-year again, G5 no
selling early again) and their pass/fail criteria are in quality_rules.py (PRE-REGISTERED #7), written before this
universe was downloaded. Symbols in any earlier universe, and the app's own lists and holdings, are removed.

    python backtest_validation5.py   # downloads on first run, then uses seventh_*_cache.json
"""
import os, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import quality_rules as q
import backtest_validation4 as v4     # the loader, the bootstrap and the definitions of #6 (nothing runs on import)
import backtest_plan as plan          # the replay of the plan, for G3

# Written from memory by name only on 2026-11-22, before any of their prices were looked at: banks, insurers, asset
# managers, property, health care, industry, consumer, technology, energy, utilities, materials and companies listed
# abroad. 404 of the 642 had never been used; the seventh universe is every second one of those, in the order written,
# and the other half is kept back for an eighth list.
CANDIDATES = """
ZION FHN WAL EWBC PNFP BOKF ONB FNB UMBF HWC ASB VLY COLB CADE OZK SSB UBSI GBCI FFIN CBSH PB TCBI WBS BPOP FCNCA HOMB ABCB
FULT BKU WSFS CATY FIBK IBOC TRMK SFNC AUB BANR CVBF NBTB TOWN WAFD FBP OFG AX BANC CUBI PFS INDB EBC SBCF HTH FRME
AFG RLI KNSL PRI RNR AXS THG SIGI ORI CNO UNM LNC GL AIZ ERIE WRB CINF BRO RYAN EG KMPR PLMR HCI MCY AGO ESNT MTG RDN NMIH
FAF FNF STC SLM NAVI OMF ENVA CACC ALLY IBKR LPLA RJF SF EVR HLI LAZ PJT MC VIRT VCTR AMG APAM FHI JHG SEIC CG ARES OWL TPG
HLNE STEP COOP PFSI UWMC WEX EEFT WU PAYO FLYW
OHI NNN ADC STAG REXR EGP FR TRNO COLD IRM LAMR OUT GLPI VICI EPR KRG BRX FRT MAC SKT HIW CUZ KRC DEI SLG PEB RHP APLE SHO
DRH MPW SBRA CTRE NHI WPC EPRT IIPR UE AKR NSA LXP PECO GTY FCPT ELS INVH
EXEL NBIX INCY UTHR JAZZ HALO IONS SRPT BMRN RPRX INSM PCVX ARWR CYTK APLS TGTX AXSM KRYS MDGL VKTX RVMD ROIV LEGN ARGX ASND
PEN MASI GMED NVST XRAY HSIC ICUI MMSI HAE LIVN ITGR CNMD OMCL TNDM INSP IRTC GKOS NVCR ATRC LNTH MEDP ICLR CRL RGEN BIO TECH
QGEN BRKR AZTA NEOG STE TFX HOLX ENSG EHC THC CHE AMED ACHC SEM OPCH PRVA HQY DOCS TDOC PGNY EVH ALHC
AOS LII WSO FIX EME MTZ PWR ACM KBR FLR APG BLD IBP TREX AZEK SITE POOL WMS CSL OC MAS FBIN LPX UFPI BCC EXP SUM USLM AWI GGG
NDSN ITT IEX PNR WTS FELE MWA RBC TKR KMT LECO MIDD TTC AGCO CNH OSK TEX ALSN WAB GBX TRN R KNX SNDR WERN ARCB SAIA XPO LSTR
HUBG MATX KEX FWRD ALK SKYW AL GATX HRI URI WSC MSM AIT DNOW WCC ATKR ENS AYI HUBB NVT GNRC VMI ROAD GVA PRIM
DECK CROX BIRK ONON COLM HBI GIL CRI GOOS TPR CPRI RL SIG WSM RH ARHS W ETD LZB TPX LEG MHK WHR HELE SPB ENR COTY ELF IPAR
NUS HLF USNA BJ CASY MUSA SFM GO ACI PPC CALM LANC JJSF FLO THS HAIN BGS UNFI USFD PFGC CHEF WING TXRH BLMN DIN JACK SHAK
YUMC ARMK BROS SG PTLO KRUS LOCO BYD RRR CHDN PENN CZR MTN FUN PLAY LYV MSGS TKO NCLH CUK HGV TNL VAC H WH CHH
MANH TYL PCTY PAYC APPF DT ESTC CFLT GTLB S TENB RPD QLYS VRNS CVLT PRGS BLKB ALRM SPSC DOCN FSLY NTNX PSTG WDC STX JNPR
FFIV CIEN LITE VIAV CALX EXTR ADTN COMM UI ZBRA TRMB NOVT CGNX ONTO CAMT NVMI FORM AMKR ACLS UCTT ICHR MKSI ENTG AEIS POWI
DIOD SLAB SYNA RMBS LSCC MTSI SMTC CRUS QRVO SWKS ALGM VSH AVT ARW SNX NSIT PLXS BHE TTMI JBL BOX DBX DOCU ZI BL FROG AI
PATH U RBLX APP IOT
CHRD MTDR PR CIVI SM MUR OVV AR RRC CRK MGY NOG TALO HP PTEN NBR LBRT CHX NOV FTI WFRD TDW OII DINO PBF DK CVI SUN WES AM
KNTK HESM DTM NFE GLNG FLNG STNG FRO TNK DHT INSW
OGE PNW IDA POR NWE AVA BKH ALE MGEE OTTR SR NJR SWX OGS UGI NFG WTRG AWR CWT SJW MSEX HE
RS STLD CMC ATI CRS HCC AMR ARCH BTU AA CENX KALU TECK HBM KGC AU GFI HMY PAAS AG HL CDE OR SAND MOS ICL SMG FUL AVNT HUN
OLN CC TROX KRO CBT ASH SQM LAC SEE AMCR SON GPK SLGN CCK ATR OI
SE GRAB MELI NU PDD JD BIDU NTES TCOM ZTO YMM BEKE HTHT EDU TAL VIPS WB IQ KB SHG WIT RDY MMYT SHOP CNQ SU CVE IMO ENB PBA
CP CNI TRI GIB OTEX BB LSPD MGA RBA TU BCE RCI SLF BNS CM
""".split()


def seventh_symbols():
    """The seventh universe, and how many candidates had never been used."""
    seen = (set(v4.bt.SYMBOLS) | v4.listed('backtest_holdout.py', 'HOLDOUT') | v4.listed('backtest_validation.py', 'VALIDATION')
            | v4.listed('backtest_validation2.py', 'MIDCAPS') | v4.listed('backtest_validation3.py', 'FRESH')
            | set(v4.SIXTH) | v4.ON_SCREEN)
    unused = [s for s in dict.fromkeys(CANDIDATES) if s not in seen]
    return unused[::2], len(unused)


if __name__ == '__main__':
    symbols, unused = seventh_symbols()
    tuning = list(v4.bt.SYMBOLS)
    v4.bt.SYMBOLS = symbols          # what is downloaded when the seventh universe is not on disk yet
    data, rows = v4.load_rows('seventh')
    v4.bt.SYMBOLS = tuning
    mean, rate, boot, size, f26 = v4.mean, v4.rate, v4.boot, v4.size, v4.f26
    med = lambda xs, key=f26: statistics.median(key(r) for r in xs)
    pct = lambda xs, p, key=f26: sorted(key(r) for r in xs)[min(len(xs) - 1, int(p * len(xs)))]
    zero = lambda sample: 0
    dips = [r for r in rows if r['dip']]
    buys = [r for r in dips if q.dip_buy(r)]
    print(f"seventh: {len(symbols)} of {unused} never-used candidates, {len(data['ids'])} resolved, {len({r['sym'] for r in rows})} with fundamentals, "
          f"{len(rows)} observations, {len(dips)} dips, {len(buys)} DIP BUYs from {len({r['sym'] for r in buys})} stocks "
          f"({min(r['date'] for r in rows)} -> {max(r['date'] for r in rows)})")
    results = {}

    # ---- G1: profit ----
    print(f"\n== G1 profit: DIP BUYs over 26 weeks ({size(buys)}) ==")
    g, lo, hi, p_profit, _ = boot(buys, lambda s: mean(r for r in s if v4.is_buy(r)), zero)
    up = rate(buys, lambda r: r['f26'] > 0)
    print(f"mean {mean(buys):+.1f}%, 90% CI [{lo:+.1f}, {hi:+.1f}], P(mean <= 0) = {p_profit:.1%}; typical (median) {med(buys):+.1f}%, "
          f"up after 26 weeks {up:.0%}; worst tenth {pct(buys, .10):+.1f}%, best tenth {pct(buys, .90):+.1f}%")
    results['G1'] = 'PASS' if mean(buys) > 0 and p_profit < q.PROFIT_P else 'FAIL'
    print(f"G1 (made money on stocks never used before): {results['G1']}")

    # ---- G2: more than the market ----
    with_spy = [r for r in buys if r['x26'] is not None]
    excess = lambda r: r['x26']
    print(f"\n== G2 more than the market: against the S&P 500 over the same weeks ({size(with_spy)}) ==")
    g, lo, hi, p_edge, _ = boot(with_spy, lambda s: mean((r for r in s if v4.is_buy(r) and r['x26'] is not None), excess), zero)
    index_mean = mean(with_spy, lambda r: r['spy26'])
    beat = rate(with_spy, lambda r: r['x26'] > 0)
    print(f"DIP BUYs {mean(with_spy):+.1f}% vs S&P 500 {index_mean:+.1f}%: excess {mean(with_spy, excess):+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], "
          f"P(excess <= 0) = {p_edge:.1%}; typical excess {med(with_spy, excess):+.1f} pts; beat the index {beat:.0%}")
    results['G2'] = 'PASS' if mean(with_spy, excess) > 0 and p_edge < 0.10 else 'FAIL'
    print(f"G2 (more than the market): {results['G2']}")

    # ---- G3: several, not one ----
    print("\n== G3 several, not one: the plan replayed on this universe alone ==")
    rep = plan.replay(plan.dip_buys(('seventh',)), plan.bad_cases(plan.dip_buys(('fresh',))))
    one, five, ten = (rep['baskets'][k] for k in ('1', '5', '10'))
    months = rep['months']
    ups = sum(m['plan'] > 0 for m in months); beats = sum(m['plan'] > m['spy'] for m in months)
    print(f"{len(rep['trades'])} positions held one at a time from {rep['stocks']} stocks; {len(months)} monthly batches of {plan.MIN_TRADES}+ positions: "
          f"{ups} up after 26 weeks, {beats} beat the S&P 500; all positions together {rep['together']:+.1f}% vs S&P {rep['spy_together']:+.1f}%")
    several = dict(months=len(months), monthsUp=ups, monthsBeat=beats, together=rep['together'], sp500Together=rep['spy_together'],
                   one=one['up'], five=five['up'], ten=ten['up'], tenMonths=ten['months'])
    if ten['months'] < q.MIN_BASKET_MONTHS:
        results['G3'] = 'INCONCLUSIVE'
        print(f"only {ten['months']} months with ten or more positions (needs {q.MIN_BASKET_MONTHS})")
    else:
        lead = (ten['up'] - one['up']) * 100
        print(f"up after 26 weeks: one position alone {one['up']:.0%} ({one['months']} months), five {five['up']:.0%}, ten together {ten['up']:.0%} "
              f"({ten['months']} months with ten or more): ten ahead by {lead:+.1f} points")
        results['G3'] = 'PASS' if lead >= q.BASKET_LEAD_POINTS else 'FAIL'
        several['lead'] = lead
    print(f"G3 (owning several beats picking one): {results['G3']}")

    # ---- G4: the second half-year (P3 again) ----
    longer = [r for r in buys if v4.with_52(r)]
    late_excess = lambda r: v4.late(r) - v4.spy_late(r)
    print(f"\n== G4 the second half-year: the same positions over weeks 26-52 vs the S&P 500 ({size(longer)}) ==")
    second = dict(rows=len(longer), stocks=len({r['sym'] for r in longer}))
    if v4.enough(longer):
        stay, index = mean(longer, v4.late), mean(longer, v4.spy_late)
        g, lo, hi, p_low, p_high = boot(longer, lambda s: mean((r for r in s if v4.is_buy(r) and v4.with_52(r)), v4.late),
                                        lambda s: mean((r for r in s if v4.is_buy(r) and v4.with_52(r)), v4.spy_late))
        beat_late = rate(longer, lambda r: late_excess(r) > 0)
        print(f"weeks 26-52: positions {stay:+.1f}% vs S&P 500 {index:+.1f}%: excess {g:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], "
              f"P(excess <= 0) = {p_low:.1%}; typical excess {med(longer, late_excess):+.1f} pts; beat the index {beat_late:.0%}")
        results['G4'] = 'PASS' if stay > index and p_low < 0.10 else 'FAIL'
        second.update(stay=stay, sp500=index, excess=g, pNotBetter=p_low, pNotWorse=p_high, beat=beat_late, medianExcess=med(longer, late_excess))
    else:
        results['G4'] = 'INCONCLUSIVE'
    print(f"G4 (keep for a second half-year): {results['G4']}")

    # ---- G5: no selling early (P2 and H3 again) ----
    print(f"\n== G5 no selling early ({size(buys)}) ==")
    hold = mean(buys)
    take = mean(buys, q.take_profit_return)
    _, lo, hi, p_take, _ = boot(buys, lambda s: mean(r for r in s if v4.is_buy(r)), lambda s: mean((r for r in s if v4.is_buy(r)), q.take_profit_return))
    sold = rate(buys, lambda r: r['up26'] >= q.TAKE_PROFIT_PERCENT)
    print(f"take-profit at +{q.TAKE_PROFIT_PERCENT}%: {take:+.1f}% with it vs {hold:+.1f}% holding ({hold - take:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], "
          f"P(diff <= 0) = {p_take:.1%}); sold early on {sold:.0%}; typical: {med(buys, q.take_profit_return):+.1f}% with it vs {med(buys):+.1f}% holding")
    stop = mean(buys, q.stop_return)
    _, lo, hi, p_stop, _ = boot(buys, lambda s: mean(r for r in s if v4.is_buy(r)), lambda s: mean((r for r in s if v4.is_buy(r)), q.stop_return))
    stopped = rate(buys, lambda r: r['dd26'] <= -q.STOP_PERCENT)
    print(f"stop at -{q.STOP_PERCENT}%: {stop:+.1f}% with it vs {hold:+.1f}% holding ({hold - stop:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], "
          f"P(diff <= 0) = {p_stop:.1%}); stopped out on {stopped:.0%}")
    results['G5a'] = 'PASS' if hold > take and p_take < 0.10 else 'FAIL'
    results['G5b'] = 'PASS' if hold > stop and p_stop < 0.10 else 'FAIL'
    results['G5'] = 'PASS' if results['G5a'] == 'PASS' and results['G5b'] == 'PASS' else 'FAIL'
    print(f"G5 (no selling early): {results['G5']} (for a gain: {results['G5a']}; after a drop: {results['G5b']})")

    print("\nPre-registered #7: " + ", ".join(f"{k} {results[k]}" for k in ('G1', 'G2', 'G3', 'G4', 'G5')))

    # ---- Reported only: not eligible to ship or change anything ----
    print("\n== Context only ==")
    v4.bt.summarize("A. Buy every dip", dips)
    v4.bt.summarize("F. Growing (app's DIP BUY)", buys)
    g, lo, hi, p, _ = boot(rows, lambda s: mean(r for r in s if v4.is_buy(r)), lambda s: mean(r for r in s if r['dip']))
    print(f"F - A: {g:+.1f} pts, 90% CI [{lo:+.1f}, {hi:+.1f}], P(gap <= 0) = {p:.1%}")
    high, low = [r for r in buys if r['vol'] >= q.VOL_HIGH], [r for r in buys if r['vol'] < q.VOL_LOW]
    if high and low:
        print(f"H2 again (volatility): fell another 20%+ within 13 weeks {rate(high, v4.fell):.0%} of volatile ({size(high)}) vs "
              f"{rate(low, v4.fell):.0%} of calm ({size(low)})")

    # The figures above that the app quotes, recorded for it (see quoted.py).
    import quoted
    quoted.put('seventh', dict(
        stocks=len(data['ids']), dipBuys=len(buys), dipBuyStocks=len({r['sym'] for r in buys}),
        firstBuy=min(r['date'] for r in buys), lastBuy=max(r['date'] for r in buys),
        verdicts=results,
        profit=dict(mean=mean(buys), median=med(buys), up=up, pNoProfit=p_profit, worstTenth=pct(buys, .10), bestTenth=pct(buys, .90)),
        market=dict(dipBuy=mean(with_spy), sp500=index_mean, excess=mean(with_spy, excess), pNoEdge=p_edge, beat=beat,
                    medianExcess=med(with_spy, excess)),
        several=several,
        secondHalf=second,
        sellingEarly=dict(holding=hold, holdingMedian=med(buys), withTakeProfit=take, pTake=p_take, soldEarly=sold,
                          withStop=stop, pStop=p_stop, stopped=stopped),
    ))
