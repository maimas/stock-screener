'use strict';
/**
 * The app's side of the socket to the reader (reader-service.js): the same two questions the app asks Claude Code
 * when it runs on this computer, asked of the reader instead. Neither ever rejects: whatever goes wrong comes back
 * as an outcome the page already knows how to tell the owner about.
 */
const http = require('node:http');

const NOBODY_THERE = new Set(['ENOENT', 'ECONNREFUSED']);
const MAX_ANSWER = 1024 * 1024;

/**
 * One request to the reader. Resolves {status, body} (body undefined when it was not JSON), or {error} / {timedOut} /
 * {tooLarge}.
 */
function ask(socketPath, {method, path, payload, timeoutMs}) {
  return new Promise(resolve => {
    let done = false;
    const finish = result => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(result);
      }
    };
    const text = payload === undefined ? undefined : JSON.stringify(payload);
    const req = http.request({
      socketPath, method, path,
      headers: text === undefined ? {} : {'content-type': 'application/json', 'content-length': Buffer.byteLength(text)},
    }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        if (done) {
          return;
        }
        // A reader gone wrong must not fill the app's memory: past the limit the answer is dropped, unread.
        size += chunk.length;
        if (size > MAX_ANSWER) {
          finish({tooLarge: true});
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', error => finish({error}));
      res.on('end', () => {
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          // not JSON: reported by the caller as a failure
        }
        finish({status: res.statusCode, body});
      });
    });
    const timer = setTimeout(() => {
      finish({timedOut: true});
      req.destroy();
    }, timeoutMs);
    req.on('error', error => finish({error}));
    req.end(text);
  });
}

const plain = text => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

function readerClient({socketPath, recipe = 'why-it-dropped', timeoutMs = 150_000, statusTimeoutMs = 3000, log = console}) {
  let said;                                         // the last thing said about the socket, so it is said once
  const run = async prompt => {
    const answer = await ask(socketPath, {method: 'POST', path: '/run', payload: {recipe, prompt}, timeoutMs});
    if (answer.timedOut) {
      return {ok: false, reason: 'timeout'};
    }
    if (answer.tooLarge) {
      return {ok: false, reason: 'failed', detail: 'The reader answered with more than a megabyte, so it was not read.'};
    }
    if (answer.error) {
      return NOBODY_THERE.has(answer.error.code)
        ? {ok: false, reason: 'not-installed'}
        : {ok: false, reason: 'failed', detail: plain(answer.error.message)};
    }
    if (answer.status === 429) {
      return {ok: false, reason: 'busy'};
    }
    const {body} = answer;
    if (body && typeof body === 'object' && typeof body.ok === 'boolean') {
      return body;
    }
    return {ok: false, reason: 'failed', detail: `The reader answered ${answer.status} with something unexpected.`};
  };

  const available = async () => {
    const answer = await ask(socketPath, {method: 'GET', path: '/status', timeoutMs: statusTimeoutMs});
    // "Not there" is a normal answer; a socket that may not be opened is a mistake in how the two are set up.
    const problem = answer.error && !NOBODY_THERE.has(answer.error.code) ? plain(answer.error.message) : undefined;
    if (problem !== said) {
      said = problem;
      if (problem) {
        log.warn(`[claude] the reader's socket cannot be used: ${problem}`);
      }
    }
    return answer.status === 200 && answer.body?.claude === true;
  };

  return {run, available};
}

/**
 * `ask` (a function giving a boolean or a promise of one) made to be asked rarely: a "yes" is kept for `ms`, a "no"
 * only for `noMs`, so a reader that started a moment after the app is not reported missing for long. Two asks at the
 * same moment share one answer. It never rejects: an ask that failed counts as a "no". `now` is for tests.
 */
function askAtMostEvery(ask, ms, now = Date.now, noMs = 5000) {
  let at, pending, keptFor;
  return () => {
    if (pending === undefined || now() - at >= keptFor) {
      at = now();
      keptFor = noMs;                               // until the answer comes, and if it is a "no"
      const mine = pending = Promise.resolve().then(ask).then(found => !!found, () => false);
      mine.then(found => { if (pending === mine && found) { keptFor = ms; } });
    }
    return pending;
  };
}

module.exports = {readerClient, askAtMostEvery};
