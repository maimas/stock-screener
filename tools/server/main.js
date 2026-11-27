#!/usr/bin/env node
'use strict';
/**
 * Starts the app's server: connects to the database, puts back the newest copy if the database is empty (or
 * finishes a put-back that was cut short), starts answering, then starts the daily recording.
 *
 *   MONGO_URL    the database (required)
 *   PORT         4200
 *   HOST         0.0.0.0
 *   DIST_DIR     the built page (default: dist next to tools/)
 *   BACKUP_DIR   where the daily copies are kept and put back from (none: no copies, nothing put back)
 *   READER_SOCKET  the socket file of the reader (Claude Code's own container), for the "Read it for me" helper;
 *                  not set: the page is told Claude Code is not there
 */
const path = require('node:path');
const {createMongoStorage} = require('../store/storage-mongo');
const {startDaily} = require('../recorder/daily');
const {readerRoutes} = require('../claude/reader-routes');
const {readerClient, askAtMostEvery} = require('../claude/reader-client');
const {viewRoutes} = require('../claude/view-routes');
const {createAppServer, connectWithRetry, putBackThenListen} = require('./server');

async function main() {
  const {MONGO_URL, PORT = '4200', HOST = '0.0.0.0', BACKUP_DIR} = process.env;
  const distDir = process.env.DIST_DIR || path.join(__dirname, '..', '..', 'dist');
  if (!MONGO_URL) {
    console.error('MONGO_URL is not set.');
    process.exit(1);
  }

  const storage = await connectWithRetry(() => createMongoStorage({url: MONGO_URL}));

  const {READER_SOCKET} = process.env;
  const asker = READER_SOCKET ? readerClient({socketPath: READER_SOCKET}) : undefined;
  const reader = readerRoutes(asker
    ? {storage, run: asker.run, available: askAtMostEvery(asker.available, 60_000)}
    : {storage, available: () => false, run: async () => ({ok: false, reason: 'not-installed'})});
  // Claude's view of the stocks of a list: the same reader, asked with its other recipe. It answers before the
  // reading routes, which take every other address under /claude as their own.
  const views = viewRoutes(asker
    ? {
      // A view is given the time its recipe has (three minutes), and a little more for the way there and back.
      storage, run: readerClient({socketPath: READER_SOCKET, recipe: 'claude-view', timeoutMs: 210_000}).run,
      compare: readerClient({socketPath: READER_SOCKET, recipe: 'claude-compare'}).run, available: askAtMostEvery(asker.available, 60_000),
    }
    : {storage, available: () => false, run: async () => ({ok: false, reason: 'not-installed'}), compare: async () => ({ok: false, reason: 'not-installed'})});
  const server = createAppServer({
    storage, distDir, providerRoutes: require('../../proxy.conf.json'), routes: [views, reader],
  });
  try {
    await putBackThenListen({storage, backupDir: BACKUP_DIR || undefined, server, port: Number(PORT), host: HOST, log: console.log});
  } catch (error) {
    console.error(error.message);                     // never answer on a store whose copy could not be put back
    await storage.close().catch(() => {});
    process.exit(1);
  }
  console.log(`Listening on ${HOST}:${PORT}`);
  const daily = startDaily({storage, backupDir: BACKUP_DIR || undefined, log: console.log});

  const stop = () => {
    daily.stop();
    server.close(() => storage.close().catch(() => {}).then(() => process.exit(0)));
    server.closeAllConnections();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
