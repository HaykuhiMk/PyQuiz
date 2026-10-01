// One-time migration: replaces topic display names with stable topic ids
// (config/topicTaxonomy.js, docs/CONCEPT_GRAPH.md §5) wherever topics are
// stored:
//   - questions: primaryTopic, secondaryTopics
//   - quizsessions: filters.topics
//
// For databases that were already migrated to primaryTopic/secondaryTopics
// with display names (the local dev database). A database migrated later
// with scripts/migrateQuestionTopics.js gets ids directly, because the seed
// file now holds ids, and needs no run of this script.
//
// Dry run by default; --apply writes. Idempotent: values that are already
// ids are left alone, so re-running changes nothing. Refuses to write
// anything if it finds a topic value that is neither a known id nor a known
// display name, listing where it is so it can be fixed first.
//
// Writes use the native MongoDB driver (never Mongoose update helpers), and
// Mongoose is connected with autoIndex/autoCreate off, so loading this
// script never builds indexes or creates collections as a side effect.
//
// Usage (local dev database only; never against production):
//   node backend/scripts/migrateTopicIds.js           # dry run
//   node backend/scripts/migrateTopicIds.js --apply   # writes
require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri, redactMongoUri, MISSING_MONGO_URI_MESSAGE } = require('../config/mongoUri');
const { TOPICS } = require('../config/topicTaxonomy');

const ID_SET = new Set(TOPICS.map((t) => t.id));
const ID_BY_NAME = new Map(TOPICS.map((t) => [t.name, t.id]));

// Returns the id for a stored value, or null if it is unknown.
function toId(value) {
  if (ID_SET.has(value)) return value;
  return ID_BY_NAME.get(value) || null;
}

function convertList(values, problems, where) {
  let changed = false;
  const converted = (values || []).map((value) => {
    const id = toId(value);
    if (!id) {
      problems.push(`${where}: unknown topic ${JSON.stringify(value)}`);
      return value;
    }
    if (id !== value) changed = true;
    return id;
  });
  return { converted, changed };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error(MISSING_MONGO_URI_MESSAGE);
    process.exitCode = 1;
    return;
  }

  const target = new URL(mongoUri);
  console.log(`Target: ${redactMongoUri(`${target.protocol}//${target.host}`)} database ${target.pathname.slice(1) || '(default)'}`);
  console.log(apply ? 'Mode: --apply (writes)' : 'Mode: dry run (no writes)');

  await mongoose.connect(mongoUri, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;

  try {
    const problems = [];
    const questionUpdates = [];
    for (const q of await db.collection('questions').find({}, { projection: { primaryTopic: 1, secondaryTopics: 1 } }).toArray()) {
      const where = `question ${q._id}`;
      const primary = toId(q.primaryTopic);
      if (!primary) problems.push(`${where}: unknown primaryTopic ${JSON.stringify(q.primaryTopic)}`);
      const secondary = convertList(q.secondaryTopics, problems, where);
      if ((primary && primary !== q.primaryTopic) || secondary.changed) {
        questionUpdates.push({ _id: q._id, primaryTopic: primary || q.primaryTopic, secondaryTopics: secondary.converted });
      }
    }

    const sessionUpdates = [];
    for (const s of await db.collection('quizsessions').find({ 'filters.topics.0': { $exists: true } }, { projection: { 'filters.topics': 1 } }).toArray()) {
      const topics = convertList(s.filters.topics, problems, `quiz session ${s._id}`);
      if (topics.changed) sessionUpdates.push({ _id: s._id, topics: topics.converted });
    }

    console.log(`${questionUpdates.length} question(s) to convert; ${sessionUpdates.length} quiz session(s) to convert.`);
    if (problems.length) {
      console.log(`${problems.length} value(s) that are neither a topic id nor a known display name:`);
      for (const p of problems) console.log(`  - ${p}`);
    }

    if (!apply) {
      console.log('[dry-run] No changes were made. Re-run with --apply to convert.');
      return;
    }
    if (problems.length) {
      console.error('Refusing to apply: resolve the unknown topic values above first.');
      process.exitCode = 1;
      return;
    }

    for (const u of questionUpdates) {
      await db.collection('questions').updateOne(
        { _id: u._id },
        { $set: { primaryTopic: u.primaryTopic, secondaryTopics: u.secondaryTopics } }
      );
    }
    for (const u of sessionUpdates) {
      await db.collection('quizsessions').updateOne({ _id: u._id }, { $set: { 'filters.topics': u.topics } });
    }
    console.log(`Converted ${questionUpdates.length} question(s) and ${sessionUpdates.length} quiz session(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('migrateTopicIds failed:', error.message);
  process.exitCode = 1;
});
