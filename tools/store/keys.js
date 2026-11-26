'use strict';
/** What a name must look like to be a store key: short, lower case, safe to use as a file name. */
const KEY = /^[a-z][a-z0-9-]{0,40}$/;

function assertKey(key) {
  if (typeof key !== 'string' || !KEY.test(key)) {
    throw new Error('Not a store key: ' + key);
  }
}

module.exports = {KEY, assertKey};
