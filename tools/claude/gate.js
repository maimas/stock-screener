'use strict';
/**
 * The reader's only way out. The reader (Claude Code) sits on a network that leads nowhere else; to reach Anthropic
 * it asks this gate for a tunnel with `CONNECT host:443`. The gate opens one only to the addresses on the list and
 * refuses everything else, so a reader that is talked into fetching something cannot reach the database, the app or
 * any other address on this computer's network.
 *
 * The gate never looks inside a tunnel: what flows through is encrypted between Claude Code and Anthropic. Which
 * address is dialled comes only from the request's target, taken whole: it must be a plain name, then `:443`, and
 * that name must be on the list exactly (compared in lower case). Nothing about a caller is logged except the one
 * line for a refusal, and that line is built from the address only if it looks like one, so what a caller writes
 * cannot fill the log.
 */
const http = require('node:http');
const net = require('node:net');

const ALLOWED = ['api.anthropic.com', 'claude.ai', 'platform.claude.com'];

const TARGET = /^([A-Za-z0-9.-]{1,253}):443$/;
const LOGGABLE = /^[A-Za-z0-9.-]{1,253}:[0-9]{1,5}$/;

const REFUSED = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const NO_ANSWER = 'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const OPEN = 'HTTP/1.1 200 Connection Established\r\n\r\n';

/**
 * @param connect how a far end is dialled, as net.connect(port, host); only tests replace it
 * @param headMs how long a caller has to say what it wants before the gate hangs up on it
 * @param dialMs how long the far end has to answer
 */
function createGate({allowed = ALLOWED, connect = net.connect, log = console.log, headMs = 10_000, dialMs = 15_000} = {}) {
  const list = new Set(allowed);

  const refuse = (what) => {
    log(`[gate] refused ${LOGGABLE.test(what) ? what : '(not an address)'}`);
  };

  const server = http.createServer((req, res) => {
    // A plain request is never passed on: only tunnels are. The address is only for the log.
    let what = '';
    try {
      const url = new URL(req.url);
      what = `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`;
    } catch {
      // not an address
    }
    refuse(what);
    res.writeHead(403, {'Connection': 'close', 'Content-Length': 0});
    res.end();
  });

  // A caller that connects and says nothing must not hold the gate open.
  server.on('connection', socket => {
    socket.setTimeout(headMs, () => socket.destroy());
    socket.on('error', () => {});
  });

  server.on('clientError', (error, socket) => {
    socket.destroy();
  });

  server.on('connect', (req, client, head) => {
    const match = TARGET.exec(req.url || '');
    const host = match && match[1].toLowerCase();
    if (!host || !list.has(host)) {
      refuse(req.url || '');
      client.end(REFUSED);
      return;
    }

    // The caller has said what it wants: from here the far end's own time limit (dialMs) applies, not the caller's.
    client.setTimeout(0);

    let upstream;
    try {
      upstream = connect(443, host);
    } catch {
      client.end(NO_ANSWER);
      return;
    }

    let open = false;
    const giveUp = () => {
      if (!open) {
        open = true;                                   // answered once, whichever of the failures comes first
        client.end(NO_ANSWER);
      }
      client.destroy();
      upstream.destroy();
    };
    upstream.setTimeout(dialMs, giveUp);
    upstream.on('error', giveUp);
    upstream.on('close', giveUp);
    client.on('error', () => upstream.destroy());
    client.on('close', () => upstream.destroy());

    upstream.on('connect', () => {
      if (open) {
        return;
      }
      open = true;
      upstream.setTimeout(0);                          // a quiet tunnel is the far ends' business
      client.setTimeout(0);
      client.write(OPEN);
      if (head && head.length) {
        upstream.write(head);
      }
      upstream.pipe(client);
      client.pipe(upstream);
    });
  });

  return server;
}

module.exports = {ALLOWED, createGate};

if (require.main === module) {
  createGate().listen(8080, '0.0.0.0', () => console.log('[gate] listening on 8080'));
}
