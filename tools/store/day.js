'use strict';

/** YYYY-MM-DD in this computer's time zone, as the page names its days. */
function localDay(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = {localDay};
