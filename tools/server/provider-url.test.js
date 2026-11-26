'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {providerUrl} = require('./provider-url');

test('asks the data source at the addresses the app\'s dev proxy uses', () => {
  assert.equal(providerUrl('/service/Finance/Charts?ids=a1'), 'https://assets.msn.com/service/Finance/Charts?ids=a1');
  assert.equal(providerUrl('/contentservices-finance.csautosuggest/api/v1/Query?query=nvda'),
    'https://services.bingapis.com/contentservices-finance.csautosuggest/api/v1/Query?query=nvda');
  assert.throws(() => providerUrl('/store/log'), /route/);
});
