'use strict';
/**
 * Serves the built page from one folder. Reading only, and nothing outside the folder: a path is decoded once, and
 * what it names must still be inside the folder after it is resolved (a link inside the folder that points out of it
 * does not count). The page's own addresses (/portfolio, /watchlist) have no file; they get index.html and the page
 * works out which view to show.
 */
const fs = require('node:fs');
const path = require('node:path');
const {send} = require('../store/store-server');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
};
const HASHED = /\.[0-9a-f]{16}\.[A-Za-z0-9]+$/;       // main.3d86179b9af9c6fd.js: a new build gives a new name

/** The real path of a file that is inside `root` and is a file, or null. */
async function fileInside(root, wanted) {
  let real;
  try {
    real = await fs.promises.realpath(wanted);
    const inside = real === root || real.startsWith(root + path.sep);
    return inside && (await fs.promises.stat(real)).isFile() ? real : null;
  } catch {
    return null;
  }
}

function staticFiles(distDir) {
  const rootPromise = fs.promises.realpath(path.resolve(distDir)).catch(() => path.resolve(distDir));

  async function serve(req, res) {
    const root = await rootPromise;
    let decoded;
    try {
      decoded = decodeURIComponent(String(req.url).split('?')[0].split('#')[0]);
    } catch {
      return send(res, 400, {error: 'That is not a file name.'});
    }
    if (decoded.includes('\0') || !decoded.startsWith('/')) {
      return send(res, 400, {error: 'That is not a file name.'});
    }
    const wanted = path.resolve(root, '.' + decoded);
    if (wanted !== root && !wanted.startsWith(root + path.sep)) {
      return send(res, 404, {error: 'No such file.'});
    }
    let file = await fileInside(root, wanted);
    if (!file && !path.extname(decoded)) {
      file = await fileInside(root, path.join(root, 'index.html'));   // one of the page's own addresses
    }
    if (!file) {
      return send(res, 404, {error: 'No such file.'});
    }
    const name = path.basename(file);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream',
      'cache-control': HASHED.test(name) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') {
      return res.end();
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }

  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, {error: 'Only GET and HEAD.'});
      return true;
    }
    serve(req, res).catch(() => {
      if (res.headersSent) {
        res.destroy();
      } else {
        send(res, 500, {error: 'Could not read the file.'});
      }
    });
    return true;
  };
}

module.exports = {staticFiles};
