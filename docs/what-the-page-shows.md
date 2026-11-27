# What the page shows

This file describes what the page shows and how it is laid out. How to run the app is in the [README](../README.md).

## Two views: Portfolio and Watchlist

The app has two views, with a link to each in the bar at the top.

| View | Address | Its question | What it holds |
|---|---|---|---|
| Portfolio | `/portfolio` (also `/`) | What do I own, and what do I do? | "Your plan today" (the portfolio's buttons, the plan's lines, cash and limit, "What you own"), "Could add", and "How the plan was tested" |
| Watchlist | `/watchlist` | What is on sale? | "Dip candidates" across the top (how many stocks carry each mark, where the market stands, what the mark was worth in tests, and the stocks marked DIP BUY as a table) and "Your lists" under it, with each stock's details |

The Watchlist finds, the Portfolio sizes. One thing travels between them: a stock marked DIP BUY on the Watchlist
shows on the Portfolio view under "Could add", with the size it would take in the portfolio being shown. (Its
details on the Watchlist used to say that size too, under "Where it fits"; the owner had it taken out: "it should
not be in the watchlist". A size is on the Portfolio view only.)

Both addresses are one page (`pageView` in `src/app/app.routing.ts` matches both, `DashboardComponent` tells the
page which view to show). The view that is not shown is only hidden, so going from one to the other loads no price
again and an open row is still open on the way back. A click on a stock anywhere on the Portfolio view goes to the
Watchlist and opens that stock's details there.

## What the page shows first: your plan today

The first box is about one portfolio, read top to bottom: which portfolio (a button each), its cash and your limit
for a loss on one stock, the tested plan for it as a few lines, and then "What you own", a table with a row for
each stock. Each line is a verb, the stocks with their dollar amounts, and one short sentence written for someone
new to investing. Nothing in the box opens or expands.

| Step | Meaning |
|---|---|
| WHAT'S NEW | Not a step: what changed since the last day in the daily log (stocks that joined the ones to buy or left them, a holding that passed 6 months, the market turning fearful or calm), or that nothing did |
| NO PRICE | A holding whose price did not load: the plan leaves it out until the prices are reloaded, and the line says where to reload |
| YOUR LIMIT | Shown until you enter your own limit: the amounts assume the starting one (10% of the portfolio lost on one stock) |
| START HERE | Only for a portfolio worth nothing yet: enter your cash, so there is something to work amounts out from |
| SELL SOME | A holding that could lose more than the limit in a tested bad half-year, with the amount to keep |
| YOUR CALL | A holding older than 6 months. The line has both results of the two tests that went on for 6 months more (ahead of the market on one list, not clearly on the next), so the plan has no rule |
| YOUR LEVEL | Only once you pick a level under "Take a profit at": a holding bought as a DIP BUY, in its first 6 months, that is up that much on what you paid. It reports, so it is not among what there is to do; selling is your decision. KEEP stays as it is, and the stock's row says "your level: up 18%" beside it |
| HOLD BACK | Only once you set a share under "Keep outside stocks", and while your cash is more than a tenth short of it: what was set, what the cash is, and how much it is short. It names no stock to sell and does not say to sell. While it shows, BUY stays a line but is not among what there is to do |
| GOOD TIME | Only while the market is fearful (VIX 25 or more). The line is the Watchlist's own of the same fact: "Market fear high (VIX 26.8)", what stocks bought then made against calm months, and that fear can get worse first |
| BUY | How many stocks marked DIP BUY could be added, and where to look: the stocks themselves are in "Could add", each with its size, and what can be added to one you own is in its row ("add 8.4% ($840)"). The line lists no stock, and its sizes do not depend on the cash |
| HOW MANY | Beside BUY while the plan covers fewer than three of the portfolio's stocks: three or more rather than one |
| ORDER PRICE | With a level picked under "Take a profit at": the price of a sell order at that level for each such holding that is still under it. It is there every day, so it is not among what there is to do |
| KEEP | Holdings the plan covers (a DIP BUY today, or bought as one less than 6 months ago): kept for 6 months, not sold early. Not a line: said in each stock's row of the table |
| NO OPINION | Holdings the tests do not cover. Also said in the stock's row |

The plan is: buy stocks marked DIP BUY, three or more rather than one; put no more into each than fits the limit
(the sizes the page shows are smaller: an equal share of the risk, see "What could be added" below);
keep each for 6 months and do not sell early. Every step is a rule that passed a pre-registered test on stocks it
was not found on; where the tests say nothing, the step says so. Two things were tested and are deliberately not
in the plan: a way of choosing among DIP BUYs (the fastest fallers first was not dependable inside a given week;
the one least tied to what you own earned less) and keeping for a second half-year (it beat the market on one
list and not on the next).

How many to hold was tested on 30 years of prices (pre-registered #8): three stocks that dropped, held together
for 6 months, typically ended at +5.3% against +3.8% for one alone, and 1 in 10 lost 22% or more against 33%. The
average was the same, and three together still typically lost when the market fell. It says how many, never
which.

Does it make money? Asked directly on 202 stocks never used before (pre-registered #7): yes, +9.3% over 6 months
on average, and no more than the market, which made +10.2% over the same weeks. Under the plan's lines a strip of
figures says exactly that, from the numbers the test recorded, with the typical result and the loss beside the
average: "In tests on 202 new stocks, over 6 months", then "DIP BUY, on average +9.3%", "DIP BUY, the typical one
+3.6%", "The market +10.2%" and "1 in 10 DIP BUYs lost 31% or more". It is the same strip as "Dip candidates"
shows on the Watchlist: both views quote the newest test, by the owner's choice (2026-11-26) between it and all
the tested lists pooled; the pooled figures are behind "How to read this" on the Watchlist.

Amounts show from the first visit. Until you enter "Most I can lose on one stock" at the top of the box, the
plan starts from 10% of the portfolio (the starting value chosen on 2026-11-22; `DEFAULT_LIMIT_PERCENT` in
`src/app/watchlist/sizing.ts`), and says so in its first step. A 10% limit lets up to about a quarter of the
money into one stock of the riskiest kind, which leaves room for the three or more the plan asks for.

### Two limits of your own, and how far your stocks are one bet

The plan sizes each stock so that a bad half-year for that one stock stays within "Most I can lose on one stock".
That says nothing about all of them falling together, which stocks of one kind do. Two things on the page are
about that:

- **"Keep outside stocks"**, the third field of the box, is a second limit of your own: the share of the portfolio
  to keep in cash, the one part that cannot fall with your stocks. It is empty until you enter a share. Under the
  fields the page says what that share is in dollars and whether your cash covers it ("20% of this portfolio is
  $2,000: your cash is $500 short of it."). The split in "Could add" only uses what is above it. It is your
  number, like the limit: no test is behind it. What it costs is the result of the money that is not in stocks.
  - The plan's line HOLD BACK ("You set 20% to keep outside stocks; your cash is 9.9%: $10,100 short.") waits
    until the cash is more than a tenth short: the amount to keep is a share of what the portfolio is worth, so it
    moves with prices every day (and shrinks when the stocks fall). The sentence under the field and the split say
    a smaller gap to the dollar.
  - The line's amount is what would have to move from stocks into cash. New cash closes the gap too, but it takes
    more, because new cash also makes the portfolio larger: the line's reason gives both amounts, and says that
    the plan does not say which stock to sell, or that you should.
  - While HOLD BACK shows, BUY stays a line with its sizes, but it is not named in "To do today": with the cash
    under what you keep there is nothing to buy with.
  - While a stock has no price, the portfolio is worth more than could be counted, so the amount to keep is the
    least it can be: the sentence says "at least" and does not say that the cash covers it, and "Could add" splits
    nothing until the price loads.
- **How far your stocks are one bet** is said with the explanations of "What you own" (behind "How to read this
  box"), from what each stock is worth today and the year of daily prices the page loads: where the money is ("85%
  of your stock money is in Technology: 7 of your 9 stocks."), how many separate bets the stocks moved like, and
  how many times as much as the market they swung ("Over the past year your stocks moved like about 2 separate
  bets, and about 1.9 times as much as the market."). What a bad half-year for every marked stock at once would
  cost is a row at the foot of the table.
  - Only figures that hold up on a year of daily prices are given: shares of the money and sector labels, which
    are exact, and two figures of the stocks taken together. A figure for one pair of stocks, or for the last
    month, is not given: its error is as large as the figure.
  - "Separate bets" is the money-weighted average of the stocks' daily swings over the swing of all of them
    together, squared: 1 when they move as one, as many as they are when each goes its own way, they swing alike
    and the money is spread evenly. Stocks move together more in a fall than in an ordinary year, so the count
    flatters. It is said with "about" unless it is the whole number itself.
  - "Times as much as the market" is the swing of the stocks together over the market's swing on the same days.
    It counts the whole of their movement, also the part that has nothing to do with the market: a few volatile
    stocks swing far more than they follow. It is left out unless the market's prices cover those days.
  - A stock with too little price history is left out and the sentence says so; when the stocks share less than
    a year of prices it says how many months it is about. While a holding has no price the sentence is not shown:
    it would be about fewer stocks than the headline counts.
  - These are facts about the portfolio, not a tested signal: nothing in the plan depends on them
    (`oneBetOf` in `src/app/watchlist/concentration.ts`).

The first line, WHAT'S NEW, makes a daily look short: it compares today with the last earlier day in the daily log
(`src/app/watchlist/whats-new.ts`). It states facts, not a tested signal, and it needs the log to have an earlier
day, which the daily recorder provides.

What could be added, and at what size, is shown whether the money is there or not: the cash counts toward what the
portfolio is worth, which the limit and every size are shares of. One line does look at the cash itself: HOLD BACK,
once you set a share to keep outside stocks.

### A level of your own for taking a profit

The plan says KEEP for 6 months, because on average keeping paid more. Taking a profit was then tested for what
it does to losses (pre-registered #9, on the last 202 stocks no test had used): on 201 of them, 42% of the stocks
marked DIP BUY ended the 6 months below what was paid. With a sell order placed in advance at 15% above the
purchase price it was 25%, and the average fell from +10.5% to +4.9%; sold after a week closed 15% or more up,
30% and +6.3%. At +25% the difference did not reach the marks written down beforehand when the test was first
run, and that run decides what is offered. (The figures are those of the test with one faulty weekly price of the
data provider put right, on 2026-11-26. With it a sell order at +25% reaches its marks, by a hair, and is still
not offered: a result is not re-read afterwards into an offer.)

So +15% is offered as one more setting, "Take a profit at", beside the cash, the limit and the share kept outside
stocks. It is "no level" until you pick it, and until then the plan is as it was. With the level picked, two lines
are added and nothing is taken away, for every holding you bought as a DIP BUY that is inside its 6 months (the
stocks that test followed; a holding without a purchase day cannot be one of them, which the sentence under the
fields says):

- **YOUR LEVEL** names a holding whose price is 15% or more above the average price you paid ("Up 15% or more on
  what you paid: the level you set. Selling is your call."). The stock is still under KEEP, and its row still says
  KEEP, with "your level: up 18%" beside it; one that is over the limit is still under SELL SOME.
- **ORDER PRICE** gives, for each of the others, the price to put on a sell order at that level ("ACME at
  $115.00"), rounded up so that an order at that price never sells under the level. Its reason says what such an
  order is (one that waits at a price: a limit order) and that in the test it stood for the 6 months only.
- Under the fields two figures say what the level did in the test, both sides, each beside what keeping gave
  ("In the test at +15%, ended with a loss  25% to 30% of stocks, against 42% when kept" and "In the test at +15%,
  made on average  +4.9% to +6.3%, against +10.5% when kept": each says by itself what it is). The sentence they
  come from, with which stocks the level counts for, is where the pointer rests on them and behind "How to read
  this box". Each line's reason, in "How the plan was tested", says both sides in that test's numbers (how much
  rarer a loss was, whether the bad case was milder, how much lower the average) and what became of the stocks that got that
  far when they were kept. The whole test stands once, under THE PLAN in the same box and behind its "more", as
  two small tables: what keeping and each way of selling did, and what became of the stocks a sale took out early
  when they were kept instead. Both tables hold every way that was tested, the ways the plan does not offer set
  apart under "Not offered: under the marks written down before the test, the first time it was run".

Neither line tells you to sell or stands under "To do today": they report your own level on your own holdings. What the test leaves out is said
with it: weekly prices; a sell order filled at exactly its price; the money left idle after a sale, so "a loss is
rarer" is about that one stock; a market that rose for 91% of the positions; and looking less often than once a
week catches fewer of them. Only what passed on the first whole download is offered, whatever a later download
says (`TAKE_PROFIT_REGISTERED` in `tools/evidence/figures.js`); `tools/signal-backtest/README.md` has the test.

## What could be added: every marked stock, sized for the portfolio

"Could add", on the Portfolio view, lists the stocks the Watchlist marks DIP BUY that the portfolio being shown does
not hold: a row each, from A to Z. It lists all of them and ranks none: the tests found no dependable way to tell
which will do best, so the app says how much, never which.

| Column | What it says |
|---|---|
| Dropped, Growing | What the stock's mark rests on, as in "Dip candidates": how far the price is below its highest of the past year ("−42%"), and the growth figure ("profit +21%" or "sales +27%") |
| Swings | How much the stock's price swings in a year, as a figure ("85%"): the one measure of a stock's risk the tests could use, so it stands with what the mark rests on. A warning sign marks a stock that dropped further or swings more than 19 in 20 of the tested ones; the sentences are where the pointer rests |
| Size | The share of the portfolio the stock would take, to one decimal ("20.1%"), and the same in dollars |
| Bad case, Typical, Good case | What a tested bad, typical or good half-year would mean at that size, in whole dollars: they are worked out from tests, not counted. "Typical" is where the middle stock of its kind ended (half did better, half worse); it stands between the two so that a bad and a good case side by side are not read as an upside twice the downside. In a ticked row that gets an amount, the three are worked out for that amount, not for the size |
| Analyst target, Holders in profit | Context, set in grey and never in green or red: how far the middle one of analysts' price targets is from today's price ("+56%"), and how many of the stock's owners paid less than today's price ("38%"). The first cannot be tested yet and the second made no difference in tests; a line under the table says so |
| Against | What speaks against the stock among the facts no test could use, or that made no difference: short tags ("no profit", "high debt", "results in 5d"), two at most and "+1" for more, a dash for none; in a narrow box their number. Set in red where there is something (the owner, 2026-11-26: "I want that in red so that we know it's a "no no""), a dash in grey. It is context all the same: not a tested reason to leave a stock out |
| Sector (you own), Moves with yours | What the portfolio already holds that is like the stock, as two short cells that can be read down the table: its sector with, in brackets, how many of the portfolio's stocks are in it ("Technology (4)", "Utilities (none)"), and "closely" or "not closely" as its price has moved with theirs (blank only when there are no prices to compare). The two figures behind it (the past year, the last month) show where the pointer rests on that cell |

The four columns about the stock itself (Dropped, Growing, Analyst target, Holders in profit) were asked for by the
owner of the page, to see them beside the sizes instead of looking each stock up on the Watchlist. Their headings
say what they are when pointed at or reached with the Tab key, and the sentence behind a cell shows where the
pointer rests (`src/app/watchlist/stock-facts.ts`). The rows stay A to Z and no column can be sorted: an order by
any of them would be a ranking, and none passed a test. A row holds four kinds of fact (what the mark rests on, what
the plan gives the stock, context, what you own that is like it): each of the last three starts at a hairline, so
that "Analyst target" does not read as one more of the plan's numbers.

Each size is for adding that one stock alone: the rows do not add up to a plan for all of them, and once a stock
is added the others are sized again. The heading "Size" says so where the pointer rests or the Tab key lands, and
so does the first of the box's explanations, behind "How to read this table" under the table. There the box also
works its first row out in words ("For example, the first row: ..."), a line under the name of each column: what the size is a share
of and why it is that share, then what the bad and the good case are and what they come to at that size, with the
typical result beside the good one. The line under "Bad case" ends by setting that amount against your limit
("... that is −$825, within the $2,000 you accept to lose on one stock"): the limit is the most to lose on one
stock, not the most to hold of it, so a size is usually more dollars than the limit and fits it all the same. Nothing there depends on resting the pointer on a number.

How a size is worked out (`src/app/watchlist/recommendations.ts`):

- **An equal share of the risk.** Every stock of the portfolio, with the new one, is sized so that its tested bad
  half-year would cost the same: shares in proportion to 1 / the bad case of the stock's kind. A stock whose price
  swings a lot gets less than a calm one. Example: a portfolio worth $10,000 that holds three stocks "in between"
  (bad case 31%) would give a fourth like them a quarter, $2,500, and a volatile one (bad case 41%) $2,013.
- **As if there were three.** The tested plan held three or more, so a portfolio with fewer is split as if it held
  three; the first stock of an empty portfolio gets about a third.
- **Never more than fits the limit.** "Most I can lose on one stock" stays the ceiling; a size it made smaller says
  "at your limit" (in a box under 1,400px wide, "limit": the sentence is where the pointer rests).
- **Not a tested rule.** This is arithmetic on the tested bad cases. No test compared it with equal amounts or any
  other split, and the box says so ("How to split money between stocks was not tested").
- **No part for the cash**, beyond counting in what the portfolio is worth. A portfolio worth nothing yet gets the
  list without sizes.

For a stock the portfolio already holds, the same rule says what it is short of its share: that is the "add ..." in
its row of "What you own", offered only while a tenth of the share is still free. Those stocks are also the last
rows of "Could add", under a heading of their own ("Stocks you own that could be added to"; each row says "held" and
"add 4.0%"), so that they can be ticked like the others.

### Splitting the cash between the stocks you tick

Each row of "Could add" has a tick box. Nothing is ticked to begin with and there is no "tick all": which stocks to
buy is your choice, the app only says how much. Tick one, a few, or every row, and the box splits this portfolio's
cash between them (`src/app/watchlist/cash-split.ts`):

- **The portfolio it aims at** is what you hold plus the ticked stocks that are new.
- **Each stock's share** in that portfolio is its equal share of the risk, never more than fits your limit: the same
  rule as "Size". With more stocks ticked a share is usually smaller than the size of the stock alone (one the
  limit holds back stays the same amount), so the amount is measured against that share and not against "Size".
- **What a ticked stock is short of** is that share less what you hold of it. The cash goes to the ticked stocks in
  proportion to what each is short of, and none gets more than that. What is left stays cash.

When you keep a share outside stocks ("Keep outside stocks" in the "Your plan today" box), only the cash above it is
split, and the box says so in the hint and in the lines ("Your $1,000 (your cash above the $2,000 you keep outside
stocks) covers ..."); when all the cash lies within that share there is nothing to split, and it says that. With no
cash entered it says that only cash above that share is split. While a stock has no price it splits nothing: the
portfolio is then worth more than could be counted, so the amount to keep cannot be worked out.

A ticked row then shows one amount more, under "With your cash": what the cash would buy of that stock ("$1,000").
It is the row's one strong figure, and the size beside it, which is for that stock added alone, steps back. No
second amount stands beside it: a row used to say "$1,000 of $2,013" after "20.1% $2,013" under "Size", three
dollar amounts for one stock. What the amount is measured against is said in words: once for all the ticked rows
under the table, and for one row where the pointer rests on its amount, or the keyboard on its stock ("It is
$2,013 short of its share with the stocks you ticked in the portfolio. This covers a part of that, the same part
for every stock you ticked."). An owned stock that is at its share once the others are in says so instead of
showing a zero, and while there is no money to split a ticked row says "nothing to split" beside a
dash. The headings "Size", "Bad case", "Good case" and "With your cash" say what their column is when
pointed at or reached with the Tab key. Under the table the box says what the purchase would do: how many of the
ticked stocks are short of their share, by how much, and how far the cash goes; why an amount can be less than
"Size" although the cash covers everything, where one is (with the others you ticked in the portfolio a share is
smaller than alone); how many stocks you would then hold (one whose price did not load counts: it is held all the
same); and what a bad half-year for every marked stock at once would cost today and after, in whole dollars like
the cells it adds up. When only cash
is spent that last sum goes up, because cash cannot fall: the box says so, and does not call the purchase "less
risk". The test of how many stocks to hold is not quoted there: "Your plan today" says it, by its own count of the
stocks the plan covers.

**The sell side.** The plan has one reason to sell: SELL SOME, when a stock's tested bad half-year would cost more
than your limit. The tests found no sell signal, and selling early paid less than keeping for 6 months, so the box
offers no other reason and names no other stock. What it does is say that step where the purchases are sized:

- When the plan names a stock, the box says so under the tick hint, with what selling down to the limit would free
  ("The plan says SELL SOME: selling ACME down to $1,220 would free $1,780."), and with one more box to tick: "Count
  that money in the split". The amounts are the plan card's own ("keep $1,220"); a test holds the two together.
  The tick is for that sale: when the plan names other stocks, or none, the box is unticked again.
- Once that is ticked, the split is worked out as if those sales were made: the freed money is split together with
  the cash, and the box says so everywhere: in the hint, in the lines ("Your $5,780 (your cash and what selling
  would free) covers ..."; what is over "would be left as cash"), and in the name of the column and of the heading
  over the lines, which is "With the money" then (a portfolio may have no cash at all). The bad half-year is
  compared between the portfolio as it is today and as it would be "after selling and buying", in those words. The
  box then says why the sum went the way it did, with the reason that holds: more of your money would be in stocks;
  or what you would buy swings more than what you would sell; or, when the sum is lower, that selling takes more
  off it than what you would buy adds. A purchase alone never lowers it.
- When the plan asks to sell nothing, the box says that too, quietly, among the sentences about the table. It says
  what the plan asks, not that no stock of yours could lose more than your limit: only a stock marked DIP BUY has a
  tested bad case, and the plan lets a stock be over the limit by a tenth before it names it, which the sentence
  says ("... could lose over a tenth more than your limit ...").

The "Size" column still shows an amount whether or not the cash is there, and nothing outside this box depends on
what is ticked. The ticks, and that one box, are for looking: they are not saved, they belong to the portfolio they
were made in whatever it is called, and they are gone when another portfolio is shown or the page is loaded again.
Like every size on the page, the split is arithmetic and not a tested rule.

"Fit" is a fact, not a reason to pick: nothing is ordered or hidden by it. (Choosing the stock least tied to what is
owned was looked at and earned less.)

The page works the recommendations out with the plan, for every portfolio (`planFor` in
`src/app/watchlist/portfolio-plan.ts`); the box is `src/app/watchlist/could-add/`, the section in the details
`src/app/watchlist/where-it-fits/`.

A step that asks for something (NO PRICE, YOUR LIMIT, START HERE, SELL SOME, YOUR CALL, BUY) wears a filled mark,
and the line above the plan's lines names them, in the same words: "To do today: SELL SOME, BUY", or "Nothing to do
today". It names them rather than counts them, because a number says that something is expected, not what.

Each thing is said once. The lines hold what is new, what asks for something and what is about the whole portfolio.
KEEP and NO OPINION only say where a stock you own stands, so they are not lines: the "Plan" column of the "What you
own" table says them in each stock's row, with how much can be added, and the sentence for each word shows when the
word is pointed at (and in the explanation of the "Plan" heading, which the keyboard reaches). It is not written
under the table as well: the owner had those lines removed as a repeat. A stock that needs something (SELL SOME, YOUR CALL, NO PRICE) has both: its line, and the word in its row
with the amount to keep. The lines and the rows are two views of the same steps (`saidInRows` and `holdingPlans` in
`src/app/watchlist/plan.ts`), so they cannot disagree. Each portfolio's button names what its plan
expects ("Retirement · to do: BUY"), so you can see which account needs you, and for what, without switching to it. While
the plan covers one or two of a portfolio's stocks, the box also says so, with what the test of how many found. The
plan is worked out for every portfolio in `src/app/watchlist/portfolio-plan.ts`. Nothing here picks which stocks to
add: no way of choosing among DIP BUYs has passed a test.

The steps are not advice and promise no result. The evidence behind each step, caveats included, is in one box at
the bottom of the Portfolio view, "How the plan was tested", which the line under the plan's lines leads to
(`tools/signal-backtest/README.md` has the tests themselves). Under THE PLAN the box gives the account of the
tests: short paragraphs, and a small table wherever a test has like figures to set side by side (one stock
against three held together; keeping against each way of selling early; what became of the stocks that were
sold). Each figure of a test stands once, in its table, and what holds for the whole account is said once: that
the market was rising, and that none of it is advice. Under the verbs of today's steps each reason says what is
its own and leaves to THE PLAN what is said there (`planBlocks` in
`src/app/watchlist/evidence.ts`). The plan waits until every list has loaded, because a
plan worked out from half the prices would be wrong.
The logic is in `src/app/watchlist/plan.ts`; the wording rules are at the top of `src/app/watchlist/evidence.ts`.

## How the page is laid out

The page is made for a browser window that fills a large monitor, and still works in a laptop window and on a phone.

| Window | Portfolio | Watchlist |
|---|---|---|
| 2500px and wider | "Your plan today" on the left with "How the plan was tested" under it; "Could add" down the right side of both, the two sharing the window evenly | "Dip candidates" across the top, as wide as the window; under it "Your lists", two side by side while they show their key columns |
| 2300px to 2499px | One column; in "Could add" the table stands on the left and what is said about it on the right | The same as above (two lists side by side from 2240px) |
| 1800px to 2299px | The same one column | One column: "Dip candidates", then the lists one under the other |
| Narrower | One column; "Could add" as above while its box is at least 1620px wide, and under its table in a narrower one | The same one column; the table of "Dip candidates" leaves out "List" in a box under 1340px and "Past year" under 1100px, as a list does |

- **The answer comes first.** In "Your plan today" the portfolio being shown is the filled button, and the line "To do
  today: ..." is the largest line in the box, right under the portfolio's names. In a box of 1200px or more the plan's
  lines stand on the left and the fields (cash, "Most I can lose on one stock", "Keep outside stocks") right beside
  them on one line, a fixed gap away however wide the box is, with what they come to under them; in a narrower box
  the fields come first, then the plan. The order in the page itself is always
  portfolio, fields, plan. Each verb in that line wears the colour of its mark in the lines under it (BUY in the
  green of the DIP BUY mark, what has to be put right first in amber). The line about what changed since the last day
  is quiet on a day nothing changed and firm on a day something did.

- **The bar across the top** holds what is about the whole page: the app's name (the page's one top heading), the two
  views, how fresh the prices are ("Prices as of ...") and "Reload prices". The bar belongs to the frame
  (`src/app/layouts/full/`) and the prices to the page, so they talk through `PriceStatusService`
  (`src/app/watchlist/price-status.service.ts`): the page says how many lists are loading and when the newest price is
  from, and the bar asks for a reload. When a reload fails, the bar says so in place of the quiet time ("Prices could
  not be reloaded. Showing those of Nov 25, 08:33 PM.") and its button reads "Try again": the prices already on the
  page stay, and a reload that failed and said nothing left them looking fresh. While prices that are already on
  the page load again, the plan, the "to do" on the portfolios' buttons, the rows of "Could add" and any form that
  is open stay where they are (every list keeps its old rows until its new ones arrive, so the plan is complete all
  the way through); only the first load of the page shows "Working it out from today's prices.", and then in "What
  you own" too: its worth, its "% of total" and its cases are not worked out from the stocks priced so far. Beside
  "Prices as of ..." the bar says when the prices were last loaded ("· checked 11:41 PM"): outside market hours a
  reload brings the same prices, and nothing else would show that it happened. The first stop of the Tab key is
  "Skip to the page", which shows only while it has the keyboard, and each view has its own name in the browser's
  tab ("Portfolio · Stock Screener", "Watchlist · Stock Screener").
- **A control stands with what it changes.** Cash and "Most I can lose on one stock" are in the box of the portfolio
  they belong to, with what the limit comes to under them. An entry that cannot be right (cash below zero; a limit of
  zero, less, or more than 100) is not saved: the field goes back to what it held and a line under it says why.
- **A stock is named in words, without taking room.** The company's name shows when a symbol is pointed at (in the
  lists, in the table of "Dip candidates" and in "What you own", with its sector and industry),
  and a stock's details start with the company's name, its sector and its industry. The rows stay one line.
- **"What you own" shows the columns a decision rests on**: Stock, Plan, Held, Value, % of total, Result, Market
  since, Bad case, Typical, Good case. "All columns" adds how each stock was bought (shares, price paid, price now, the day),
  its mark, and the button that removes it; the choice is the same one as above the lists and is remembered with it.
  What the two cases of the marked stocks add up to if they all come true is a row at the foot of the table
  ("Both marked DIP BUY at once · bad case 7.4% of this portfolio", then the two sums under their columns), from
  two marked stocks on. A stock without a purchase date says "add date" where its weeks would stand. Under the
  table one line says how a purchase or a sale is told to the page ("Bought or sold? Click the stock's symbol
  here to record it; a first purchase is recorded with "Add" in "Could add"."). Under the fields stand figures
  with their names, for what the fields
  do not show: what the portfolio is worth with its cash and how much of it is cash, the limit in dollars, the
  share kept outside stocks in dollars with whether the cash covers it, and, with a level picked for taking a
  profit, both sides of that level in its test. Beside the headline of "What you own" the comparison with the
  market is two such figures ("Against the market  $383 ahead", "Money in for  18 weeks: too early to mean
  much"); while no stock has a purchase date the first says "needs a purchase date".
- **A list shows what a mark rests on, a line a stock**: Stock, Group, Mark · dropped, "AI · not tested" (beside
  the mark at the owner's word, its word set small and quiet so that it does not read as a second mark), Price,
  Growing, Next results, Swings, Past year. (One fact has one name on the page: "Dropped",
  "Growing" and "Swings" are the headings of "Dip candidates" and "Could add" too, and the rows of a stock's
  details; a stock without a mark is "NO MARK" in its row, in the legend and in its details, with the reason
  beside it.) Every list has those columns at the same places, so a column can be read down the page. The nine
  shares are measured so that no cell is cut where two lists stand side by side on a 2560px monitor, also once
  the window's own scroll bar has taken its 15px; in a window of about 1100px the lists show eight of them:
  "Past year", the one that is context, gives way there and stays under "All columns". "All columns"
  adds the rest (the analysts' target, the range of the past year, valuation and the other context) and, over each
  list, its typical price changes (the middle stock of the list for each period, which one stock with an extreme
  year does not pull). In the key columns colour is for the mark and what it rests on (the mark itself, growth
  that passes, results that are due soon, a price that swings a lot). With "All columns" the owner asked for the
  colours of the trade back (2026-11-26), after they had been taken out as context no test used: a price change
  of a period (the day, 1W to Past year, and a list's typical changes) is green for a rise and red for a fall;
  "vs 200D" is green while the trend holds and red when it is broken, with its arrow green or red by the way the
  average goes; "Holders in profit" is teal for what was bought below today's price and orange for what was
  bought above it; "Analyst rating" runs from red (Sell) to green (Strong Buy), the word in the colour of its
  side. Each still carries its sign or its word, so no meaning rests on colour alone, and the tooltips still say
  which of them made no difference in tests. "EPS (TTM)", a result that beat or missed and high debt stay in
  plain ink (high debt in bold).
  With every column a row is still one line tall (36px; it was 79px): the cells that stood in two or three lines
  ("Analyst target", "vs 200D", "Holders in profit", "Analyst rating") show their main figure, and the rest is in
  the explanation under the pointer. "Inst. ownership" stands right after "Analyst rating". With every column a
  list is wider than any window and scrolls sideways under its pinned columns: each column then has the same least
  width in every list, so "Price" still starts at the same place all the way down the page, and the pinned column
  on a side casts a shadow only while columns are out of sight on that side. The two small charts of that view
  (the split of analysts' ratings, where a stock's owners bought) tell their parts apart by how dark they are, in
  the page's grey, not in green, red and orange.
- **A stock is found by typing.** "Find a stock" in the line of "Your lists" takes a symbol or a part of a company's
  name; Enter opens that stock's row, as a click on a candidate does, and the "/" key puts the keyboard into the
  field. It looks among the stocks already in the lists (`src/app/watchlist/find-stock.ts`); when none fits, a
  sentence beside the field says so, and when what was typed fits several stocks equally the first from A to Z
  opens and the others are named there.
- **The table of "Dip candidates" can be put away.** "Hide the table" at the end of the title's line leaves the
  box's three lines (the three marks with how many stocks carry each, the market and how fearful it is, the tested
  figures with their risk) and "How to read this"; the lists then begin right under them. On a day with twenty
  marks the table is a screen tall. "Show the table" brings it back as it was (an open row is still open); the
  choice is kept in this browser. Until the reader has chosen, the table is shown, in a window of any width. From
  2240px two lists stand side by side under the box while they show their key columns, so the seven lists take
  four rows.
- **Signal before sentences on the Watchlist** (the owner, of a page where every explanation already showed only
  its first sentence: "there is too much text and not much signal"). A box shows its title, its marks, figures or
  table, and at most one sentence; what explains how to read it is behind one control a box, "How to read this",
  closed until asked for and remembered in this browser. Nothing was deleted: the sentences are behind that
  control or behind a "more", whole. In "Dip candidates" the three marks are one line of marks with their counts
  ("DIP BUY 7", and "no mark 2" beside them), and what a mark means is said on the mark, where the pointer rests
  or the Tab key lands; the tested result is four numbers under one quiet line (a stock with the mark on average,
  the typical one, any stock that dropped, the market), the typical one beside the average so the average does
  not stand alone.
- **Signal before sentences on the Portfolio view** (the same remark of the owner, made about this view with
  two pictures of it). By the same rules: a box shows its title, its figures and its table, and one sentence, which
  says what to do next. What was a sentence with a number in it is a figure with its name (`dl.facts`): beside the
  headline of "What you own", under the fields, and for the answer to a tick in "Could add" ("Room for the 2
  ticked $9,539 · Cash to split $1,500 · Stocks you own 5 today, 7 after · Bad half-year, every marked stock at once
  −$2,916 today, −$3,531 after · Moved together ACME and BOLT (group A)"; the first was "Short of their shares",
  which beside a stock read as shares of stock). Each figure has the sentence it comes
  from where the pointer rests on it. "Could add" says beside its title how many stocks it lists and that the page
  ranks none of them ("16 stocks marked DIP BUY, not in Brokerage yet · not ranked"), and keeps one instruction
  ("Tick stocks to split your cash ($1,500) between them."); what the plan's sale would free is a figure with the
  box that counts it. Everything that explains a box is behind one control a box, closed until asked for and
  remembered in this browser: "How to read this box" at the foot of the plan's box, "How to read this table"
  under "Could add". Opened, the explanations are whole (no "more" inside) and run in columns where the box is
  wide. "How the plan was tested" is all explanation, so it is its title and one control ("The plan in full, its
  tests, and the reasons of today's steps") until it is asked for; the plan's last line, "How it was tested",
  scrolls to it and opens it. Nothing was deleted: with everything closed the view has about 190 words in sight
  outside its tables where it had about 730 (a made-up portfolio of five stocks, two rows ticked), and it is
  470px shorter in a 2000px window. The room the answer to a tick takes is kept free, so a tick still moves no
  table; in a window of 1,100px the table of "Could add" no longer runs past its box (the reserve of its cash
  column is kept only from a box 1,200px wide, and under that its cells stand 8px apart).
- **What a review of both views found on the Portfolio view, and what was done** (2026-11-26). The plan's lines
  built the verbs of "To do today" anew on every key press: they are known again from one look to the next, and a
  measurement of twelve presses of the Tab key now counts no node built anew in that box. With "All columns", the
  table of "What you own" was 1,323px in the box of 1,196px that it has beside "Could add" on a 2560 window, and
  "Bought" and the remove button were cut off: in a box under 1,340px its cells stand closer and the few words
  under the weeks may take two lines, and it is 1,157px there (in a 1,100px window fifteen columns still scroll
  inside their block). Opened by the plan's "How it was tested", the box at the foot of the page is brought to
  the top of the window again once it has its new height. The headings "Sector (you own)" and "Moves with yours"
  say what they are where the pointer rests or the Tab key lands, as the other headings do; the few words under
  the weeks held ("DIP BUY today: counts from today") have their sentence where the pointer rests. The line
  YOUR LIMIT names its field and starts with what to do ("Set "Most I can lose on one stock": until then the plan
  assumes $4,000.").
- **The case against a stock, where the reader chooses** (the owner, 2026-11-26: "I need the risk analysis to be
  surfaced ... Also there should be some sort of way of comparing them against each other"). "Could add" has two
  more columns, "Swings" and "Against" (the table above), which the rows can be ordered by like any other; and
  once a row is ticked, a block under the table sets the ticked stocks side by side, a column a stock and a row a
  fact, in three parts: what was tested, the context no test could use, and why the price dropped. A row in which
  every stock says the same steps back. It stands under the table so that a tick moves no row, shows figures and
  names with the sentences at the pointer, and marks no column as the better one: the page still ranks nothing and
  names no pick. The table then has seventeen columns, and its figures grow with the portfolio, so one column
  gives way before "Add" is cut off at the right: a sector may take a second line, at any width, when the table
  would otherwise be wider than its box. In a window of about 1,100px the figures are a size smaller, "Against"
  shows how many things there are, and the size may break between its parts.
- **Four points of a second review, by the owner's "go"** (2026-11-26). The plan's GOOD TIME line is the
  Watchlist's line of the same fact, with its reading, its two figures and its risk; it said "The market is
  fearful now. In the past, that was the better time to buy.", with none of them. YOUR CALL has both results where
  it said "After that the tests disagree.": it is the one decision left to the reader, and had the least to go
  on. These two lines are longer than the 80 characters of the others. In "How the plan was tested", what shows of
  a step is the first sentence of its reason: for every step that rests on a test, that sentence is now what the
  test found, figures included (six began with a set-up, and the box cuts a long first sentence at its colon, which
  hid the figures of two more). And the sentence under a mark's pointer names the test its figures are from
  ("Over all 994 test stocks, ..."): it quotes every tested list together, while the strip of tested figures on
  both views quotes the newest one, and "In tests, ..." beside it read as a second answer to one question. The BUY
  line stays as it was: a line with amounts would put an untested split of the cash into the plan's own words.
- **Three faults a third fresh review found on the Portfolio view** (2026-11-26). The room kept for the answer to
  a tick was an empty band of 80 to 110px above the table of "Could add": the instruction now stands in that
  room while nothing is ticked, and the answer takes its place (the table still does not move). "What you own"
  with every column was 132px wider than its box in a window of about 1,100px, with "Bought" and the remove
  button off the edge: in a box under 1,100px that table is set a size smaller, a stock's mark stands under its
  symbol and the result in percent under the result in dollars, and between 1,100 and 1,400px the amount beside
  the plan's word may stand under it. And the arrow of the sorted column reached into the next heading where the
  cells stand 8px apart: it is smaller there.
- **Six points the owner said yes to** (2026-11-26: "do all 6"). A "Typical" figure stands between "Bad case" and
  "Good case" in both tables, with a sum of its own in the row at the foot of "What you own". The plan's box shows
  the strip of tested figures in place of its sentence (above). While something is ticked in "Could add", the
  answer to the tick stays under the page's bar as the table is scrolled (in a box 1000px wide or more; in a
  narrower one it would cover the table). The three cases of a ticked row that gets an amount are worked out for
  that amount, set a little firmer, and say so where the pointer rests ("On the $750 the money would buy, that
  would be the amount shown."). How far the stocks are one bet stands beside the headline of "What you own" as
  figures ("Most money in  Technology, 85%", "Moved like  about 2 separate bets", "Swung  about 1.9 times as
  much as the market"), the sentences where the pointer rests and behind "How to read this box". And one quiet
  line under each of the two tables says when the cases were tested: "Bad, typical and good case: tested in
  2022–2026, when the market was rising. In a falling market they can be worse.".
- **A stock's details are three columns, a column a subject**, where the list is 1280px wide or more (two in a
  narrower list, with the reader's stake on the right): what the mark rests on, what is risky about this one
  stock and "The business"; why its price dropped, then the AI's own view of it ("AI view · not tested"); your
  stake in it ("What you own of it", which names the portfolio when there is more than one, under a stock that
  is held). A stock that is not held has no third column: in a wide list its two columns stand where they stand
  under every other stock, and in a narrower one why it dropped stands on the right. The sentences that say a
  figure in words open together, with one control at the head of the details ("Read these details in
  sentences"), and stay open under every stock once asked for; a row opened near the foot of the window brings
  its details into the window. What the mark rests on is a row a fact: its name, its figure, and a tick where
  it is enough for DIP BUY ("Dropped  20.0% below its highest price of the past year · DIP BUY needs 15% or
  more"), so a WATCH or a PASS shows at a glance which of the two it is short of; a third row says since when the
  stock has the mark. The sentence that says the same in words is behind "more" at the heading, and each line
  about risk shows its first sentence. The rule (what the tests say, and what they found about selling after you
  buy) reads the same under every stock with that mark: it is one line across the foot of the details, closed
  until asked for. The context is said in everyday words ("the price is 38 times the yearly profit per share
  (P/E)", "cannot be tested", "made no difference in tests"), and its "+" and "−" markers have no green or red:
  they are not points awarded by a test.
- **"The business" is in a stock's details, as context.** Under "Why it dropped", in the column that is about
  the company itself, a section says what the data source (MSN) already sends about it, a row a figure: "Keeps of
  its sales  62% · its industry 48%" (gross margin: what is left of sales after the direct costs) and "Earns on
  money invested  19% · its industry 9%" (return on capital), both averages of the last 5 years. The names of the
  rows are short because the column can be 380px wide: longer ones broke each figure over two lines. Beside its
  title stands "context, not part of the mark", the page's words for what no test used, and no row has a tick, a
  sign or a colour: nothing here was tested, so no figure is called good or bad. The sentences open with "Read
  these details in sentences": what the company does, in the data source's words; the companies the data source
  lists beside this one, by name ("Similar companies, as the data source lists them: Bolt Works Inc (BOLT), Chip
  Foundry Corp (CHIP), and 3 more.": eight at most); how to read the two figures; and that the data source gives
  no market share and does not say how it picks the similar companies. Those companies were a row of symbols
  first; the list is loose, and the owner chose to have it in the sentences and not in sight. Nothing is fetched
  for the section: it all arrives with the request the page already makes. A fund, or a company the data source
  gives no figure for, has no such section.
- **The layout is checked at six window widths** (2560, 1920, 1707, 1440, 1280 and 1100px), each view as opened
  and with a stock's details open or rows ticked: the page must not scroll sideways, no box may scroll sideways
  inside, and no sentence may be squeezed to a word a line. A sentence never stands in a block that is as wide as
  its content (a table's own block): one such sentence once made "Dip candidates" as wide as itself and squeezed
  the column beside it.
- **And with a real pointer and real keys.** At the same three sizes a check clicks a symbol and a tick box the
  way a hand does (pressed, then released), presses the Tab key twelve times on each view, and counts what the
  page builds anew meanwhile: twelve different stops, and nothing built anew but a tooltip. A click made by a
  script cannot be lost; a real one was, where "Dip candidates" shows two tables side by side: the two halves were
  cut anew every time the page checked itself, so both tables were rebuilt under the pointer and under the
  keyboard. A list that a loop goes over is kept until what it is made from changes, and the loop says how to
  tell its items apart.
- **Gains never stand without their risk in the same sight.** The tested figures of "Dip candidates" are five: a
  stock with the mark on average, the typical one, any stock that dropped, the market, and how many stocks with
  the mark fell a further 20% first; a line under them says what "typical" is and which years were tested. In a
  stock's details "Risk of this stock" is two figures under every stock marked DIP BUY (how much its price swings
  in a year, and how many such stocks fell a further 20% within 13 weeks of the mark, with the other group's
  figure beside it); the sentence that says them is behind "more". For a stock that is held, "What you own of it"
  is rows of a name and a figure (holding, worth now, held, share, then the bad, the typical and the good
  half-year together), the bad one first; the sentences and what the tests cover are behind "more" at the
  heading.
- **What the marks mean is the first thing behind "How to read this"** in "Dip candidates", so a reader without
  a pointer finds it; the marks in the line above carry the dotted line of everything that says more when
  pointed at. The lists' heading "Mark · dropped" names the figure that stands beside each mark. The marks stand on
  the line of the box's title, and the tested figures run in one line under the line about the market, with the
  two controls ("How to read this", "Groups") together at its end; what a control opens stands under that line, as
  wide as the box, the sentences in columns of a readable width.
- **The plan's BUY line leads to "Could add"**: the box's name in the sentence is a jump to it.
- **Looking a stock up does not cost the reader their place.** A stock opened from the Portfolio view shows its
  details on the Watchlist with a link "Back to your plan" beside the company's name; the link, and the browser's
  Back, return to where the reader was. At the foot of a stock's details "Close these details" closes them and
  brings their row back into view. The Esc key does the same while the keyboard is inside the details, and is
  Cancel in every small form (a form inside the details takes the first press) and "Done" in a list's editor.
- **A purchase is recorded where the stock is listed.** Every row of "Could add" ends in "Add": it opens a form
  under that row, filled in with the row's amount at today's price (the size of the row, or what the cash gives
  the stock once the row is ticked) as shares, that price and today. Every field can be changed to what was really
  bought; the form says what the numbers come to before anything is saved, and for a stock that is held it adds
  the purchase to the holding. It records a purchase that was made and places no order
  (`src/app/watchlist/purchase-form/`), and it says so, because a form with a quantity, a price and a total looks
  like an order ticket: its first line is "This records a purchase you have made. Nothing is bought here.", its
  button is "Record this purchase", and "Add" says the same where the pointer rests on it and to a screen reader. Its box for the cash is ticked only when the cash recorded covers the
  amount filled in, so the form can always be saved as it arrives.
- **Several purchases are recorded in one step.** With two or more rows of "Could add" ticked, the foot of the
  table offers "Add the N ticked": one form with a line for each ticked stock (shares, price paid, what the two
  come to), filled in with what the cash gives each at today's price, one day and one box for the cash. A stock
  whose shares are emptied is left out. The shares a form starts from are rounded down to four decimals, so what
  it comes to is never more than the cash it was filled in from, and its box for the cash arrives ticked. The
  holdings and the cash are saved together; one sentence names what was
  recorded ("Recorded 3 purchases: ACME, ZED and TOOL. Cash is now $1,950.") and one Undo takes them all back
  (`src/app/watchlist/purchases-form/`).
- **Numbers stand under one another.** Every table, and every field a number is typed into, is set in a face whose
  digits have one width (`--font-figures` in `src/styles.scss`: the system's own, Segoe UI on Windows). The page's
  face for sentences and headings has no such digits ("1111" was half as wide as "8888"), so amounts in a column
  set to the right did not line up.
- **Every form that records a purchase behaves the same.** One name on its button ("Record this purchase": in a row
  of "Could add", after "Bought more", and for a stock that is not held yet), and one rule for the box "Paid from
  this portfolio's cash": it is ticked while the cash recorded covers what is entered and follows the numbers as
  they are typed, until the reader sets it. When the cash is short the form says so and leaves the cash alone ("It
  is more than the $40 of cash recorded, so the cash is left as it is."); it refuses only a purchase the reader
  ticked to be paid from more cash than there is (`coveredByCash`, `leftAsItIs` in `purchase-words.ts`).
- **The forms in a stock's details say what the forms in "Could add" say**: the sum first ("That is $1,800. You
  would then hold 40 shares at an average price of 70.00."), a question when the price paid today is far from
  today's price, and the sentence about the share kept outside stocks. "Sold some" arrives filled in for a stock
  that is over the limit, with the shares that bring it down to what fits ("Filled in from your limit: selling
  38.3198 shares at today's price leaves $1,951 of it, the most that fits."): the plan gives that amount in
  dollars, and the sum in shares was left to the reader.
- **A reload does not close what is open.** A list's rows are the same rows after a reload of prices (the table
  follows each stock by its symbol), so the details open under a row, and a purchase half typed in them, stay.
- **The answer to a tick is in sight.** In "Could add" what the ticked purchase would do stands above the table,
  under the instruction and across the box: the title "With your cash" with "Add the N ticked" and "Untick all",
  then figures with their names (see "Signal before sentences on the Portfolio view"). It is what a screen
  reader hears after a tick. The room it takes is kept free before anything is ticked, so a tick never moves the
  table down (in a narrow box, a phone, it does, by its own height); and the column "With your cash" is in the
  table from the start, empty until a row is ticked, so a tick does not move the other columns sideways either.
- **The page keeps its place while it loads.** While the first prices arrive "What you own" holds the room its
  table will take (a row a holding), the plan and "Could add" hold theirs, and "How the plan was tested" is not
  shown: it used to stand in the first screen for a few seconds and then drop by hundreds of pixels.
- **A stock has an address.** With a stock's details open on the Watchlist the address is
  `/watchlist?stock=ACME`: a reload of the page, or a bookmark, comes back to the stock with its details open.
  It is written in place of the address that was there, so the browser's Back still leaves the Watchlist in one
  step. A stock that is in no list opens nothing, and the line beside "Find a stock" says so.
- **A form's own button is its main action.** "Record this purchase", "Record this sale", "Save", "Add list" and
  the like are filled in the page's blue, "Cancel" beside them is plain, and the buttons that only open
  something ("Add", "Bought more") are outlined. A row's purchase form in "Could add" comes back as it was left
  when another row's form was opened in between; Cancel starts it again from the row.
- **An explanation shows its first sentence; "more" opens the rest.** The owner's choice (2026-11-26): the page
  was to be taken in, not read at length. With everything closed the Portfolio view had about 520 words of prose
  in sight where it had about 1,830. (Later the same day the owner found that still too much text: on the
  Portfolio view the first sentences went behind one control a box, see "Signal before sentences on the Portfolio
  view". "more" is left there inside "How the plan was tested", once that box is opened.) What is shortened is
  explanation: the lead of "Could add", its worked example and the notes about its columns; what the two "case"
  columns are and how alike the holdings move; what a share kept outside stocks and a level for taking a profit
  come to; each verb of "How the plan was tested" and how the plan did; how stocks marked DIP BUY did (under "Dip
  candidates"); and in a stock's details the test results after the first sentence of "Why ...", the context
  that is not part of the mark, and the part that is the same under every stock. The answer is never shortened:
  the plan's lines, every figure, the reader's own results, the bad and the good case in dollars, what a form
  says. No word is deleted or changed for it: the whole text stays in the page (`app-more` hides what follows
  the first sentence, `appMoreRest` the paragraphs and lists that belong to it), so the wording tests read what
  they always read. What was opened is kept in this browser (`explanations.open`), and an explanation that is
  the same under every stock is then open under every stock. A second sentence of a few words stays in sight
  with the first.
- **A day the data does not arrive is said where the reader looks.** When not one price loads, the plan box says
  "Today's prices could not be loaded: the data source did not answer. Without them there is no plan to show." with
  "Try again", "Could add" says the same, and "What you own" lists the holdings from what is recorded (no worth, no
  limit in dollars: the cash alone is not called the portfolio). The boxes used to stay on "Working it out from
  today's prices." for good, with the failure said only in the bar. When the database does not answer and this
  browser holds nothing of its own, the plan box says that the saved portfolios could not be read, and how to start
  the app: it does not read like a first run.
- **The forms agree with one another.** In every purchase form the box about the cash and the sum stand before the
  buttons, on the screen and for the Tab key. "Sold some" asks about a price a fifth or more from today's, as the
  purchase forms do. A price filled in by the page keeps its cents ("70.10", not "70.1"). The fields of the plan
  box wait until the saved portfolios have been read. Esc closes a stock's details also after a click inside them.
- **A purchase form says which portfolio it records into.** The forms in "Could add" say it in their first line
  ("This records a purchase you have made in Savings. Nothing is bought here.") and in the box about the cash
  ("Paid from the cash of Savings ($5,000)"): with several portfolios the name on the page can be scrolled out of
  sight. The form for the ticked stocks stays open, with what was typed, when a row is unticked while it is being
  filled in.
- **One answer to a tick, and a way past the tables.** "Add the N ticked" is one button, with the answer to a
  tick; the form it opens stands at the foot of the table, and Cancel puts the keyboard back on the button.
  For the Tab key a link in front of the table of "Could add" and in front of each list ("Skip the table of 17
  stocks", "Skip the list Tech") leads past it; it is out of sight until it has the keyboard. "/" on the Portfolio
  view leads to "Find a stock" on the Watchlist. With the details of two or more stocks open, the line of "Your
  lists" offers "Close all N open details"; Esc on a row's own button closes its details.
- **"How the plan was tested" runs across the window** from 2500px, under both columns: in the left half only it
  was a column 1,400px tall beside an empty half of the page. THE PLAN stands across the box by itself, its
  account in as many columns as fit (three at most) beside the one heading, each column starting where the text
  of the reason under it starts; the reasons of today's steps follow in a grid of their own, in the plan's order
  across and then down. Opening one of them makes its own row taller
  and moves nothing sideways (in one list of balanced columns, opening anything re-flowed them all). "less"
  stands at the end of the first paragraph and again at the end of the last, and pressing the second one puts the
  keyboard back on the first. A stock's details are set in
  the page's own face, like every other paragraph, and say once what the "+" and "−" in front of their context
  lines mean.
- **The lists are ordered together, and like "What you own".** A click on a heading in one list orders every
  list by that column (as "Key columns / All columns" is one choice for all of them), and a list shown later
  starts the same way. The first click puts the biggest first for a number, A first for a name and the soonest
  first for a date; the column the rows follow carries the same small triangle as in "What you own" (Material's
  own arrow is not drawn). A stock opened from the plan, from the address or with "Find a stock" opens in its own
  list (not in the table of "Dip candidates", where a marked stock has a second row) and comes into view with its
  list's name and column heads, not at the top of the window with its figures bare. Funds are counted in words in a
  list's line ("3 funds").
- **The plan comes before its numbers in the page too**, as it does on the screen: the Tab key goes from the
  portfolios to the plan and then to cash and the limit, and a screen reader hears "To do today" first. What a
  field is shows above it while it has the keyboard, not over the sentence under it. On the Watchlist a list's
  table carries the list's name for a screen reader, and one minus sign (the true one) is used in every column.
- **The keyboard is never left on nothing.** After Cancel or Esc in a form, and after "Keep it", it goes back to
  the button that opened the form ("Add", "Add the N ticked", "Bought more", "Sold some", "Edit", "New portfolio",
  "Rename", "Delete", "New list", a list's "Edit list"); "Edit" puts it into the first field. In the lists the
  button at the end of a row, the row's one tab stop, says which company the row is.
- **A slip is caught while it is typed.** In every form that records a purchase or a sale, a problem is said as soon
  as a field was changed (an empty field, more than the cash recorded), not only after the button. The forms in
  "Could add" also point out, in the orange of a warning, what looks like a digit too many or too few: a price paid
  today that is 20% or more from today's price, and an amount of twice the row's or more ("The price paid is 900%
  above today's price of 50.00. ... Check the numbers before you record it."). That is a question, not a refusal:
  the purchase can still be recorded (`src/app/watchlist/purchase-words.ts`). In the same way they say when a
  purchase paid from the cash would take the cash under the share you keep outside stocks ("After this purchase
  your cash would be $1,200: $800 under the $2,000 you keep outside stocks."): your own number, said before you
  save, and nothing is refused.
- **A purchase or a sale is recorded as it happened.** For a stock that is held, "What you own of it" offers
  "Bought more" (this purchase only: shares, price, day) and "Sold some" (the shares sold) before "Edit" and
  "Remove". The page says what the holding would then be before anything is saved, and works out the new number of
  shares and the new average price (`withPurchase` and `afterSale` in `src/app/watchlist/positions.ts`). Selling
  every share takes the stock out. "Edit" is for correcting what is recorded.
- **A trade is recorded with its money.** When the portfolio has cash recorded, the form has a box "Paid from this
  portfolio's cash" (for a sale: "The money went to this portfolio's cash", with the price sold at), ticked to
  start with, and says before saving what the cash would then be. Without it the money of a purchase would be
  counted twice, as the stock and as cash, and every size in the plan would be too large. A purchase that cost
  more than the cash recorded is refused with the two ways on (untick the box, or correct "Cash" first). The holding
  and the cash are saved in one step; a sentence then says what was recorded ("Bought 30 more shares of ACME at
  60.00. Cash is now $3,200."), and its Undo takes both back. A first purchase, recorded with "Add" in "Could
  add", works the same way; "Edit" never touches the cash, and what it replaced can be taken back too ("ACME is
  now recorded as 12.5 shares at 96.00.", with Undo).
- **A message with "Undo"** (a list or a stock removed, a holding removed or a trade recorded on the Watchlist, a
  purchase added in "Could add" while the plan box with its notice is out of sight) stays for 30 seconds.
- **Deleting a portfolio is asked about once.** "Delete" turns into a question in place, naming what goes ("Delete
  "Savings" with its 6 stocks?"), with "Keep it" first and under the keyboard, then "Delete it". It is the one act
  on the page that takes a whole account's holdings, and its Undo is gone at the next change.
- **The live record says the middle stock.** The line under "Dip candidates" ("Since Nov 21 this page has flagged
  21 DIP BUYs: the typical one is +2.1% so far, against ...") gives the middle return, not the average: one stock
  whose first recorded price was wrong moved the average of twenty by many points. A change that rounds to nothing
  is "0.0%", never "-0.0%".
- **What a row's numbers mean can be reached with the keyboard.** In "What you own" and in "Could add" the cells
  of a row explain themselves where the pointer rests (the plan's sentence, where a bad and a good case come from,
  how a size was worked out). A cell cannot take the keyboard, and the stock is the row's one tab stop: reached with
  the Tab key, the stock shows the company's name and then what the cells of its row say, under the name of each
  column, in a box that opens above the row. In "Could add" that is what differs from row to row (how far it
  dropped, how it grows, the two pieces of context, how it moves with what you own); how a size and the two cases
  are worked out is said in words under the table. Under the pointer the stock shows the name alone, as before.
- **A stock's name opens its details everywhere**: in "What you own", in "Could add", in "Dip candidates" and in the
  lists. On the Watchlist a click anywhere on a row does the same, in place. On the Portfolio view only the name
  does, because opening a stock leaves that view: a row of "Could add" has a box to tick and a button, and a click
  that missed one of them used to take the reader away. Coming back ("Back to your plan", or the browser's Back)
  returns the reader to where they were, with the keyboard on the stock they left by. The stock's page at the data source is a link inside the
  details and opens in a new tab.
- **"Dip candidates" says which of its stocks move together.** The sentence "owning all 9 is nearer to one big
  bet than to 9 separate ones" could not be used without knowing which stocks are tied (the owner: "I can't
  leverage it since I don't know what stocks move together"). Both are behind the control "Groups" in the box,
  closed until asked for and remembered: the sentence, and under it "Which of them move together", a line a group:
  a letter, its stocks, how many they are and the sector they share ("A · ACME, BOLT, CHIP · 3 stocks, mostly
  Technology"), and last the stocks that moved with none of the others. Each row of the table
  carries its group's letter in a column "Group", with a dot of the group's colour in front of it (a dash for a
  stock on its own); where the pointer rests on it, it says with which stocks it moved and how closely. A group is
  a set of stocks whose daily price changes moved closely together over the past year: groups are joined, the
  closest two first, while the average between their stocks is 0.5 or more (the mark the page uses for "closely"
  everywhere), so a chain of pairs does not make one group by itself (`tied-groups.ts`). The three group colours
  stay apart for every pair, also for a reader who does not tell red from green, and are none of the page's
  green, red or amber; a fourth group wears grey, and the letter always says which group. It is a fact about the
  past year, not a tested reason to pick, and the note under the list says so: whether spreading a purchase over
  groups lowers the risk was not tested. Nothing is ranked by it.
- **The group letter is in every table, under one grouping for the whole page** (the owner: "add the group
  everywhere so that I can see"): the lists, "Dip candidates", "What you own" and "Could add" each have a column
  "Group", and a letter means the same group in all of them. A table that shows only some of a group's stocks
  says how many the group has and names the others ("1 of the group's 3 stocks: with ACME and CHIP"), so a letter
  never stands for stocks the reader cannot find. In "Could add", once two or more rows are ticked, one of the
  figures of the answer says whether they move together ("Moved together  ACME and BOLT (group A)", or "none of
  the 2"); the sentence is where the pointer rests on it and with the box's explanations.
- **Every table's rows can be ordered by its columns** (the owner: "all tables must have sortable columns"). A
  click on a heading orders the rows by that column, the biggest first for a number and A first for a name or a
  group; a second click turns the order round; the column the rows follow carries a small triangle. In the lists
  a click in one list orders them all. "Dip candidates" and "Could add" still open A to Z and the page orders
  nothing before the reader clicks: an order is the reader's own view, and the page ranks no stock.
- **On the Watchlist "held" means held in any portfolio**, and the tag says in which ("You hold this in Savings
  and Brokerage.", also in the stock's mouse-over and in what its row says to the keyboard). It used to follow
  the portfolio last chosen on the other view (the owner: "mapping to a random portfolio is odd"). In a stock's
  details a small row "Record in" chooses, right there, which portfolio its forms are about. The row stands only
  under a stock that some portfolio holds; where the portfolio being shown holds none of it, the row says which
  one does ("You hold this in Savings.") and a click on that name shows the holding.
- **A stock's details say nothing about a stake there is none of.** Under a stock without the mark stood "Where
  it fits" over "No size: it is not marked DIP BUY.", and under a stock that is not held "What you own of it" over
  "Not in this portfolio." and a button "Enter what you hold", which opened a form for a first entry. The owner,
  with a picture of the three: "remove that - I don't need it there"; asked how much of it, they chose "only when
  it is empty". So "What you own of it" is under a stock that is held only, and the first-entry form is gone with
  its button. ("Where it fits" stayed under a stock marked DIP BUY for a few hours more; then the owner had it
  taken out of the app: "remove the where it fits from the app - it should not be in the watchlist".) A first purchase is recorded with "Add" in
  "Could add", which lists the stocks marked DIP BUY. What is given up, and was said with the choice: a holding of
  a stock without the mark that was never recorded can no longer be typed in on the page ("Import" at the foot of
  the plan box replaces every portfolio at once).
- **Small things.** "Delete list" in a list's editor asks in place, the
  answer that keeps the list first, as deleting a portfolio does. An address that is no page of the app leads to
  the Portfolio view. On a day no price arrives the Watchlist says so once above its lists.
- **"Dip candidates" is a table across the top of the Watchlist, built like the lists' tables** (the owner, of the
  box as a pane beside the lists with a small table of its own and paragraphs about it: "maybe that can be a table
  on the top where it becomes a table like the other ones but more polished in terms of prose"). The box
  (`src/app/watchlist/dip-candidates/`) is the table's frame, three short lines: the title with the marks' counts
  and the stocks marked today ("New today: AMD, ARM"); the market; the tested figures. Under them the page hands
  in the lists' own table with the stocks marked DIP BUY, A to Z: the lists' columns (key or all, by the one
  choice above the lists), the AI's column with "Ask AI about these" on the title's line, a stock's details opened
  where its row stands, and one more column, "List", that says which of the reader's lists the stock is in (both,
  for a stock in two). The table has an order of its own: a click on one of its headings orders it alone, and the
  lists, which are ordered together, leave it as it is. A marked stock that is on the page only because it is held
  (outside every list) is in the table and not in the question to the AI. What the box used to say in sentences
  ("Click a stock for its details.", the paragraphs about the tests and the groups) is behind "How to read this"
  and "Groups"; the tag "new" of its old table is the names on the title's line.
- **What a column means** shows under the pointer and also when its heading is reached with the Tab key, in the lists
  and in "What you own"; what the Cash and the limit fields are shows while the field has the keyboard. Whatever has
  the keyboard shows a blue ring, Material's own buttons included.
- **Sizes and colours are named once**, in `src/styles.scss`: one scale of type by role (`--text-lead`, `--text-title`,
  `--text-heading`, `--text-body`, `--text-data`, `--text-meta`, `--text-micro`; nothing on the page is smaller than
  12px), a width for sentences (`--measure`) and the colours. A component uses those names, not its own numbers.
- **Nothing is said from half the prices.** While prices are arriving the plan, the limit in dollars, the share that
  is cash and "No price for ..." are not shown: each would be wrong for those seconds.

`PRODUCT.md` says who the page is for and what must hold when it is changed. It is the brief the Impeccable design
skill reads; nothing in the app depends on it.

## Your portfolio against the market

The tests of the plan ended on an open question: the plan made money on new stocks, but no more than the market. So
the one figure that says whether owning these stocks has paid off for you is what the same money would have made in
the market, and the page says it right under the "What you own" headline.

| What it does | How |
|---|---|
| Counts each purchase from its own day | What was paid for a stock, times what the market did since the day it was bought; the amounts are added up |
| Compares like with like | It counts the stocks that have a price today and a purchase day in the past year (the page loads one year of the market's prices). When that is not all of them, the line gives the result of the ones it counts ("For 2 of your 5 stocks: +$260 (+6.5%) since bought.") and says how many are left out ("Left out: 3 with no price today, no purchase date, or bought over a year ago.") |
| Says when it is too early | Until the money has been in for 6 months on average (each purchase weighted by what was paid), a second line says so: "Too early to mean much: on average this money has been in for 11 weeks. The tests looked at 6 months." |
| States the difference without judging it | "ahead of it", "behind it" or "level with it" |

It is a fact about what happened, not a tested signal: nothing in the plan depends on it. It counts only what is
owned now (a stock that was sold is not in the portfolio any more), and neither side counts dividends. The figures
and the sentences are in `src/app/watchlist/market-compare.ts`.

## What you record

- A position is a symbol, the number of shares, the average price paid and, optionally, the day it was bought. Without the day there is no time held and no comparison with the S&P 500 since the purchase.
- A position bought in several parts still has one day: the average day the money went in, each purchase weighted by what it cost. A small later purchase then moves the day a little instead of restarting the 6 months. "Bought more" in a stock's details applies this by itself; when the day of the holding or of the purchase is not known, the recorded day stays as it is.
- The portfolio value is worked out: the positions at today's prices plus the cash. Each stock's "% of total" and your limit are shares of it.
- The table shows "Market since", "Held" and "Bought" once at least one position has a purchase day; until then those columns would be empty, so they are left out.
- Under the "What you own" headline, one line sets the whole portfolio against the market: "The same money in the market on the same days: +$310 (+2.4%). Your stocks are $95 ahead of it." Each purchase is counted from its own day, as if that money had gone into the market instead. See "Your portfolio against the market" above.
- The table starts with the biggest holding first; a click on a column heading orders the rows by that column, and a second click turns them around.
- A holding that is in none of your lists gets a row in an extra list, "HELD, NOT IN A LIST", so it has a price and details to open.
- Of every save the version before is kept too. Export and Import at the bottom of the "Your plan today" box move all portfolios as one file.
- The page reads what is saved again whenever it comes back into view, so a change made in another tab, another browser or by the app's daily recording is picked up.
