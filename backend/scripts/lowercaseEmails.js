// Data fix (docs/DEPLOY_RUNBOOK.md, "Before reopening the site"): lowercases
// and trims every stored email, so they match the code, which now
// normalizes emails at registration, login and password reset. Run it
// BEFORE the new code serves logins: until it has run, an account whose
// stored email has capital letters can't log in (the lookup is lowercase).
//
// - users.email, and resetpasswords.email (pending reset requests).
// - Refuses to change anything if lowercasing would make two accounts share
//   an email (lists the account ids involved; resolve those first).
// - Idempotent: an email that is already lowercase is left alone.
// - Prints counts and account ids only, never an email address.
//
// SAFETY: the connection string comes only from --uri (never .env); prints
// the target host, database and user count first; dry run by default;
// --apply asks you to type the database name. Native-driver writes, with
// autoIndex/autoCreate off.
//
// Usage (from backend/):
//   node scripts/lowercaseEmails.js --uri "<connection string>"           # dry run
//   node scripts/lowercaseEmails.js --uri "<connection string>" --apply   # writes
const mongoose = require('mongoose');
const { parseArgs, describeTarget, confirmDatabaseName, MISSING_URI_MESSAGE, NO_DATABASE_MESSAGE } = require('./lib/uriScript');

const normalize = (email) => String(email).trim().toLowerCase();
const log = (line = '') => console.log(line);

// The users whose email changes, and any case-insensitive collisions.
async function plan(db) {
  const users = await db.collection('users').find({}, { projection: { email: 1 } }).toArray();
  const byNormalized = new Map();
  for (const u of users) {
    const key = normalize(u.email);
    byNormalized.set(key, [...(byNormalized.get(key) || []), u]);
  }
  const collisions = [...byNormalized.values()].filter((group) => group.length > 1).map((group) => group.map((u) => String(u._id)));
  const changes = users.filter((u) => u.email !== normalize(u.email)).map((u) => ({ _id: u._id, from: u.email, to: normalize(u.email) }));
  const resets = (await db.collection('resetpasswords').find({}, { projection: { email: 1 } }).toArray()).filter((r) => r.email !== normalize(r.email));
  return { users: users.length, changes, collisions, resets };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.uri) {
    console.error(MISSING_URI_MESSAGE);
    return 1;
  }
  const target = describeTarget(args.uri);
  if (!target) {
    console.error(NO_DATABASE_MESSAGE);
    return 1;
  }
  await mongoose.connect(args.uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  try {
    const db = mongoose.connection.db;
    log(`Target host: ${target.hosts}`);
    log(`Database:    ${db.databaseName}`);
    log(`Users:       ${await db.collection('users').countDocuments()}`);
    log(`Mode:        ${args.apply ? '--apply (writes after confirmation)' : 'dry run (no writes)'}`);
    log();

    const { changes, collisions, resets } = await plan(db);
    log(`Emails to lowercase: ${changes.length} account(s)${changes.length ? ` (ids): ${changes.map((c) => c._id).join(', ')}` : ''}`);
    log(`Pending password-reset requests to lowercase: ${resets.length}`);
    if (collisions.length) {
      log(`Refusing: lowercasing would make accounts share an email. Resolve these first (ids, per shared address):`);
      collisions.forEach((ids) => log(`  - ${ids.join(', ')}`));
      log('Nothing was changed.');
      return 1;
    }
    if (!args.apply) {
      log('[dry-run] No changes were made. Re-run with --apply to write.');
      return 0;
    }
    if (!changes.length && !resets.length) {
      log('Nothing to change.');
      return 0;
    }
    if (!(await confirmDatabaseName(db.databaseName, 'lowercase the emails'))) {
      log('Confirmation did not match the database name. Nothing was changed.');
      return 1;
    }
    let users = 0;
    for (const { _id, from, to } of changes) {
      users += (await db.collection('users').updateOne({ _id, email: from }, { $set: { email: to } })).modifiedCount;
    }
    let requests = 0;
    for (const r of resets) {
      requests += (await db.collection('resetpasswords').updateOne({ _id: r._id, email: r.email }, { $set: { email: normalize(r.email) } })).modifiedCount;
    }
    log(`Lowercased ${users} account email(s) and ${requests} password-reset request(s).`);
    const left = (await plan(db)).changes.length;
    log(left ? `${left} email(s) still not lowercase; see above.` : 'Every stored email is lowercase.');
    return left ? 1 : 0;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`lowercaseEmails failed: ${error.message}`);
      process.exitCode = 1;
    }
  );
}

module.exports = { normalize };
