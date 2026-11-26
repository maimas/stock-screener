'use strict';
/**
 * Run inside the reader's container (piped to `node -`, so it uses nothing but what Node itself brings): tries each
 * address the reader must NOT be able to reach, by name and by number, then asks the gate for a tunnel to one address
 * it must refuse and one it must let through. Prints one line of JSON saying what happened to each.
 *
 * The numbers come from the environment, read by the caller with `docker inspect`:
 *   APP_IPS, MONGO_IPS   the app's and the database's addresses, comma separated
 *   GATE_IP, READER_IP   the gate's and the reader's own address on the reader's network
 *   READER_SUBNET        that network's range, such as 10.0.0.0/24
 * A name is no proof on a network that cannot look names up, and a refusal ("connection refused") is an answer too:
 * it means a machine is there, which on this network could only be the computer running Docker.
 */
const fs = require('node:fs');
const net = require('node:net');

const DIRECT = [['mongo', 27017], ['app', 4200], ['host.docker.internal', 4290], ['example.com', 443]];
const THROUGH_THE_GATE = ['example.com:443', 'api.anthropic.com:443'];
const list = name => (process.env[name] || '').split(',').filter(Boolean);

/** Whether something answers a plain connection: a connection made or refused counts; a silence or an error does not. */
function tryDirect(host, port) {
  return new Promise(resolve => {
    const socket = net.connect({host, port});
    const done = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(5000, () => done({answered: false, error: 'TIMEOUT'}));
    socket.once('connect', () => done({answered: true}));
    socket.once('error', error => done({answered: error.code === 'ECONNREFUSED', error: error.code || String(error.message)}));
  });
}

/** The status the gate answers to `CONNECT <target>`, or why there was no answer. */
function askGate(target) {
  return new Promise(resolve => {
    const socket = net.connect({host: 'gate', port: 8080});
    let head = '';
    const done = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(20000, () => done({error: 'TIMEOUT'}));
    socket.once('error', error => done({error: error.code || String(error.message)}));
    socket.once('close', () => done({error: 'CLOSED'}));
    socket.once('end', () => done({error: 'CLOSED'}));
    socket.once('connect', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    socket.on('data', chunk => {
      head += chunk.toString('latin1');
      if (head.includes('\r\n')) {
        done({status: Number(head.split('\r\n')[0].split(' ')[1])});
      }
    });
  });
}

const toNumber = address => address.split('.').reduce((all, part) => all * 256 + Number(part), 0);
const toAddress = number => [24, 16, 8, 0].map(shift => Math.floor(number / 2 ** shift) % 256).join('.');

/** The first address of a range such as 10.0.0.0/24, which Docker keeps for the machine running it. */
function firstAddress(subnet) {
  const base = subnet.split('/')[0];
  return /^\d+\.\d+\.\d+\.\d+$/.test(base) ? toAddress(toNumber(base) + 1) : '';
}

/** The address of the default route in /proc/net/route, if there is one. */
function routeAddress() {
  try {
    const row = fs.readFileSync('/proc/net/route', 'utf8').split('\n').slice(1).map(line => line.split(/\s+/)).find(cols => cols[1] === '00000000');
    const hex = row && row[2];
    return hex && hex !== '00000000' ? hex.match(/../g).reverse().map(byte => parseInt(byte, 16)).join('.') : '';
  } catch {
    return '';
  }
}

/** The attempts by number: each is labelled, and no label holds an address. */
function numbered() {
  const attempts = [];
  list('APP_IPS').forEach((address, i) => attempts.push([`app address ${i + 1}:4200`, address, 4200]));
  list('MONGO_IPS').forEach((address, i) => attempts.push([`mongo address ${i + 1}:27017`, address, 27017]));
  const own = new Set([process.env.GATE_IP, process.env.READER_IP]);
  const others = [['first address of the reader network', firstAddress(process.env.READER_SUBNET || '')], ['default route', routeAddress()]];
  for (const [what, address] of others) {
    if (address && !own.has(address)) {
      for (const port of [4290, 22]) {
        attempts.push([`${what}:${port}`, address, port]);
      }
    }
  }
  return attempts;
}

async function main() {
  const direct = {};
  const byNumber = {};
  const gate = {};
  await Promise.all([
    ...DIRECT.map(async ([host, port]) => { direct[`${host}:${port}`] = await tryDirect(host, port); }),
    ...numbered().map(async ([label, host, port]) => { byNumber[label] = await tryDirect(host, port); }),
    ...THROUGH_THE_GATE.map(async target => { gate[target] = await askGate(target); }),
  ]);
  console.log(JSON.stringify({direct, byNumber, gate}));
}

main();
