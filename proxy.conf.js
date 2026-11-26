'use strict';
/**
 * The dev server's proxy table (used by `npm start`).
 *
 * The routes to the data providers stay in proxy.conf.json. This file adds one more, /store, which answers what you
 * record in the app (your portfolios, lists and log) from memory: the development server keeps nothing, and the
 * store says so with every answer, so the page tells you. It starts the small server behind it inside the dev
 * server's own process, so there is nothing else to run. The app you use every day runs in Docker and saves to its
 * database; this one is for changing the code.
 *
 * The same small server answers /claude: what the page may ask of Claude Code (tools/claude/reader-routes.js).
 * Without it the page simply does not offer it. On the development server "Read it for me" runs the Claude Code
 * installed on this computer, if there is one, and the page's messages about it name `docker compose`, which is the
 * app's way.
 *
 * STORE_PORT can move the store.
 */
const routes = require('./proxy.conf.json');
const {createMemoryStorage} = require('./tools/store/storage-memory');
const {startStore} = require('./tools/store/store-server');
const {readerRoutes} = require('./tools/claude/reader-routes');
const {viewRoutes, oneAtATime} = require('./tools/claude/view-routes');
const {runRecipe} = require('./tools/claude/claude-cli');
const {recipe: readingRecipe} = require('./tools/claude/why-it-dropped');
const {recipe: viewRecipe} = require('./tools/claude/claude-view');
const {recipe: compareRecipe} = require('./tools/claude/claude-compare');

const port = Number(process.env.STORE_PORT) || 4301;
const storage = createMemoryStorage();
// Claude Code runs one thing at a time here too: a view of a stock waits while a fall is being read, and the other way round.
const inTurn = oneAtATime();
const routesOfClaude = [
  viewRoutes({
    storage, run: inTurn(question => runRecipe(viewRecipe, question)), compare: inTurn(question => runRecipe(compareRecipe, question)),
  }),
  readerRoutes({storage, run: inTurn(question => runRecipe(readingRecipe, question))}),
];
startStore({storage, port, routes: routesOfClaude, where: 'memory only: nothing survives when this server stops'});

const local = {target: `http://127.0.0.1:${port}`, secure: false, logLevel: 'warn'};
module.exports = {
  ...routes,
  '/store': local,
  '/claude': local,
};
