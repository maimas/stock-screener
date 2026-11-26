'use strict';
// Tests for the verdict of check 10 (the reader's reach), without Docker: a proof that tried fewer addresses than it
// should must fail, not pass empty-handed. The addresses are made up.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readerReachProblem} = require('./end-to-end');

const ENV = {APP_IPS: '10.0.1.2,10.0.2.2', MONGO_IPS: '10.0.1.3', GATE_IP: '10.0.3.2', READER_IP: '10.0.3.3', READER_SUBNET: '10.0.3.0/24'};
const HELD = {
  direct: {'mongo:27017': {answered: false}, 'app:4200': {answered: false}},
  byNumber: {'app address 1:4200': {answered: false}, 'app address 2:4200': {answered: false}, 'mongo address 1:27017': {answered: false}},
  gate: {'example.com:443': {status: 403}, 'api.anthropic.com:443': {status: 200}},
};

test('a reach that was tried in full and held is no problem', () => {
  assert.equal(readerReachProblem(ENV, HELD), undefined);
});

test('fails when docker inspect gave no address for the app or for Mongo, or no range for the reader\'s network', () => {
  assert.match(readerReachProblem({...ENV, APP_IPS: ''}, HELD), /no address for the app/);
  assert.match(readerReachProblem({...ENV, MONGO_IPS: ''}, HELD), /no address for Mongo/);
  assert.match(readerReachProblem({...ENV, READER_SUBNET: ''}, HELD), /no range for the reader's network/);
});

test('fails when the reader\'s answer holds no attempt by number for the app or for Mongo', () => {
  const without = prefix => ({...HELD, byNumber: Object.fromEntries(Object.entries(HELD.byNumber).filter(([label]) => !label.startsWith(prefix)))});
  assert.match(readerReachProblem(ENV, without('app address')), /no attempt by number for the app/);
  assert.match(readerReachProblem(ENV, without('mongo address')), /no attempt by number for Mongo/);
  assert.match(readerReachProblem(ENV, {...HELD, byNumber: undefined}), /no attempt by number/);
});

test('still fails, as before, when something answered the reader or the gate let the wrong one through', () => {
  assert.match(readerReachProblem(ENV, {...HELD, byNumber: {...HELD.byNumber, 'mongo address 1:27017': {answered: true}}}), /reached mongo address 1:27017 directly/);
  assert.match(readerReachProblem(ENV, {...HELD, gate: {...HELD.gate, 'example.com:443': {status: 200}}}), /not 403/);
  assert.match(readerReachProblem(ENV, {...HELD, gate: {...HELD.gate, 'api.anthropic.com:443': {error: 'TIMEOUT'}}}), /TIMEOUT, not 200/);
});
