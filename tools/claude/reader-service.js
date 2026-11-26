#!/usr/bin/env node
'use strict';
/**
 * The small service that runs in Claude Code's own container (the "reader"). The app's server asks it over a socket
 * file in a folder the two containers share; nothing else can reach it, and it reaches nothing but what Claude Code
 * itself needs.
 *
 *   GET  /status   {claude: true|false}   is Claude Code installed here?
 *   POST /run      {recipe, prompt}       runs one recipe on one question and answers with what the run gave
 *
 * It only runs the recipes it was given by name, so the app cannot make it run anything else. One run at a time,
 * because every run uses some of the Claude plan. Run as a command it listens on READER_SOCKET.
 */
const fs = require('node:fs');
const http = require('node:http');
const {findClaude, runRecipe} = require('./claude-cli');
const {recipe} = require('./why-it-dropped');
const {recipe: viewRecipe} = require('./claude-view');

const MAX_PROMPT = 4000;
const MAX_BODY = 16 * 1024;                          // a prompt of 4000 characters fits many times over

function send(res, status, body) {
  if (res.destroyed || res.writableEnded) {
    return;                                         // the app stopped waiting; nobody is left to tell
  }
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  res.end(JSON.stringify(body));
}

const refused = detail => ({ok: false, reason: 'failed', detail});

/** The JSON a request carries, or {error} when it is too large or is not JSON. */
function readJson(req) {
  return new Promise(resolve => {
    const chunks = [];
    let size = 0, tooLarge = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        tooLarge = true;                            // keep draining so the caller receives the answer
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', () => resolve({error: 'The request broke off.'}));
    req.on('end', () => {
      if (tooLarge) {
        return resolve({error: 'The request is too large.'});
      }
      try {
        resolve({value: JSON.parse(Buffer.concat(chunks).toString('utf8'))});
      } catch {
        resolve({error: 'That is not JSON.'});
      }
    });
  });
}

/**
 * @param recipes   the recipes that may be run, by name
 * @param run       runs a recipe on a question; only tests replace it
 * @param available whether Claude Code is installed; only tests replace it
 */
function createReaderService({recipes = {'why-it-dropped': recipe, 'claude-view': viewRecipe}, run = runRecipe, available = () => !!findClaude()} = {}) {
  let busy = false;

  const handleRun = async (req, res) => {
    const {value, error} = await readJson(req);
    if (error) {
      return send(res, 400, refused(error));
    }
    const name = value?.recipe, prompt = value?.prompt;
    if (typeof name !== 'string' || !Object.hasOwn(recipes, name)) {
      return send(res, 400, refused('That recipe is not known here.'));
    }
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) {
      return send(res, 400, refused(`Send a question of 1 to ${MAX_PROMPT} characters.`));
    }
    if (busy) {
      return send(res, 429, {ok: false, reason: 'busy'});
    }
    busy = true;
    try {
      send(res, 200, await run(recipes[name], prompt));
    } catch (failure) {
      send(res, 500, refused(String(failure?.message ?? failure).slice(0, 200)));
    } finally {
      busy = false;                                 // however the run ended, the next one may start
    }
  };

  return http.createServer((req, res) => {
    const route = String(req.url).split('?')[0];
    if (route === '/status' && req.method === 'GET') {
      Promise.resolve().then(available).then(found => send(res, 200, {claude: !!found}), () => send(res, 200, {claude: false}));
    } else if (route === '/run' && req.method === 'POST') {
      handleRun(req, res).catch(failure => send(res, 500, refused(String(failure?.message ?? failure).slice(0, 200))));
    } else {
      send(res, 404, {error: 'Nothing here.'});
      req.resume();
    }
  });
}

/** Removes a socket file at the path, and nothing else: a file or folder of the owner's that is there is not ours to delete. */
function removeLeftSocket(socketPath) {
  if (process.platform === 'win32') {
    return;                                         // the path is a pipe, which leaves nothing behind
  }
  let found;
  try {
    found = fs.lstatSync(socketPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  if (!found.isSocket()) {
    throw new Error(`${socketPath} is there and is not a socket, so it is left alone.`);
  }
  fs.rmSync(socketPath);
}

/** Starts listening on a socket file. One left behind by a start that was killed would refuse the new one, so it goes first. */
function listenOn(server, socketPath) {
  return new Promise((resolve, reject) => {
    try {
      removeLeftSocket(socketPath);
    } catch (error) {
      return reject(error);
    }
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

module.exports = {createReaderService, listenOn};

if (require.main === module) {
  const {READER_SOCKET} = process.env;
  if (!READER_SOCKET) {
    console.error('READER_SOCKET is not set.');
    process.exit(1);
  }
  const server = createReaderService();
  listenOn(server, READER_SOCKET).then(() => {
    console.log(`Reader listening on ${READER_SOCKET}`);
    const stop = () => {
      server.close(() => process.exit(0));
      server.closeAllConnections();
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  }, error => {
    console.error(error.message);
    process.exit(1);
  });
}
