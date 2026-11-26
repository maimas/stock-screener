'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
const {createGate, ALLOWED} = require('./gate');

// A far end that sends back whatever it is sent, so a tunnel can be seen to carry bytes both ways without
// anything leaving this computer.
let echo;
let echoPort;
let gate;
let dialled;
let lines;
let echoOpen = 0;                                // how many far-end sockets are open right now

function listening(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function shut(server) {
  server.closeAllConnections();
  server.close();
}

test.before(async () => {
  echo = net.createServer(socket => {
    echoOpen++;
    socket.on('close', () => { echoOpen--; });
    socket.on('error', () => {});
    socket.pipe(socket);
  });
  await listening(echo);
  echoPort = echo.address().port;
});

test.beforeEach(async () => {
  dialled = [];
  lines = [];
  const connect = (port, host) => {
    dialled.push({host, port});
    return net.connect(echoPort, '127.0.0.1');
  };
  gate = await listening(createGate({connect, log: line => lines.push(line)}));
});

test.afterEach(() => shut(gate));

test.after(() => echo.close());

/** Sends the given text to the gate as it is and reads the answer's first line. The socket is returned for more. */
function raw(server, text) {
  return new Promise(resolve => {
    const socket = net.connect(server.address().port, '127.0.0.1');
    let buffered = '';
    socket.setEncoding('latin1');
    socket.on('error', () => {});
    socket.on('close', () => resolve({status: 0, socket, rest: buffered}));
    socket.on('data', function onData(chunk) {
      buffered += chunk;
      const end = buffered.indexOf('\r\n\r\n');
      if (end >= 0) {
        socket.off('data', onData);
        socket.removeAllListeners('close');
        resolve({status: Number(buffered.slice(9, 12)), socket, rest: buffered.slice(end + 4)});
      }
    });
    if (text !== undefined) {
      socket.write(text);
    }
  });
}

async function connectThrough(server, target) {
  const answer = await raw(server, `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
  if (answer.status !== 200) {
    answer.socket.destroy();
  }
  return answer;
}

function nextChunk(socket) {
  return new Promise(resolve => socket.once('data', chunk => resolve(String(chunk))));
}

function plainGet(server, url) {
  return new Promise(resolve => {
    const request = http.request({host: '127.0.0.1', port: server.address().port, path: url, headers: {host: new URL(url).host}},
      response => { response.resume(); resolve(response.statusCode); });
    request.end();
  });
}

test('lets a connection through to an address on the list, and the bytes both ways', async () => {
  const tunnel = await connectThrough(gate, 'api.anthropic.com:443');
  assert.equal(tunnel.status, 200);
  tunnel.socket.write('ping');
  assert.equal(await nextChunk(tunnel.socket), 'ping');                  // the echo server
  assert.deepEqual(dialled, [{host: 'api.anthropic.com', port: 443}]);
  tunnel.socket.destroy();
});

test('every address on the list is let through', async () => {
  for (const host of ALLOWED) {
    const tunnel = await connectThrough(gate, `${host}:443`);
    assert.equal(tunnel.status, 200, host);
    tunnel.socket.destroy();
  }
});

test('refuses everything else and dials nothing', async () => {
  for (const target of ['example.com:443', 'host.docker.internal:4200', 'app:4200', 'mongo:27017', 'api.anthropic.com:80',
    '192.168.65.254:443', 'api.anthropic.com.evil.example:443', 'evilclaude.ai:443', 'API.ANTHROPIC.COM.:443']) {
    assert.equal((await connectThrough(gate, target)).status, 403, target);
  }
  assert.equal(await plainGet(gate, 'http://example.com/'), 403);
  assert.deepEqual(dialled, []);
});

test('refuses an address that only looks like one on the list, and dials nothing', async () => {
  for (const target of ['api.anthropic.com', 'api.anthropic.com:', ':443', 'api.anthropic.com:0443', 'api.anthropic.com:443:443',
    'api.anthropic.com@example.com:443', 'example.com@api.anthropic.com:443', 'api.anthropic.com:443/x',
    '[::1]:443', 'api.anthropic.com:+443', 'api.anthropic.com:443.0', 'api.anthropic.com%00:443', 'claude.ai:4430']) {
    assert.equal((await connectThrough(gate, target)).status, 403, target);
  }
  assert.deepEqual(dialled, []);
});

test('a request line with odd spacing or another verb never dials', async () => {
  for (const text of [
    'CONNECT\tapi.anthropic.com:443 HTTP/1.1\r\n\r\n',
    'connect api.anthropic.com:443 HTTP/1.1\r\n\r\n',
    'GET api.anthropic.com:443 HTTP/1.1\r\n\r\n',
    'CONNECT http://api.anthropic.com:443/ HTTP/1.1\r\n\r\n',
    'CONNECT example.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n',
  ]) {
    const answer = await raw(gate, text);
    assert.notEqual(answer.status, 200, JSON.stringify(text));
    answer.socket.destroy();
  }
  assert.deepEqual(dialled, []);
});

test('a request line with extra spaces can only ever reach the one address it names', async () => {
  const answer = await raw(gate, 'CONNECT  api.anthropic.com:443  HTTP/1.1\r\n\r\n');
  answer.socket.destroy();
  for (const call of dialled) {
    assert.deepEqual(call, {host: 'api.anthropic.com', port: 443});
  }
});

test('an address on the list in capitals is the same address', async () => {
  const tunnel = await connectThrough(gate, 'Claude.AI:443');
  assert.equal(tunnel.status, 200);
  assert.deepEqual(dialled, [{host: 'claude.ai', port: 443}]);
  tunnel.socket.destroy();
});

test('bytes sent with a refused request are not passed on', async () => {
  const answer = await raw(gate, 'CONNECT example.com:443 HTTP/1.1\r\n\r\nCONNECT api.anthropic.com:443 HTTP/1.1\r\n\r\n');
  assert.equal(answer.status, 403);
  await new Promise(resolve => answer.socket.once('close', resolve));      // the gate closes the connection
  assert.deepEqual(dialled, []);
});

test('a plain request is refused and its connection closed', async () => {
  const answer = await raw(gate, 'GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n');
  assert.equal(answer.status, 403);
  await new Promise(resolve => answer.socket.once('close', resolve));
  assert.deepEqual(dialled, []);
});

test('after the tunnel is open, a second CONNECT is only bytes for the far end', async () => {
  const tunnel = await connectThrough(gate, 'api.anthropic.com:443');
  tunnel.socket.write('CONNECT example.com:443 HTTP/1.1\r\n\r\n');
  assert.equal(await nextChunk(tunnel.socket), 'CONNECT example.com:443 HTTP/1.1\r\n\r\n');
  assert.deepEqual(dialled, [{host: 'api.anthropic.com', port: 443}]);
  tunnel.socket.destroy();
});

test('bytes sent in the same packet as an allowed request reach the far end after the 200', async () => {
  const answer = await raw(gate, 'CONNECT api.anthropic.com:443 HTTP/1.1\r\n\r\nhello');
  assert.equal(answer.status, 200);
  const first = answer.rest || await nextChunk(answer.socket);
  assert.equal(first, 'hello');
  answer.socket.destroy();
});

test('says what it refused, and nothing else about it', async () => {
  await connectThrough(gate, 'example.com:443');
  assert.deepEqual(lines, ['[gate] refused example.com:443']);
});

test('says nothing about a connection it lets through', async () => {
  const tunnel = await connectThrough(gate, 'api.anthropic.com:443');
  tunnel.socket.destroy();
  assert.deepEqual(lines, []);
});

test('a refused plain request is logged as the address it asked for, and nothing more', async () => {
  await plainGet(gate, 'http://example.com/secret?token=abc');
  assert.deepEqual(lines, ['[gate] refused example.com:80']);
});

test('a refused https request is logged with the port of https', async () => {
  await plainGet(gate, 'https://example.com/');
  assert.deepEqual(lines, ['[gate] refused example.com:443']);
});

test('what a refused caller wrote is not copied into the log as it is', async () => {
  await raw(gate, 'CONNECT bad\u0001host:443 HTTP/1.1\r\n\r\n');
  await connectThrough(gate, 'x'.repeat(5000) + ':443');
  for (const line of lines) {
    assert.match(line, /^\[gate\] refused [\x20-\x7e]{1,300}$/);
  }
});

test('a far end that cannot be reached is answered with 502, and the gate keeps running', async () => {
  const unreachable = () => { const socket = new net.Socket(); process.nextTick(() => socket.destroy(new Error('unreachable'))); return socket; };
  const failing = await listening(createGate({connect: unreachable, log: () => {}}));
  assert.equal((await connectThrough(failing, 'api.anthropic.com:443')).status, 502);
  assert.equal((await connectThrough(failing, 'example.com:443')).status, 403, 'and it still answers the next caller');
  shut(failing);
});

test('a slow far end is answered with 502 when the far end is out of time, not hung up on when the caller is', async () => {
  const silent = () => new net.Socket();
  const slow = await listening(createGate({connect: silent, log: () => {}, headMs: 50, dialMs: 400}));
  const started = Date.now();
  const answer = await connectThrough(slow, 'api.anthropic.com:443');
  assert.equal(answer.status, 502);
  assert.ok(Date.now() - started >= 300, 'it waited for the far end, not only for the caller');
  shut(slow);
});

test('a far end that never answers is given up on, with 502', async () => {
  const silent = () => new net.Socket();
  const slow = await listening(createGate({connect: silent, log: () => {}, dialMs: 50}));
  assert.equal((await connectThrough(slow, 'api.anthropic.com:443')).status, 502);
  shut(slow);
});

test('a connection that sends nothing is closed', async () => {
  const quick = await listening(createGate({log: () => {}, headMs: 50}));
  const socket = net.connect(quick.address().port, '127.0.0.1');
  socket.on('error', () => {});
  await new Promise(resolve => socket.once('close', resolve));
  shut(quick);
});

test('a caller that hangs up mid-tunnel takes the far end down with it, and the gate keeps running', async () => {
  const tunnel = await connectThrough(gate, 'api.anthropic.com:443');
  assert.equal(echoOpen, 1, 'the far end is open while the tunnel is');
  tunnel.socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(echoOpen, 0, 'the far end was closed too');
  const next = await connectThrough(gate, 'claude.ai:443');
  assert.equal(next.status, 200);
  next.socket.destroy();
});
