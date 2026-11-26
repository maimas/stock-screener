'use strict';
/**
 * A very small store for the screener, on whatever storage it is given: MongoDB in the app, memory on the
 * development server (which then keeps nothing past its own end, and says so in every answer):
 *   GET   /store/<key>   reads the value kept under that key
 *   PUT   /store/<key>   replaces it
 *   PATCH /store/<key>   merges a change into it (JSON merge patch: objects are merged key by key, a key sent as
 *                        null is removed, anything else is replaced)
 *
 * It exists so that what you record in the app (your portfolios, your lists, the daily log) is kept in a database
 * rather than only in a browser. In the app it is served by tools/server/server.js, on the development server by
 * proxy.conf.js inside its own process; nothing else to run. PATCH is what lets two writers share one value: the
 * page and the daily recorder each send only their own day of the log, and neither can overwrite what the other
 * wrote.
 *
 * It holds personal holdings, so it is careful about who it answers:
 *  - it listens on 127.0.0.1 only;
 *  - it refuses requests that a web page on another site could send (a foreign Origin, a cross-site fetch,
 *    or a host name that is not this computer, which is how DNS-rebinding attacks arrive);
 *  - it takes only GET/PUT/PATCH, only JSON, only simple key names.
 *
 * Other things this computer does for the page can be served from the same server as `routes` (what Claude Code
 * reads for it: tools/claude/reader-routes.js). A route is asked only after the checks on who is asking, so it is
 * as hard to reach from another site as the store itself.
 */
const http = require('node:http');
const {KEY} = require('./keys');
const {isObject, mergePatch} = require('./merge-patch');

const STORE = 'watchlist';                        // every answer carries this name, so the app can tell it is really the store
const MAX_BYTES = 5 * 1024 * 1024;
const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const METHODS = new Set(['GET', 'PUT', 'PATCH']);

function isLocalHost(host) {
  return LOCAL_NAMES.has(String(host || '').replace(/:\d+$/, ''));
}

function isLocalOrigin(origin) {
  try {
    return LOCAL_NAMES.has(new URL(origin).hostname) || new URL(origin).hostname === '::1';
  } catch {
    return false;
  }
}

function send(res, status, body) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  res.end(JSON.stringify({store: STORE, ...body}));
}

function keyOf(url) {
  const match = /^\/store\/([^/]+)$/.exec(String(url).split('?')[0]);
  if (!match) {
    return undefined;
  }
  return KEY.test(match[1]) ? match[1] : null;     // null: the path is the store's, the key is not acceptable
}

/**
 * Reads the JSON body of a request and hands it to `apply`, which answers with [status, body], or with a promise of
 * that. `extra` is added to every answer, including the ones made here, except "the database is not answering":
 * that says nothing about what the storage keeps.
 */
function receive(req, res, apply, extra = {}) {
  const answer = (status, body) => send(res, status, status === 503 ? body : {...body, ...extra});
  if (!/^application\/(merge-patch\+)?json\b/i.test(req.headers['content-type'] || '')) {
    return answer(415, {error: 'Send JSON.'});
  }
  const chunks = [];
  let size = 0, refused = false;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      if (!refused) {
        refused = true;
        answer(413, {error: 'Too large.'});
      }
      return;                                       // keep draining so the client receives the answer
    }
    chunks.push(chunk);
  });
  req.on('end', async () => {
    if (refused) {
      return;
    }
    let value;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return answer(400, {error: 'That is not JSON.'});
    }
    try {
      const [status, body] = await apply(value);
      answer(status, body);
    } catch (error) {
      console.error('[store] could not write', error?.message);
      answer(500, {error: 'Could not save it.'});
    }
  });
}

/** Whether the request comes from the app on this computer: the host name, the origin and the fetch site are all local. */
function isLocalRequest(req) {
  const origin = req.headers.origin;
  return isLocalHost(req.headers.host) && !(origin && !isLocalOrigin(origin)) && req.headers['sec-fetch-site'] !== 'cross-site';
}

/**
 * The /store/<key> address on any storage. Returns a route: it answers and returns true when the path is the
 * store's, and returns false when it is not. A storage that keeps nothing past a restart says so in every answer.
 */
function storeRoute({storage}) {
  const extra = storage.kind === 'memory' ? {lasting: false} : {};
  const answer = (res, status, body) => send(res, status, {...body, ...extra});
  const notAnswering = (what, error) => {
    console.error(`[store] the database did not answer (${what})`, error?.message);
    return [503, {error: 'The database is not answering.'}];
  };

  return (req, res) => {
    const key = keyOf(req.url);
    if (key === undefined) {
      return false;
    }
    if (!METHODS.has(req.method)) {
      answer(res, 405, {error: 'Only GET, PUT and PATCH.'});
    } else if (key === null) {
      answer(res, 400, {error: 'Unknown key.'});     // decided here, so the storage is never asked about it
    } else if (req.method === 'GET') {
      Promise.resolve()
        .then(() => storage.read(key))
        .then(found => answer(res, 200, found), error => send(res, ...notAnswering('read', error)))
        .catch(error => console.error('[store]', error?.message));
    } else if (req.method === 'PUT') {
      receive(req, res, async value => {
        try {
          await storage.write(key, value);
          return [200, {saved: true}];
        } catch (error) {
          return notAnswering('write', error);
        }
      }, extra);
    } else {
      receive(req, res, async patch => {
        if (!isObject(patch)) {
          return [400, {error: 'A change to merge must be an object.'}];
        }
        try {
          const result = await storage.merge(key, patch);
          return [result.saved ? 200 : 409, result];
        } catch (error) {
          return notAnswering('merge', error);
        }
      }, extra);
    }
    return true;
  };
}

/** @param routes each is asked in turn with (req, res) and returns true when the request was its own and it answered */
function createStoreServer({storage, routes = []}) {
  const store = storeRoute({storage});
  return http.createServer((req, res) => {
    if (!isLocalRequest(req)) {
      return send(res, 403, {error: 'This store only answers the app on this computer.'});
    }
    if (routes.some(route => route(req, res)) || store(req, res)) {
      return;
    }
    send(res, 404, {error: 'Not the store.'});
  });
}

/**
 * Starts the store on 127.0.0.1. If the port is taken (a second dev server), the one already running is used.
 * @param where words for the start-up line that say where things are kept
 */
function startStore({storage, port, host = '127.0.0.1', routes, where = `a ${storage.kind} storage`}) {
  const server = createStoreServer({storage, routes});
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[store] port ${port} is already in use: assuming the store is already running there.`);
    } else {
      console.error('[store]', error.message);
    }
  });
  server.listen(port, host, () => console.log(`[store] your portfolios, lists and log are kept in ${where}`));
  return server;
}

module.exports = {createStoreServer, startStore, storeRoute, isLocalRequest, mergePatch, send, receive};
