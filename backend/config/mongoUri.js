const logger = require('./logger');

// MONGODB_URI is the canonical name for the MongoDB connection string.
// MONGO_URI was the name app.js, the dev server and the seed script used
// before the rename; it is still honoured as a fallback, with a startup
// warning, so a deploy works whichever of the two the production
// environment actually sets. MONGODB_URI wins when both are set.
let warned = false;

function resolveMongoUri(env = process.env, warn = (message) => logger.warn(message)) {
  if (env.MONGODB_URI) {
    if (env.MONGO_URI && env.MONGO_URI !== env.MONGODB_URI && !warned) {
      warned = true;
      warn('Both MONGODB_URI and MONGO_URI are set with different values; using MONGODB_URI. Remove MONGO_URI.');
    }
    return env.MONGODB_URI;
  }
  if (env.MONGO_URI) {
    if (!warned) {
      warned = true;
      warn('MONGO_URI is deprecated; rename it to MONGODB_URI (see backend/env.example). Using MONGO_URI for now.');
    }
    return env.MONGO_URI;
  }
  return undefined;
}

const MISSING_MONGO_URI_MESSAGE =
  'Missing MONGODB_URI. Set it to your MongoDB connection string (a local URI for development, ' +
  'or your MongoDB Atlas/production URI) — see backend/env.example.';

// Redacts any embedded username/password before a Mongo connection string
// (or an error message that echoes one back) reaches a log or the terminal,
// e.g. "mongodb+srv://user:pass@host/db" -> "mongodb+srv://[redacted]@host/db".
function redactMongoUri(value) {
  if (!value) return value;
  return String(value).replace(/(mongodb(?:\+srv)?:\/\/)([^@/\s]+)@/gi, '$1[redacted]@');
}

function resetWarningForTests() {
  warned = false;
}

module.exports = { resolveMongoUri, redactMongoUri, MISSING_MONGO_URI_MESSAGE, resetWarningForTests };
