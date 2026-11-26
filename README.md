# Stock Screener

A page that shows your portfolios and watchlists and a plan for today, with marks that were tested on past data.

## Install

1. `git clone https://github.com/maimas/stock-screener.git` and `cd stock-screener`
2. `docker compose up -d` (needs Docker Desktop)
3. Open `http://localhost:4200`

## Run it

- **What to install:** Docker (Docker Desktop on Windows and macOS, started) and Git. Without Git: use "Download ZIP" on the repository's page and unpack it.
- **The first start** takes some minutes, because it builds the app.
- **Where what you record is kept:** in `~/stock-screener-data`, outside Docker. `db` holds the database and `backups` holds a plain copy of it for each day (`screener-YYYY-MM-DD.json`, the last 30 are kept). Set `SCREENER_DATA` to keep it somewhere else. Nothing personal is kept in what git tracks. Share the project as the repository (a link to it, or `git clone`), never as a zip or a copy of your own folder: your folder also holds your settings and your tools' own files.
- **Settings** go in a file named `.env` beside `compose.yaml`, one per line (for example `SCREENER_TZ=Europe/Berlin`). Docker reads it at every start. Do not give a setting on the command line for one start only: the next plain start would use another folder or port.
- **The daily log:** the app records it by itself on weekdays at 16:30 New York time, while it is running. Outside the Americas, set `SCREENER_TZ` to a time zone name such as `Europe/Berlin`, so days are named in your zone.
- **Moving to another computer:** stop the app, copy that folder, start the app there.
- **"Read it for me":** sign in once with `docker compose exec reader claude`, type `/login`, then `/exit`. The sign-in has an end date and is asked for again after it. Each person uses their own Claude plan.
- **Updating:** `git pull`, then `docker compose up -d --build` (also after `npm run evidence`).
- **Stopping and removing:** `docker compose down`. `docker compose down -v --rmi all` also removes the sign-in and the images (the app's and the database's). The data folder stays: it is yours to delete.
- **If the database will not start:** move the `db` folder aside and start again, and the newest daily copy is put back by itself. Or put `COMPOSE_FILE=compose.yaml:compose.volume.yaml` into `.env` (on Windows `;` in place of `:`), then `docker compose up -d` as always. That keeps the database in a Docker volume while the daily copy still goes to the folder.

## Good to know

- It needs Docker Engine 28 or newer (`docker version`).
- The sign-in for "Read it for me" needs a real terminal window (PowerShell, Terminal, cmd; not Git Bash) and is left with `/exit`, not by closing the window.
- It was run on Windows with Docker Desktop; macOS, Linux and ARM computers were not tried.
- On Linux the data folder's files belong to root and to the database's own user, so copying the folder needs `sudo`; started with `sudo`, the folder is in root's home.
- Never keep the data folder where a sync program (OneDrive, Dropbox, iCloud) watches: those lock and replace files under a running database.
- From a WSL terminal `~` is another folder, so the app would start empty.
- Set `SCREENER_PORT` when port 4200 is taken.
- The database needs a processor with AVX (any from the last ten years).
- The page answers on this computer only, not on your network.

## What the page shows

The page has two views. The Portfolio view answers "what do I own, and what do I do?" with a plan for today, made of steps that were tested on past data and sized in dollars for your portfolio. The Watchlist view answers "what is on sale?" with the stocks marked as dips, and the details of each stock.

[What the page shows, in detail](docs/what-the-page-shows.md)

## What the app keeps

| Key | What it holds | Changed by |
|---|---|---|
| `portfolios` | Your portfolios: what you own, cash, your limit for a loss on one stock | The "Your plan today" box and each stock's details |
| `watchlists` | Your lists and the stocks in them | "Edit list" on a list and "New list" at the top of the lists |
| `log` | The daily log: price, verdict and analyst figures of every stock, one entry a day | The page when it loads prices, and the app's daily recording |
| `readings` | What Claude Code read in the news about a stock's fall, one reading a stock | "Read it for me" in a stock's details |
| `claude-views` | Claude's view of a stock (BUY SOME, WAIT or AVOID, with its reason), by stock and by the day it was asked | "Ask Claude about these" above a list |
| `recorder-status` | What the daily recording last did | The app's daily recording |
| `evidence-status` | What the last refresh of the backtests did | `npm run evidence` |
| `copy-status` | The outcome of the last daily copy | The app, after each daily copy |

Of every key the version before the last change is kept too.

## What Claude Code does for the page

"Read it for me" in a stock's details hands Claude Code one job: read why this stock fell on that day. It runs in a container of its own (the reader), and its only way out is the gate, which lets through Anthropic's addresses and nothing else. The sign-in is kept in a Docker volume, not in the data folder. It can search the web and do nothing else, and nothing about what you own goes into the question: only the stock's name and symbol, and the day and size of its fall. Claude Code itself tells every run the email of the signed-in account; that cannot be switched off from here, and a run that can only search has nowhere to send it but a search. The answer is context, not a tested signal: it changes neither the mark nor the plan.

"Ask Claude about these", above each of your lists on the Watchlist, hands it a second job: say for each stock of the list whether it would buy some now, wait, or avoid it, with a short reason. The answer fills the column "Claude · not tested". This is Claude's own opinion and no test stands behind it. It changes neither the mark nor the plan nor any amount, the stocks are not put in an order by it, and each is judged on its own. The same limits hold as for "Read it for me": it can search the web and do nothing else, and nothing about what you own goes into the question. What goes in is the stock's name and symbol and the figures its details show (how far it dropped, how its sales grow, what analysts expect, and so on), each a number or a fixed word. The list of stocks you hold outside every list has no such button, because that list is made of what you own. A list is asked about stock by stock (about half a minute and a few cents of your Claude plan each), ten stocks at a time at most. Every view is kept with its day, and once a view is four weeks old the column's heading says how the stock has done since, beside the S&P 500: a look at how good the views were, not a test.

## For maintainers

- The development server: `npm start`, on port 4201. It keeps nothing: what you enter is gone when it stops. It needs Node 24.
- Tests: `npm run test:tools`; the page's tests, `npx ng test --watch=false --browsers=ChromeHeadless`; `npm run test:mongo`; `npm run check:docker` (starts the whole stack on a throwaway project and checks it); `npm run share:check` (says whether the folder is safe to hand over).
- Claude Code's version is pinned in the `Dockerfile` and raised on purpose: change the number, rebuild, run a real reading.
- No tested number is typed into the app by hand: the backtests record what they measure, and `npm run evidence` carries it into the texts. An update is refused, and the page says so, when a statement the app makes in words would no longer be true (see `tools/signal-backtest/README.md`).
- The recorder uses the app's own code for the verdict and the readings (`tools/recorder/app-code.js` loads the TypeScript), so the log reads the same whoever wrote the day.
- To try a second copy beside your own app (another checkout, a fresh clone), first give it its own name, folder, port and image, or it replaces your app or uses your data. In that copy's `.env`: `COMPOSE_PROJECT_NAME=screener-try`, `SCREENER_DATA=<an empty folder>`, `SCREENER_PORT=4291` and `COMPOSE_FILE=compose.yaml:try.yaml` (on Windows `;` in place of `:`), where a file `try.yaml` beside it gives the services `app`, `reader` and `gate` the line `image: stock-screener:try`. Then `docker compose up -d --build` there as always.
- To put old files or a daily copy into the database by hand, with the database running (`docker compose up -d mongo`): `docker compose run --rm --no-deps -v "<folder>:/import:ro" app node tools/store/import.js /import`

| Command | What it does |
|---|---|
| `npm run evidence` | Re-runs the backtests and updates the figures the page quotes. It needs Python and the downloaded data, which git does not carry, so on a fresh clone run it with `-- --refresh` first |
| `npm run evidence -- --refresh` | The same, after downloading fresh prices and earnings for the test lists (about 20 minutes; `--dry-run` shows what would change) |
| `npm run evidence:schedule` | Optional: has Windows do that refresh every fourth Saturday (`npm run evidence:unschedule` removes it) |
| `npm run schedule:status` | Shows whether that task is registered and when it last ran |
| `npm run log:record` | Records the daily log now, in the running app (the app does it by itself on weekdays) |

## Licence

MIT: see `LICENSE`. The page's layout started from the Material Pro Admin template; its files under `src/assets/styles` keep their author's notice.
