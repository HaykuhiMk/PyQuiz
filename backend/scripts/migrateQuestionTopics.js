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
// Usage:
//   node backend/scripts/migrateQuestionTopics.js            # report only, no writes
//   node backend/scripts/migrateQuestionTopics.js --apply    # applies the migration
//
// Never run --apply against production — restricted to the local
// development database for this task.

require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/questionModel');
const seedQuestions = require('../database/questions.json');

async function main() {
  const apply = process.argv.includes('--apply');

  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI in the environment — see backend/env.example.');
    process.exitCode = 1;
    return;
  }

  const byCode = new Map(
    seedQuestions
      .filter((q) => q.primaryTopic)
      .map((q) => [q.code, { primaryTopic: q.primaryTopic, secondaryTopics: q.secondaryTopics || [] }])
  );

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const questions = await Question.find({}).select('_id code').lean();

    let matched = 0;
    const unmatched = [];
    const updates = [];

    for (const doc of questions) {
      const assignment = byCode.get(doc.code || '');
      if (!assignment) {
        unmatched.push(doc._id);
        continue;
      }
      matched += 1;
      updates.push({ _id: doc._id, ...assignment });
    }

    console.log(`${questions.length} question(s) in the database.`);
    console.log(`${matched} matched a seed entry by exact code.`);
    if (unmatched.length) {
      console.log(`${unmatched.length} unmatched (left untouched): ${unmatched.join(', ')}`);
    }

    if (!apply) {
      console.log('[dry-run] No changes were made. Re-run with --apply to migrate.');
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
