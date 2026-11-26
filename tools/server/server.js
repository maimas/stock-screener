'use strict';
/**
 * The one server that stands in for `ng serve` once the app is in an image: the built page, the store, the reading
 * routes and the market data, behind one port. It holds a person's private records, so who is asking is checked
 * first, for every path, before anything else is looked at.
 */
const http = require('node:http');
const {isLocalRequest, storeRoute, send} = require('../store/store-server');
const {providerProxy} = require('./provider-proxy');
const {staticFiles} = require('./static-files');
const {restoreIfEmpty} = require('../store/backup');

/**
 * @param routes    each is asked in turn with (req, res) and returns true when the request was its own
 * @param providerRoutes the market-data table (proxy.conf.json)
 */
function createAppServer({storage, distDir, providerRoutes, routes = []}) {
  const handlers = [...routes, storeRoute({storage}), providerProxy({routes: providerRoutes}), staticFiles(distDir)];
  return http.createServer((req, res) => {
    if (!isLocalRequest(req)) {
      return send(res, 403, {error: 'This only answers the app on this computer.'});
    }
    try {
      if (handlers.some(handler => handler(req, res))) {
        return;
      }
    } catch (error) {
      console.error('[server]', error?.message);
      return res.headersSent ? res.destroy() : send(res, 500, {error: 'Something went wrong.'});
    }
    send(res, 404, {error: 'Not found.'});
  });
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Opens the storage, trying again while the database is still starting. Gives up with the last error after `tries`. */
async function connectWithRetry(open, {tries = 60, pauseMs = 2000, log = console.log} = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await open();
    } catch (error) {
      if (attempt >= tries) {
        throw error;
      }
      if (attempt === 1) {
        log('Waiting for the database.');
      }
      await pause(pauseMs);
    }
  }
}

/**
 * Puts the newest copy back when the store is empty, or finishes a put-back that was cut short, and only then starts
 * answering. A put-back that fails rejects before anything is answered, so the page never sees part of the records.
 */
async function putBackThenListen({storage, backupDir, server, port, host, log = console.log}) {
  if (backupDir) {
    await restoreIfEmpty(storage, backupDir, {log});
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

module.exports = {createAppServer, connectWithRetry, putBackThenListen};
