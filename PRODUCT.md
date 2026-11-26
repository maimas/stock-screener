# Product

<!-- impeccable:product-schema 1 -->

Written from what the owner has said while the page was built and from the repository, without a separate
interview. A line marked (inferred) is a reading of that evidence, not the owner's own statement.

## Platform

web

## Users

One person at a time, on their own computer: someone who invests their own savings and is not an investing expert.
They open the page, usually once a day, to see what a tested plan says to do with each of their accounts today and
how what they own is doing. The owner's words for the reader: "non expert user", "a non professional user".

Friends who clone the repository run their own copy with their own data. (inferred: the same kind of reader, not a
second audience)

## Product Purpose

A stock screener that turns market data into a short plan for today: which stocks dropped while the business keeps
growing (the app marks them DIP BUY), how much of each fits the reader's own limit for a loss on one stock, what to
keep, and where the plan has no opinion. It succeeds when the reader understands what the page says, and why, without
knowing the trade's vocabulary. It gives no advice of its own and promises no result.

## Positioning

Every step the page states comes from a rule that passed a pre-registered test on stocks the rule was not found on,
and the page quotes that evidence with its caveats ("made money, but no more than the market"). Where the tests say
nothing, the page says so instead of guessing. It says how many stocks to hold, never which one to pick.

## Operating Context

- A local web app that runs in Docker on the reader's own computer (started with `docker compose up -d`, opened
  at port 4200) and is used in a desktop browser window that fills the monitor. `npm start` is only the
  development server (port 4201): it shows made-up lists and keeps nothing that is entered. The owner:
  "it's a web app - full screen". A laptop-sized window is the second size; a phone only has to keep working.
  (inferred: the order of those three)
- Two views of one page. Portfolio: "Your plan today" (a portfolio's cash and limit, the plan as lines, the table
  "What you own"), "Could add" (the stocks marked DIP BUY that the portfolio does not hold, each with a size) and
  "How the plan was tested". Watchlist: "Dip candidates" and "Your lists" (a table for each list; a row opens a
  stock's details).
- An explanation shows its first sentence, and "more" at its end opens the rest in place; the page remembers what
  was opened. The owner chose this on 2026-11-26, when reviews of the page said it was careful and correct but had
  to be read at length: "Short, full text on click", over keeping everything open. Nothing is deleted or reworded
  for it. The answer itself is never shortened: the plan's lines, the figures, the reader's own results, what a
  form says. (inferred: which blocks count as explanation)
- Under the "What you own" headline the page says what the same money would have made in the market on the same
  days, and how far the stocks are ahead of it or behind it. It is a fact about what happened, not a tested signal.
- In "Could add" the reader ticks the stocks they are thinking of buying, and the box splits the portfolio's cash
  between them and says what the purchase would change. The reader chooses which; the app says how much. The owner
  asked for suggestions that reduce risk and chose, with the tests' findings in front of them, that the app
  suggests selling only by their own limit. So the box says the sell side too: which stocks SELL SOME names and
  what selling them down to the limit would free, or that the plan asks to sell nothing; and the reader can have
  that freed money split together with the cash. Spending cash does not lower risk and must not be presented as if
  it did: it makes a purchase even by risk, and it raises what a bad half-year can cost in dollars, since cash
  cannot fall. The box says that sum before and after, also when a counted sale brings it down.
- The owner then asked how to spread the risk when the stocks held are alike and move together ("we are looking to
  reduce the risk and not to lose money"). The research found one counterweight that held in every fall of the
  market since 2000, cash, and that only shares of money are dependable: in one stock, in one kind of stock,
  outside stocks. So the page says how far the stocks are one bet (where the money is, how many separate bets,
  how much against the market) as facts, and "Keep outside stocks" is a second limit of the owner's own that the
  plan (HOLD BACK) and the split keep to. Neither names a stock to sell or to buy.
- The owner also asked the app to say when a position is "a sell opportunity". On the average, selling early paid
  less, twice; what taking a profit does to losses was then tested on the last unused stocks, with the rule and its
  consequence written down first. What passed (+15%, as a sell order and when seen) is offered as a level of the
  owner's own, empty until picked; the plan reports when a holding reaches it and gives the price of a sell order
  at it, with both sides of the test. KEEP stays what the tests found on average.
- Prices and company figures come from public data sources through the app's own server. Portfolios, lists and a
  daily log are kept in a database on the reader's computer, in a folder outside the project: nothing the reader
  records is in the repository.
- The daily log is written by the app itself, on weekdays, while it runs; it shows no notification. One scheduled
  job is left on the computer: it refreshes the tested numbers (the backtests) without the reader.
- The page can hand one job to Claude Code: reading the news about a stock's fall. Claude Code runs in a container
  of its own, signed in separately from the reader's own Claude Code, and can reach nothing but Anthropic.

## Capabilities and Constraints

- Angular 16 with Angular Material 16 and SCSS. The colour and type tokens are in `src/styles.scss`.
- The marks (DIP BUY, WATCH, PASS) and the plan's rules change only after a pre-registered out-of-sample test. Data
  that was not tested (analyst targets, trend, valuation) is shown as context only.
- No tested number is typed into the app: `npm run evidence` writes `src/app/watchlist/evidence.generated.ts`, and
  `evidence.ts` builds the sentences from it. Wording is fixed by golden-text tests: change the test first.
- A line of the plan is a verb and one sentence, with the stocks it is about and their amounts where it names any.
  Nothing on a line opens or expands. KEEP and NO OPINION are said in the rows of "What you own"; the stocks that
  could be bought are rows of "Could add". The evidence is in one box, "How the plan was tested".
- Sizes and amounts are shown whether or not the cash is there. The limit for a loss on one stock is the reader's
  own number (10% of the portfolio until they enter one); no size goes above what fits it. The one amount that
  does depend on the cash is the split in "Could add", which is a second number beside the size and never
  replaces it.
- The app ticks nothing, ranks nothing and has no "tick all". No step reduces a holding except SELL SOME.
  "Could add" repeats that step and adds no reason to sell of its own.
- The repository is shared: tests, comments and documents use made-up accounts and amounts only.

## Brand Commitments

- Name: Stock Screener.
- Voice: plain words for someone new to investing. "The market" rather than an index's name, "dropped" rather than
  "dip", "keep" and "sell some" rather than "hold" and "trim", "profit" and "sales" rather than "EPS" and "revenue",
  "1 in 10" rather than "the worst tenth". The marks DIP BUY, WATCH and PASS are the only terms of art, each shown
  with a legend; "volatile" and "calm" always come with what they mean. The rules are at the top of
  `src/app/watchlist/evidence.ts`.
- A label says what is expected, not how many: "to do: BUY", not "1 to look at".
- The owner's words for the interface: "stupid simple", "keep simple visuals".

## Evidence on Hand

- The tested figures the page quotes: `src/app/watchlist/evidence.generated.ts`. The tests and their record are in
  `tools/signal-backtest/`.
- A live record since the daily log began, shown on the page as a live record and not as a backtest.
- There are no testimonials, customers or performance claims beyond those figures, and none may be invented.

## Product Principles

1. Tested, or said to be untested: nothing in between.
2. Plain words first; the trade's word once, where it helps.
3. A thing is said once, where it is looked for.
4. A control sits with what it changes. (inferred from how the owner asked for the page to be arranged)
5. The first screen answers "what should I do today?". (inferred from "full screen")

## Accessibility & Inclusion

The owner set no standard. The working target is WCAG 2.2 AA (inferred): a visible keyboard focus, text contrast of
at least 4.5:1, explanations that do not depend on hovering, and an alternative for reduced motion.
