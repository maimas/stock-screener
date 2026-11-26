'use strict';
/**
 * Passes the app's market-data requests on to the sites named in proxy.conf.json, the way the dev server's proxy
 * does: /api/... goes to one site, /gnews/... to another, with the path rewritten as the table says.
 *
 * The caller chooses only the path. The site is always the table's, never anything in the request, so this cannot
 * be turned into a way to ask an arbitrary address from this computer. The table's `secure: false` was a leftover of
 * the dev server: certificates are always checked here.
 *
 * Bodies go through untouched in both directions (a compressed answer stays compressed). Cookies a site sets are
 * not handed on: they are not the app's to keep.
 */
const http = require('node:http');
const https = require('node:https');
const {pipeline} = require('node:stream');
const {send} = require('../store/store-server');
const {routeFor} = require('./provider-url');

const READ_ONLY = new Set(['GET', 'HEAD']);
const NOT_HANDED_ON = new Set(['set-cookie', 'connection', 'keep-alive', 'transfer-encoding']);

/** @param lookup how a host name is found; only tests replace it (to make a lookup that never answers) */
function providerProxy({routes, timeoutMs = 60_000, log = console, lookup}) {
  return (req, res) => {
    const found = routeFor(req.url, routes);
    if (!found) {
      return false;
    }
    const {entry} = found;
    if (!READ_ONLY.has(req.method)) {
      send(res, 405, {error: 'Only GET and HEAD.'});
      return true;
    }

    const target = new URL(entry.target);
    const secure = target.protocol === 'https:';
    const headers = {...req.headers, host: target.host};
    delete headers.connection;
    // A browser sends every cookie kept for localhost, including other programs' on other ports: no site here is owed them.
    delete headers.cookie;
    delete headers.authorization;
    // Nor where the question came from: the page's own address could one day say more than the site needs to know.
    delete headers.referer;
    delete headers.origin;

    // Whatever happens, the caller gets one answer: a late failure after the answer has begun ends it instead.
    const fail = (status, error) => {
      if (res.headersSent || res.destroyed) {
        res.destroy();
      } else {
        send(res, status, {error});
      }
    };

    let upstream;
    try {
      upstream = (secure ? https : http).request({
        hostname: target.hostname,
        port: target.port || (secure ? 443 : 80),
        method: req.method,
        path: target.pathname.replace(/\/$/, '') + found.path,
        headers,
        timeout: timeoutMs,                           // one limit for connecting, the answer's head and a stalled body
        ...(lookup && {lookup}),
      });
    } catch {
      send(res, 400, {error: 'That address cannot be passed on.'});
      return true;
    }

    let gaveUp = false;                               // the failures that follow our own hang-up are not news
    upstream.on('timeout', () => {
      gaveUp = true;
      fail(504, 'The data source did not answer in time.');
      upstream.destroy();
    });
    upstream.on('error', error => {
      if (gaveUp) {
        return;
      }
      log.warn(`[server] the data source could not be reached: ${error?.code || error?.message}`);
      fail(502, 'The data source could not be reached.');
    });
    upstream.on('response', answer => {
      const handedOn = Object.fromEntries(Object.entries(answer.headers).filter(([name]) => !NOT_HANDED_ON.has(name)));
      res.writeHead(answer.statusCode, handedOn);
      pipeline(answer, res, error => {
        if (error) {
          res.destroy();                              // the answer was cut short: let the caller see that it was
        }
      });
    });
    // a caller that leaves takes its question with it
    res.on('close', () => {
      if (!res.writableFinished) {
        gaveUp = true;
        upstream.destroy();
      }
    });
    upstream.end();
    return true;
  };
}

module.exports = {providerProxy};
