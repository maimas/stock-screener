'use strict';
/**
 * The storage a command line tool uses: the MongoDB database named by MONGO_URL. Without it there is nothing to
 * open: the records live in the database only, so a tool never guesses a folder to write them to.
 */
const {createMongoStorage} = require('./storage-mongo');

async function openStorage(env = process.env) {
  if (!env.MONGO_URL) {
    throw new Error('Set MONGO_URL: the store is a database.');
  }
  return createMongoStorage({url: env.MONGO_URL});
}

module.exports = {openStorage};
