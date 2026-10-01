// Brings the seed questions in a LOCAL database up to date with
// backend/database/questions.json: the approved content fixes and the
// misconception tags and feedback on wrong options (docs/CONCEPT_GRAPH.md,
// Stage 3). Question _ids stay the same, so answer history keeps pointing at
// the same questions.
//
// - Matching: a database question matches the seed entry with the same
//   `code`, or whose earlier code it still has (database/seedCodeHistory.json
//   lists the earlier code of every seed question whose snippet was fixed).
//   Unmatched questions (e.g. added in the admin panel) are listed and left
//   untouched. Seed entries missing from the database are listed, not
//   inserted (seeding is database/json_to_mongo.js's job).
// - Changes: only the fields that differ are set (question, code, options,
//   answer, difficulty, primaryTopic, secondaryTopics, explanation,
//   distractors).
// - Safety: dry run by default; --apply writes. Idempotent: a second run
//   finds nothing to change. Refuses to write if the seed file fails the
//   question validators or if two database questions match one seed entry.
//   Local databases only: refuses any host other than localhost/127.0.0.1/::1
//   before connecting. Native-driver writes, Mongoose connected with
//   autoIndex/autoCreate off, so it never builds indexes or creates
//   collections. Prints the target host and database before anything else.
//
// Usage (from backend/):
//   node scripts/syncSeedQuestions.js           # dry run
//   node scripts/syncSeedQuestions.js --apply   # writes
require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri, redactMongoUri, MISSING_MONGO_URI_MESSAGE } = require('../config/mongoUri');
const { addQuestionSchema } = require('../validators/questionValidators');
const seedQuestions = require('../database/questions.json');
const codeHistory = require('../database/seedCodeHistory.json');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const FIELDS = ['question', 'code', 'options', 'answer', 'difficulty', 'primaryTopic', 'secondaryTopics', 'explanation', 'distractors'];

// A field's value as stored, with the schema defaults for missing ones.
function normalized(doc, field) {
  const value = doc[field];
  if (value === undefined || value === null) {
    if (field === 'secondaryTopics' || field === 'distractors') return [];
    if (field === 'code') return '';
  }
  return value;
}

// The seed entry as it should be stored (only the synced fields).
function desired(seed) {
  return Object.fromEntries(FIELDS.map((field) => [field, normalized(seed, field)]));
}

function seedProblems() {
  const problems = [];
  seedQuestions.forEach((seed, i) => {
    const result = addQuestionSchema.safeParse(seed);
    if (!result.success) {
      problems.push(`seed Q${i + 1}: ${result.error.issues.map((issue) => issue.message).join('; ')}`);
    }
  });
  return problems;
}

function targetOf(mongoUri) {
  let url;
  try {
    url = new URL(mongoUri);
  } catch {
    return null;
  }
  return { host: url.hostname, display: redactMongoUri(`${url.protocol}//${url.host}`), db: url.pathname.slice(1) || '(default)' };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error(MISSING_MONGO_URI_MESSAGE);
    process.exitCode = 1;
    return;
  }
  const target = targetOf(mongoUri);
  console.log(`Target: ${target ? `${target.display} database ${target.db}` : '(unparseable connection string)'}`);
  if (!target || !LOCAL_HOSTS.has(target.host)) {
    console.error('Refusing: this script only runs against a local database (localhost, 127.0.0.1 or ::1).');
    process.exitCode = 1;
    return;
  }
  console.log(apply ? 'Mode: --apply (writes)' : 'Mode: dry run (no writes)');

  const invalid = seedProblems();
  if (invalid.length) {
    console.error(`Refusing: ${invalid.length} seed question(s) fail validation:`);
    invalid.forEach((problem) => console.error(`  - ${problem}`));
    process.exitCode = 1;
    return;
  }

  // code (current or earlier) -> seed index
  const seedByCode = new Map();
  seedQuestions.forEach((seed, i) => seedByCode.set(seed.code || '', i));
  for (const { code, previousCodes } of codeHistory) {
    const i = seedQuestions.findIndex((seed) => seed.code === code);
    if (i === -1) throw new Error('seedCodeHistory.json names a code that is not in questions.json');
    previousCodes.forEach((previous) => seedByCode.set(previous, i));
  }

  await mongoose.connect(mongoUri, { autoIndex: false, autoCreate: false });
  const collection = mongoose.connection.db.collection('questions');

  try {
    const docs = await collection.find({}).toArray();
    const matchesBySeed = new Map();
    const unmatched = [];
    for (const doc of docs) {
      const i = seedByCode.get(doc.code || '');
      if (i === undefined) unmatched.push(doc);
      else matchesBySeed.set(i, [...(matchesBySeed.get(i) || []), doc]);
    }

    const updates = [];
    const ambiguous = [];
    for (const [i, matched] of matchesBySeed) {
      if (matched.length > 1) {
        ambiguous.push(`seed Q${i + 1} matches ${matched.length} questions: ${matched.map((d) => d._id).join(', ')}`);
        continue;
      }
      const doc = matched[0];
      const want = desired(seedQuestions[i]);
      const set = {};
      for (const field of FIELDS) {
        if (JSON.stringify(normalized(doc, field)) !== JSON.stringify(want[field])) set[field] = want[field];
      }
      if (Object.keys(set).length) updates.push({ seedIndex: i, _id: doc._id, set });
    }
    const missing = seedQuestions.map((_, i) => i).filter((i) => !matchesBySeed.has(i));

    console.log(
      `${docs.length} question(s) in the database: ${docs.length - unmatched.length} match a seed question, ` +
        `${unmatched.length} don't (left untouched).`
    );
    for (const { seedIndex, _id, set } of updates) {
      console.log(`  seed Q${seedIndex + 1} (${_id}): ${Object.keys(set).join(', ')}`);
    }
    console.log(`${updates.length} question(s) to update.`);
    if (missing.length) console.log(`Seed questions not in the database (not inserted): ${missing.map((i) => `Q${i + 1}`).join(', ')}`);
    if (unmatched.length) console.log(`Unmatched database questions: ${unmatched.map((d) => d._id).join(', ')}`);
    if (ambiguous.length) {
      console.log('Ambiguous matches:');
      ambiguous.forEach((line) => console.log(`  - ${line}`));
    }

    if (!apply) {
      console.log('[dry-run] No changes were made. Re-run with --apply to write.');
      return;
    }
    if (ambiguous.length) {
      console.error('Refusing to apply: resolve the ambiguous matches above first.');
      process.exitCode = 1;
      return;
    }
    for (const { _id, set } of updates) {
      await collection.updateOne({ _id }, { $set: set });
    }
    console.log(`Updated ${updates.length} question(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('syncSeedQuestions failed:', error.message);
  process.exitCode = 1;
});
