// Applies the owner-approved content fixes (docs/CONTENT_FIXES.md) to the
// production questions: options, answers, explanations, code and
// difficulty. docs/DEPLOY_RUNBOOK.md has the steps. The fixes come from
//   - database/contentFixes.json (the default): the first round, 20 questions;
//   - another file in database/ named with --fixes, e.g.
//     --fixes contentFixes2.json: the second round (v2.1 QA), 39 questions.
// The same rules apply to every file.
//
// For each question the data gives every field that changes, with the value
// expected now and the new value. A question is
//   - applied when every field still has its expected value;
//   - skipped when every field already has its new value (so a second run
//     changes nothing);
//   - unexpected otherwise (edited meanwhile, partly changed, missing), and
//     then the script refuses to change anything at all and lists what
//     doesn't match.
// It also refuses if a change would remove an option that carries a
// misconception tag (a tag is matched by its option's text). Each write is
// guarded by the expected values, and afterwards every question must pass
// the v2 question validators.
//
// SAFETY: the connection string comes only from --uri (never .env); prints
// the target host, database and question count first; dry run by default;
// --apply asks you to type the database name. Native-driver writes, with
// autoIndex/autoCreate off. Prints question ids and field names only.
//
// Usage (from backend/):
//   node scripts/applyContentFixes.js --uri "<connection string>"           # dry run
//   node scripts/applyContentFixes.js --uri "<connection string>" --apply   # writes
//   ... --fixes contentFixes2.json                                          # another round
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseArgs, describeTarget, confirmDatabaseName, MISSING_URI_MESSAGE, NO_DATABASE_MESSAGE } = require('./lib/uriScript');
const { addQuestionSchema } = require('../validators/questionValidators');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
const DEFAULT_FIXES = 'contentFixes.json';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const log = (line = '') => console.log(line);
const oid = (id) => new mongoose.Types.ObjectId(id);

// The fixes in database/<name>, or an error message. Only a contentFixes*.json
// file directly in database/ is accepted.
function loadFixes(name) {
  if (!/^contentFixes[\w-]*\.json$/.test(name)) return { error: `--fixes takes a file name in database/ like contentFixes2.json, not "${name}".` };
  const file = path.join(DATABASE_DIR, name);
  if (!fs.existsSync(file)) return { error: `No such fixes file: database/${name}` };
  const { fixes } = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(fixes) || !fixes.length) return { error: `database/${name} has no fixes.` };
  const ids = fixes.map((f) => f.id);
  if (new Set(ids).size !== ids.length) return { error: `database/${name} lists a question more than once.` };
  return { fixes };
}

// Splits off --fixes <name>; the rest goes to the shared parser.
function splitFixesArg(argv) {
  const rest = [];
  let name = DEFAULT_FIXES;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--fixes') name = argv[(i += 1)] || '';
    else rest.push(argv[i]);
  }
  return { name, rest };
}

// { apply: [...], done: [...], unexpected: [...] } for the database as it is now.
async function plan(db, fixes) {
  const docs = new Map(
    (await db.collection('questions').find({ _id: { $in: fixes.map((f) => oid(f.id)) } }).toArray()).map((d) => [String(d._id), d])
  );
  const result = { apply: [], done: [], unexpected: [] };
  for (const fix of fixes) {
    const doc = docs.get(fix.id);
    if (!doc) {
      result.unexpected.push({ fix, problem: 'question not found' });
      continue;
    }
    const fields = Object.keys(fix.set);
    if (fields.every((f) => same(doc[f], fix.set[f]))) {
      result.done.push({ fix });
      continue;
    }
    const mismatched = fields.filter((f) => !same(doc[f], fix.expect[f]));
    if (mismatched.length) {
      result.unexpected.push({ fix, problem: `current content doesn't match the expected value of: ${mismatched.join(', ')}` });
      continue;
    }
    if (fix.set.options) {
      const lostTags = (doc.distractors || []).filter((t) => !fix.set.options.includes(t.option));
      if (lostTags.length) {
        result.unexpected.push({ fix, problem: `the new options would drop ${lostTags.length} misconception tag(s)` });
        continue;
      }
    }
    const next = { ...doc, ...fix.set };
    const valid = addQuestionSchema.safeParse({ ...next, code: next.code || '' });
    if (!valid.success) {
      result.unexpected.push({ fix, problem: `the fixed question would fail validation: ${valid.error.issues.map((i) => i.message).join('; ')}` });
      continue;
    }
    result.apply.push({ fix, fields });
  }
  return result;
}

async function main() {
  const { name, rest } = splitFixesArg(process.argv.slice(2));
  const args = parseArgs(rest);
  if (!args.uri) {
    console.error(MISSING_URI_MESSAGE);
    return 1;
  }
  const target = describeTarget(args.uri);
  if (!target) {
    console.error(NO_DATABASE_MESSAGE);
    return 1;
  }
  const { fixes, error } = loadFixes(name);
  if (error) {
    console.error(error);
    return 1;
  }
  await mongoose.connect(args.uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  try {
    const db = mongoose.connection.db;
    log(`Target host: ${target.hosts}`);
    log(`Database:    ${db.databaseName}`);
    log(`Questions:   ${await db.collection('questions').countDocuments()}`);
    log(`Mode:        ${args.apply ? '--apply (writes after confirmation)' : 'dry run (no writes)'}`);
    log(`Fixes:       database/${name} (${fixes.length} questions)`);
    log();

    const { apply, done, unexpected } = await plan(db, fixes);
    log(`${fixes.length} content fixes: ${apply.length} to apply, ${done.length} already applied, ${unexpected.length} unexpected.`);
    for (const { fix, fields } of apply) log(`  apply  ${fix.id} (${fix.ref}): ${fields.join(', ')}`);
    for (const { fix } of done) log(`  done   ${fix.id} (${fix.ref})`);
    if (unexpected.length) {
      log('Refusing: these questions are not in the state the fixes expect. Nothing was changed:');
      for (const { fix, problem } of unexpected) log(`  - ${fix.id} (${fix.ref}): ${problem}`);
      return 1;
    }
    if (!args.apply) {
      log('[dry-run] No changes were made. Re-run with --apply to write.');
      return 0;
    }
    if (!apply.length) {
      log('Nothing to change.');
      return 0;
    }
    if (!(await confirmDatabaseName(db.databaseName, 'apply the content fixes'))) {
      log('Confirmation did not match the database name. Nothing was changed.');
      return 1;
    }
    let written = 0;
    for (const { fix } of apply) {
      // Guarded by the expected values: a question edited since the plan is
      // not overwritten.
      const filter = { _id: oid(fix.id), ...fix.expect };
      written += (await db.collection('questions').updateOne(filter, { $set: fix.set })).modifiedCount;
    }
    log(`Applied ${written} of ${apply.length} fix(es).`);
    const after = await plan(db, fixes);
    const invalid = (await db.collection('questions').find({ _id: { $in: fixes.map((f) => oid(f.id)) } }).toArray()).filter(
      (q) => !addQuestionSchema.safeParse({ ...q, code: q.code || '' }).success
    );
    const ok = written === apply.length && after.done.length === fixes.length && !invalid.length;
    log(ok ? `All ${fixes.length} content fixes are in place, and every fixed question passes the v2 validators.` : 'Not every fix is in place; re-run the dry run to see which.');
    return ok ? 0 : 1;
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
      console.error(`applyContentFixes failed: ${error.message}`);
      process.exitCode = 1;
    }
  );
}
