'use strict';
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

/** JSON merge patch (RFC 7386): objects merge key by key, null removes a key, anything else replaces. */
function mergePatch(target, patch) {
  if (!isObject(patch)) {
    return patch;
  }
  const merged = isObject(target) ? {...target} : {};
  Object.keys(patch).forEach(key => {
    if (patch[key] === null) {
      delete merged[key];
    } else {
      merged[key] = mergePatch(merged[key], patch[key]);
    }
  });
  return merged;
}

module.exports = {mergePatch, isObject};
