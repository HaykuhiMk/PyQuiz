// One-time migration: replaces the old free-form `topics` tag array on
// every existing Question document with the canonical `primaryTopic`
// (required, docs/AUDIT.md Phase 3 taxonomy revision — approved) and
// `secondaryTopics` (optional) fields.
//
// The mapping itself lives in backend/database/questions.json (already
// migrated to the new primaryTopic/secondaryTopics shape) — this script
// reads it as the single source of truth and matches each live database
// document to a seed entry by its exact `code` field, which is unique
// across all 47 seed questions (unlike `question`, which is almost always
// the same shared prompt text). A document whose `code` doesn't match any
// seed entry is left untouched and reported, never guessed at.
//
// A production database can contain questions the seed mapping has never
// seen at all — added through the admin panel after the original 47, or
// without a code snippet (so `code` is empty/undefined and can never match
// a seed entry by design). The dry run lists every such question by _id and
// prompt so they can be triaged (assign a primaryTopic by hand, e.g. via the
// admin edit form, before migrating) — and --apply refuses to run at all
// while any are unmatched, rather than silently migrating a subset and
// leaving the rest without a primaryTopic (which the schema requires).
//
// Usage:
//   node backend/scripts/migrateQuestionTopics.js            # report only, no writes
//   node backend/scripts/migrateQuestionTopics.js --apply    # applies the migration
//                                                             # (refuses if any question is unmatched)
//
// Deployment checklist: see "Phase 3 addendum — production migration
// safety" in docs/AUDIT.md before ever running --apply against production.

require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri, MISSING_MONGO_URI_MESSAGE } = require('../config/mongoUri');
const Question = require('../models/questionModel');
const seedQuestions = require('../database/questions.json');

async function main() {
  const apply = process.argv.includes('--apply');

  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error(MISSING_MONGO_URI_MESSAGE);
    process.exitCode = 1;
    return;
  }

  const byCode = new Map(
    seedQuestions
      .filter((q) => q.primaryTopic)
      .map((q) => [q.code, { primaryTopic: q.primaryTopic, secondaryTopics: q.secondaryTopics || [] }])
  );

  await mongoose.connect(mongoUri);

  try {
    const questions = await Question.find({}).select('_id code question').lean();

    let matched = 0;
    const unmatched = [];
    const updates = [];

    for (const doc of questions) {
      const assignment = byCode.get(doc.code || '');
      if (!assignment) {
        unmatched.push(doc);
        continue;
      }
      matched += 1;
      updates.push({ _id: doc._id, ...assignment });
    }

    console.log(`${questions.length} question(s) in the database.`);
    console.log(`${matched} matched a seed entry by exact code.`);
    if (unmatched.length) {
      console.log(`${unmatched.length} unmatched — cannot be migrated automatically:`);
      for (const doc of unmatched) {
        const prompt = (doc.question || '(no question text)').replace(/\s+/g, ' ').slice(0, 120);
        console.log(`  - ${doc._id}  ${prompt}`);
      }
      console.log(
        'Each of these needs a primaryTopic assigned by hand (e.g. via the admin edit form) ' +
          'before this migration can be applied — see the deployment checklist in docs/AUDIT.md.'
      );
    }

    if (!apply) {
      console.log('[dry-run] No changes were made. Re-run with --apply to migrate.');
      return;
    }

    if (unmatched.length) {
      console.error(
        `Refusing to apply: ${unmatched.length} question(s) are unmatched (listed above). ` +
          'Resolve them first — --apply only runs when every question in the database can be migrated.'
      );
      process.exitCode = 1;
      return;
    }

    for (const update of updates) {
      // Uses the native driver (Question.collection), not Question.updateOne:
      // Mongoose's strict-update mode silently drops $unset for a path no
      // longer defined in the schema (topics was removed from
      // questionModel.js), so the collection-level call is needed for the
      // $unset to actually reach MongoDB.
      await Question.collection.updateOne(
        { _id: update._id },
        {
          $set: { primaryTopic: update.primaryTopic, secondaryTopics: update.secondaryTopics },
          $unset: { topics: '' },
        }
      );
    }
    console.log(`Migrated ${updates.length} question(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('migrateQuestionTopics failed:', error);
  process.exit(1);
});
