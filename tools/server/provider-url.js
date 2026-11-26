'use strict';
/**
 * Where a request the app makes through its proxy really goes. The dev server's proxy table (proxy.conf.json) is the
 * one list of market-data sites; the daily recorder and the server both read it through here.
 */
const defaultRoutes = require('../../proxy.conf.json');

/**
 * The table's entry for a path the app asks for (the first part of the path names it), and the path as the site
 * is asked for it, question included. undefined when no site is named for it. The pass-through and the recorder
 * both go through here, so they cannot come to ask different addresses.
 */
function routeFor(appPath, routes = defaultRoutes) {
  const prefix = Object.keys(routes).find(key => String(appPath).split('?')[0].startsWith(`${key}/`));
  if (!prefix) {
    return undefined;
  }
  const entry = routes[prefix];
  const {pathRewrite = {}} = entry;
  return {entry, path: Object.keys(pathRewrite).reduce((rewritten, pattern) => rewritten.replace(new RegExp(pattern), pathRewrite[pattern]), appPath)};
}

/** The data source's own address for a path the app requests through its dev proxy (proxy.conf.json). */
function providerUrl(appPath, routes = defaultRoutes) {
  const found = routeFor(appPath, routes);
  if (!found) {
    throw new Error(`No route to the data source for ${appPath}`);
  }
  return found.entry.target + found.path;
}

module.exports = {providerUrl, routeFor};
