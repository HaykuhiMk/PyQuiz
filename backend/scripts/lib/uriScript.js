// Shared safety plumbing for scripts that may be pointed at the production
// database (scripts/productionMigration.js, scripts/lowercaseEmails.js):
// the connection string comes only from --uri (never .env or MONGODB_URI),
// the target is described without credentials, and --apply asks for the
// database name to be typed.
const readline = require('readline');
const { redactMongoUri } = require('../../config/mongoUri');

function parseArgs(argv) {
  const args = { uri: null, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--uri') args.uri = argv[(i += 1)] || null;
    else if (argv[i] === '--apply') args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

// Host(s) and database name, without credentials; null if the URI names no
// database.
function describeTarget(uri) {
  const match = uri.match(/^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?]+)\/([^?]*)/);
  if (!match || !match[3]) return null;
  return { hosts: redactMongoUri(`${match[1]}://${match[2]}`), db: decodeURIComponent(match[3]) };
}

// Resolves to true only if the database name is typed exactly.
async function confirmDatabaseName(dbName, action) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const answer = await new Promise((resolve) => {
    rl.question(`Type the database name (${dbName}) to ${action}: `, resolve);
    rl.on('close', () => resolve(null));
  });
  rl.close();
  return answer !== null && answer.trim() === dbName;
}

const MISSING_URI_MESSAGE = 'Refusing: pass the connection string with --uri. This script never reads .env or MONGODB_URI/MONGO_URI.';
const NO_DATABASE_MESSAGE = 'Refusing: the --uri must name a database, e.g. mongodb://127.0.0.1:27018/<database>.';

module.exports = { parseArgs, describeTarget, confirmDatabaseName, MISSING_URI_MESSAGE, NO_DATABASE_MESSAGE };
