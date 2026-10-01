// The production data migration: ONE ordered runbook that converts a
// database written by the old site (commit 9b0d8b4 plus the server patch)
// into the shape v2 expects. docs/DEPLOY_RUNBOOK.md has the exact steps to
// run it; docs/FIX_PLAN.md ("Deployment preparation") has the findings and
// the owner's decisions behind every step.
//
// Steps, in order (each one only changes what still needs changing, so the
// whole runbook is idempotent: a second run finds nothing to do):
//    1. answer-field      questions.correctAnswer -> answer (M1)
//    2. duplicate-q25     merge the two copies of seed Q25: move answer
//                         history to the kept copy, delete the other (M4)
//    3. seed-questions    the 47 seed questions: content, stable topic ids
//                         and misconception tags from database/questions.json,
//                         matched by code or by earlier code
//                         (database/seedCodeHistory.json) (M2, M4)
//    4. other-questions   the 98 production-only questions: reviewed topic
//                         ids from database/productionTopicMapping.json (M2)
//    5. username-lower    backfill usernameLower, except accounts whose
//                         username collides case-insensitively with another
//                         (listed by id; the owner resolves them) (M5)
//    6. user-defaults     missing user fields get the schema defaults (M8)
//    7. answer-history    users.answeredQuestions -> useransweredquestions,
//                         everCorrect false, then the array is removed (M7)
//    8. old-sessions      delete quiz sessions from the old model (no token) (M9)
//    9. quizprogresses    drop the old, empty collection (M10)
//   10. indexes           build every index the v2 models define (M11)
//   11. verify            checks the result and says whether the database is
//                         READY TO REOPEN; also runs on a dry run
// Not changed: createdBy/createdAt/updatedAt on questions are kept (M3).
//
// SAFETY
// - The connection string comes ONLY from --uri. This script never reads
//   .env or MONGODB_URI/MONGO_URI.
// - Before anything else it prints the target host, database name and the
//   number of questions and users.
// - Dry run by default. --apply asks you to type the database name; anything
//   else aborts before any write.
// - Refuses to start (before any write) on data it doesn't expect: a
//   question that is neither a seed question nor in the reviewed mapping, a
//   seed question matched twice (other than Q25), conflicting answer fields,
//   or a non-empty quizprogresses collection.
// - Native-driver writes; Mongoose is connected with autoIndex/autoCreate
//   off, so nothing is built or created as a side effect. Indexes are built
//   only by step 10, explicitly.
// - Prints counts and ids only, never usernames, emails or other personal data.
//
// Exit codes on --apply: 0 migrated and ready to reopen; 2 migrated, but not
// ready to reopen (users without usernameLower, listed by id); 1 failed or
// refused. A dry run exits 0 and prints the same readiness verdict, so it can
// be re-run to check readiness after the username collisions are resolved.
//
// Usage (from backend/):
//   node scripts/productionMigration.js --uri "<connection string>"           # dry run
//   node scripts/productionMigration.js --uri "<connection string>" --apply   # writes
const readline = require('readline');
const mongoose = require('mongoose');
const { TOPIC_IDS } = require('../config/topicTaxonomy');
const { redactMongoUri } = require('../config/mongoUri');
const { addQuestionSchema } = require('../validators/questionValidators');
const { distractorProblem } = require('../utils/distractors');
const { MISCONCEPTION_IDS } = require('../config/conceptGraph');
const { DISTRACTOR_FEEDBACK_MAX_LENGTH } = require('../config/validationRules');
const seedQuestions = require('../database/questions.json');
const codeHistory = require('../database/seedCodeHistory.json');
const { questions: topicMapping } = require('../database/productionTopicMapping.json');

// Seed Q25 exists twice in production (owner's decision: keep the copy that
// more users answered, move the other copy's history to it).
const Q25_KEEP = '67dd1ccbe41a42083801b230';
const Q25_REMOVE = '67c45ba322943ce7acd24d21';

const SEED_FIELDS = ['question', 'code', 'options', 'answer', 'difficulty', 'primaryTopic', 'secondaryTopics', 'explanation', 'distractors'];
const USER_DEFAULTS = {
  avatar: null,
  role: 'user',
  banned: false,
  tokenVersion: 0,
  'stats.currentStreak': 0,
  'stats.bestStreak': 0,
  'stats.totalPoints': 0,
  'stats.totalCorrect': 0,
  'stats.totalAnswered': 0,
  'stats.lastAnsweredAt': null,
  'stats.timedModes.blitzBestScore': 0,
  'stats.timedModes.survivalBestStreak': 0,
  achievements: [],
  'dailyChallenge.date': null,
  'dailyChallenge.score': 0,
  'dailyChallenge.total': 0,
  'dailyChallenge.completedAt': null,
};

const log = (line = '') => console.log(line);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const oid = (id) => new mongoose.Types.ObjectId(id);

function parseArgs(argv) {
  const args = { uri: null, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--uri') args.uri = argv[(i += 1)] || null;
    else if (argv[i] === '--apply') args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

// Host(s) and database name, without credentials.
function describeTarget(uri) {
  const match = uri.match(/^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?]+)\/([^?]*)/);
  if (!match || !match[3]) return null;
  return { hosts: redactMongoUri(`${match[1]}://${match[2]}`), db: decodeURIComponent(match[3]) };
}

function seedMatcher() {
  const byCode = new Map(seedQuestions.map((q, i) => [q.code || '', i]));
  for (const { code, previousCodes } of codeHistory) {
    const i = seedQuestions.findIndex((q) => q.code === code);
    previousCodes.forEach((previous) => byCode.set(previous, i));
  }
  return (doc) => byCode.get(doc.code || '');
}

function desiredSeed(i) {
  const q = seedQuestions[i];
  return {
    question: q.question,
    code: q.code || '',
    options: q.options,
    answer: q.answer,
    difficulty: q.difficulty,
    primaryTopic: q.primaryTopic,
    secondaryTopics: q.secondaryTopics || [],
    explanation: q.explanation,
    distractors: q.distractors || [],
  };
}

const value = (doc, field) => {
  const v = doc[field];
  if (v !== undefined && v !== null) return v;
  if (field === 'secondaryTopics' || field === 'distractors') return [];
  if (field === 'code') return '';
  return v;
};

// ---------------------------------------------------------------- preflight

async function preflight(db) {
  const problems = [];
  const questions = await db.collection('questions').find({}).toArray();
  const matchSeed = seedMatcher();
  const seedMatches = new Map();
  for (const q of questions) {
    if (q.correctAnswer !== undefined && q.answer !== undefined && q.correctAnswer !== q.answer) {
      problems.push(`question ${q._id}: has both correctAnswer and answer, and they differ`);
    }
    if (q.correctAnswer === undefined && q.answer === undefined) problems.push(`question ${q._id}: has no answer field`);
    const i = matchSeed(q);
    if (i !== undefined) {
      seedMatches.set(i, [...(seedMatches.get(i) || []), String(q._id)]);
    } else if (!topicMapping[String(q._id)]) {
      problems.push(`question ${q._id}: neither a seed question nor in productionTopicMapping.json`);
    }
  }
  for (const [i, ids] of seedMatches) {
    const isQ25Pair = ids.length === 2 && ids.includes(Q25_KEEP) && ids.includes(Q25_REMOVE);
    if (ids.length > 1 && !isQ25Pair) problems.push(`seed Q${i + 1} matches ${ids.length} questions: ${ids.join(', ')}`);
  }
  const progresses = (await db.listCollections({ name: 'quizprogresses' }).toArray()).length
    ? await db.collection('quizprogresses').countDocuments()
    : 0;
  if (progresses) problems.push(`quizprogresses holds ${progresses} document(s); expected an empty collection`);
  return problems;
}

// -------------------------------------------------------------------- steps
// Each step: plan(db) -> { count, detail[] } on the database as it is now;
// apply(db) -> number of documents (or items) changed.

const steps = [
  {
    name: 'answer-field',
    describe: 'questions.correctAnswer -> answer',
    async plan(db) {
      const count = await db.collection('questions').countDocuments({ correctAnswer: { $exists: true } });
      return { count, detail: [] };
    },
    async apply(db) {
      const c = db.collection('questions');
      const renamed = await c.updateMany({ correctAnswer: { $exists: true }, answer: { $exists: false } }, { $rename: { correctAnswer: 'answer' } });
      // Both present and equal (checked in preflight): drop the old field.
      const dropped = await c.updateMany({ correctAnswer: { $exists: true } }, { $unset: { correctAnswer: '' } });
      return renamed.modifiedCount + dropped.modifiedCount;
    },
  },
  {
    name: 'duplicate-q25',
    describe: `merge seed Q25's copies: keep ${Q25_KEEP}, remove ${Q25_REMOVE}`,
    async plan(db) {
      const exists = await db.collection('questions').countDocuments({ _id: oid(Q25_REMOVE) });
      if (!exists) return { count: 0, detail: [] };
      const users = db.collection('users');
      const both = await users.countDocuments({ answeredQuestions: { $all: [Q25_REMOVE, Q25_KEEP] } });
      const only = (await users.countDocuments({ answeredQuestions: Q25_REMOVE })) - both;
      return { count: 1, detail: [`history moved for ${only} user(s), duplicate entry removed for ${both}; question ${Q25_REMOVE} deleted`] };
    },
    async apply(db) {
      if (!(await db.collection('questions').countDocuments({ _id: oid(Q25_REMOVE) }))) return 0;
      if (!(await db.collection('questions').countDocuments({ _id: oid(Q25_KEEP) }))) {
        throw new Error(`the copy to keep (${Q25_KEEP}) is missing; not merging`);
      }
      const users = db.collection('users');
      await users.updateMany({ answeredQuestions: { $all: [Q25_REMOVE, Q25_KEEP] } }, { $pull: { answeredQuestions: Q25_REMOVE } });
      await users.updateMany(
        { answeredQuestions: Q25_REMOVE },
        { $set: { 'answeredQuestions.$[old]': Q25_KEEP } },
        { arrayFilters: [{ old: Q25_REMOVE }] }
      );
      // Newer collections, in case the runbook is re-run after v2 has been live.
      const uaq = db.collection('useransweredquestions');
      for (const row of await uaq.find({ questionId: Q25_REMOVE }).toArray()) {
        const kept = await uaq.findOne({ userId: row.userId, questionId: Q25_KEEP });
        if (kept) {
          if (row.everCorrect && !kept.everCorrect) await uaq.updateOne({ _id: kept._id }, { $set: { everCorrect: true } });
          await uaq.deleteOne({ _id: row._id });
        } else {
          await uaq.updateOne({ _id: row._id }, { $set: { questionId: Q25_KEEP } });
        }
      }
      await db.collection('answerevents').updateMany({ questionId: oid(Q25_REMOVE) }, { $set: { questionId: oid(Q25_KEEP) } });
      await db.collection('dailychallengesets').updateMany(
        { questionIds: oid(Q25_REMOVE) },
        { $set: { 'questionIds.$[old]': oid(Q25_KEEP) } },
        { arrayFilters: [{ old: oid(Q25_REMOVE) }] }
      );
      await db.collection('questions').deleteOne({ _id: oid(Q25_REMOVE) });
      return 1;
    },
  },
  {
    name: 'seed-questions',
    describe: 'seed questions: content, topic ids and misconception tags from the seed file',
    async changes(db) {
      const matchSeed = seedMatcher();
      const out = [];
      for (const q of await db.collection('questions').find({}).toArray()) {
        const i = matchSeed(q);
        if (i === undefined || String(q._id) === Q25_REMOVE) continue;
        const want = desiredSeed(i);
        const answer = q.answer !== undefined ? q.answer : q.correctAnswer;
        const set = {};
        for (const field of SEED_FIELDS) {
          const current = field === 'answer' ? answer : value(q, field);
          if (!same(current, want[field])) set[field] = want[field];
        }
        const unset = {};
        if (q.topics !== undefined) unset.topics = '';
        if (Object.keys(set).length || Object.keys(unset).length) out.push({ _id: q._id, seed: i + 1, set, unset });
      }
      return out;
    },
    async plan(db) {
      const changes = await this.changes(db);
      return { count: changes.length, detail: changes.map((c) => `seed Q${c.seed} (${c._id}): ${[...Object.keys(c.set), ...Object.keys(c.unset).map((f) => `-${f}`)].join(', ')}`) };
    },
    async apply(db) {
      const changes = await this.changes(db);
      for (const { _id, set, unset } of changes) {
        const update = {};
        if (Object.keys(set).length) update.$set = set;
        if (Object.keys(unset).length) update.$unset = unset;
        await db.collection('questions').updateOne({ _id }, update);
      }
      return changes.length;
    },
  },
  {
    name: 'other-questions',
    describe: 'production-only questions: reviewed topic ids',
    async changes(db) {
      const out = [];
      const ids = Object.keys(topicMapping).map(oid);
      for (const q of await db.collection('questions').find({ _id: { $in: ids } }).toArray()) {
        const want = topicMapping[String(q._id)];
        const set = {};
        if (q.primaryTopic !== want.primaryTopic) set.primaryTopic = want.primaryTopic;
        if (!same(value(q, 'secondaryTopics'), want.secondaryTopics)) set.secondaryTopics = want.secondaryTopics;
        const unset = q.topics !== undefined ? { topics: '' } : {};
        if (Object.keys(set).length || Object.keys(unset).length) out.push({ _id: q._id, set, unset });
      }
      return out;
    },
    async plan(db) {
      const changes = await this.changes(db);
      const missing = Object.keys(topicMapping).length - (await db.collection('questions').countDocuments({ _id: { $in: Object.keys(topicMapping).map(oid) } }));
      return { count: changes.length, detail: missing ? [`${missing} mapped question(s) not in the database (skipped)`] : [] };
    },
    async apply(db) {
      const changes = await this.changes(db);
      for (const { _id, set, unset } of changes) {
        const update = {};
        if (Object.keys(set).length) update.$set = set;
        if (Object.keys(unset).length) update.$unset = unset;
        await db.collection('questions').updateOne({ _id }, update);
      }
      return changes.length;
    },
  },
  {
    name: 'username-lower',
    describe: 'backfill usernameLower (no renames)',
    async split(db) {
      const users = await db.collection('users').find({}, { projection: { username: 1, usernameLower: 1 } }).toArray();
      const groups = new Map();
      for (const u of users) {
        const key = String(u.username || '').toLowerCase();
        groups.set(key, [...(groups.get(key) || []), u]);
      }
      const todo = [];
      const colliding = [];
      for (const u of users) {
        if (u.usernameLower) continue;
        const key = String(u.username || '').toLowerCase();
        if (groups.get(key).length === 1) todo.push({ _id: u._id, usernameLower: key });
        else colliding.push(u._id);
      }
      return { todo, colliding };
    },
    async plan(db) {
      const { todo, colliding } = await this.split(db);
      return {
        count: todo.length,
        detail: colliding.length
          ? [`${colliding.length} account(s) skipped, their username collides with another account's (ids): ${colliding.join(', ')}`]
          : [],
      };
    },
    async apply(db) {
      const { todo } = await this.split(db);
      for (const { _id, usernameLower } of todo) {
        await db.collection('users').updateOne({ _id, usernameLower: { $exists: false } }, { $set: { usernameLower } });
      }
      return todo.length;
    },
  },
  {
    name: 'user-defaults',
    describe: 'missing user fields get the schema defaults',
    async plan(db) {
      const users = db.collection('users');
      const detail = [];
      let count = 0;
      for (const path of Object.keys(USER_DEFAULTS)) {
        const n = await users.countDocuments({ [path]: { $exists: false } });
        if (n) detail.push(`${path}: ${n}`);
        count = Math.max(count, n);
      }
      // count: users missing the most-often-missing field.
      return { count, detail: detail.length ? [`users missing each field: ${detail.join(', ')}`] : [] };
    },
    async apply(db) {
      const users = db.collection('users');
      // A parent that is null can't take a child field; make it an object first.
      for (const parent of ['stats', 'stats.timedModes', 'dailyChallenge']) {
        await users.updateMany({ [parent]: { $type: 'null' } }, { $set: { [parent]: {} } });
      }
      const touched = new Set();
      for (const [path, def] of Object.entries(USER_DEFAULTS)) {
        const ids = (await users.find({ [path]: { $exists: false } }, { projection: { _id: 1 } }).toArray()).map((u) => u._id);
        if (!ids.length) continue;
        await users.updateMany({ _id: { $in: ids }, [path]: { $exists: false } }, { $set: { [path]: def } });
        ids.forEach((id) => touched.add(String(id)));
      }
      return touched.size;
    },
  },
  {
    name: 'answer-history',
    describe: 'users.answeredQuestions -> useransweredquestions (everCorrect false)',
    async plan(db) {
      const users = await db.collection('users').find({ answeredQuestions: { $exists: true } }, { projection: { answeredQuestions: 1 } }).toArray();
      const entries = users.reduce((n, u) => n + (u.answeredQuestions || []).length, 0);
      const withEntries = users.filter((u) => (u.answeredQuestions || []).length).length;
      const existing = new Set((await db.collection('questions').find({}, { projection: { _id: 1 } }).toArray()).map((q) => String(q._id)));
      const dangling = users.reduce((n, u) => n + (u.answeredQuestions || []).filter((id) => !existing.has(String(id))).length, 0);
      return {
        count: users.length,
        detail: users.length
          ? [`${users.length} user(s) have the array, ${withEntries} with entries: ${entries} entries; ${dangling} refer to questions that don't exist (not migrated)`]
          : [],
      };
    },
    async apply(db) {
      const users = await db.collection('users').find({ answeredQuestions: { $exists: true } }, { projection: { answeredQuestions: 1 } }).toArray();
      const existing = new Set((await db.collection('questions').find({}, { projection: { _id: 1 } }).toArray()).map((q) => String(q._id)));
      const uaq = db.collection('useransweredquestions');
      const migratedAt = new Date();
      for (const u of users) {
        const ids = [...new Set((u.answeredQuestions || []).map(String))].filter((id) => existing.has(id));
        if (ids.length) {
          await uaq.bulkWrite(
            ids.map((questionId) => ({
              updateOne: {
                filter: { userId: u._id, questionId },
                // The old history has no correctness, so nothing counts as
                // ever-correct (owner's decision); answeredAt is unknown, so
                // it is the migration time.
                update: { $setOnInsert: { userId: u._id, questionId, answeredAt: migratedAt, everCorrect: false } },
                upsert: true,
              },
            })),
            { ordered: true }
          );
        }
        await db.collection('users').updateOne({ _id: u._id }, { $unset: { answeredQuestions: '' } });
      }
      return users.length;
    },
  },
  {
    name: 'old-sessions',
    describe: 'delete quiz sessions from the old model (no token)',
    async plan(db) {
      return { count: await db.collection('quizsessions').countDocuments({ token: { $exists: false } }), detail: [] };
    },
    async apply(db) {
      return (await db.collection('quizsessions').deleteMany({ token: { $exists: false } })).deletedCount;
    },
  },
  {
    name: 'quizprogresses',
    describe: 'drop the old, empty quizprogresses collection',
    async plan(db) {
      return { count: (await db.listCollections({ name: 'quizprogresses' }).toArray()).length, detail: [] };
    },
    async apply(db) {
      if (!(await db.listCollections({ name: 'quizprogresses' }).toArray()).length) return 0;
      if (await db.collection('quizprogresses').countDocuments()) throw new Error('quizprogresses is not empty; not dropping it');
      await db.collection('quizprogresses').drop();
      return 1;
    },
  },
  {
    name: 'indexes',
    describe: 'build every index the v2 models define',
    models() {
      return [
        require('../models/user'),
        require('../models/questionModel'),
        require('../models/quizSession'),
        require('../models/answerEvent'),
        require('../models/userAnsweredQuestion'),
        require('../models/dailyChallengeSet'),
        require('../models/resetPassword'),
        require('../models/contact'),
      ];
    },
    async missing(db) {
      const out = [];
      for (const Model of this.models()) {
        const exists = (await db.listCollections({ name: Model.collection.collectionName }).toArray()).length;
        const have = exists ? (await db.collection(Model.collection.collectionName).indexes()).map((i) => JSON.stringify(i.key)) : [];
        for (const [fields] of Model.schema.indexes()) {
          if (!have.includes(JSON.stringify(fields))) out.push(`${Model.collection.collectionName} ${JSON.stringify(fields)}`);
        }
      }
      return out;
    },
    async plan(db) {
      const missing = await this.missing(db);
      return { count: missing.length, detail: missing.length ? [`to build: ${missing.join('; ')}`] : [] };
    },
    async apply(db) {
      const missing = await this.missing(db);
      for (const Model of this.models()) await Model.createIndexes();
      return missing.length;
    },
  },
];

// ------------------------------------------------------------------- verify

// At most 12 ids per verification line (the readiness list is never cut).
function ids(list) {
  return list.length > 12 ? `${list.slice(0, 12).join(', ')} … and ${list.length - 12} more` : list.join(', ');
}

async function verify(db) {
  const results = [];
  const check = (ok, label, detail = '', level = 'FAIL') => results.push({ status: ok ? 'PASS' : level, label, detail });
  const questions = await db.collection('questions').find({}).toArray();
  // FAIL: what v2 needs to serve and score a question.
  const noAnswer = questions.filter((q) => typeof q.answer !== 'string' || !(q.options || []).includes(q.answer)).map((q) => String(q._id));
  check(!noAnswer.length, 'every question has an answer that is one of its options', ids(noAnswer));
  const badTopics = questions
    .filter((q) => !TOPIC_IDS.includes(q.primaryTopic) || (q.secondaryTopics || []).some((t) => !TOPIC_IDS.includes(t)))
    .map((q) => String(q._id));
  check(!badTopics.length, 'every question has stable topic ids', ids(badTopics));
  const badTags = questions
    .filter((q) => {
      const tags = q.distractors || [];
      return (
        distractorProblem({ options: q.options || [], answer: q.answer, distractors: tags }) !== null ||
        tags.some((t) => (t.misconceptionId && !MISCONCEPTION_IDS.includes(t.misconceptionId)) ||
          (t.feedback && t.feedback.length > DISTRACTOR_FEEDBACK_MAX_LENGTH) || (!t.misconceptionId && !t.feedback))
      );
    })
    .map((q) => String(q._id));
  check(!badTags.length, 'every misconception tag is valid (known id, a wrong option, at most one per option)', ids(badTags));
  // WARN: content the admin forms would reject (e.g. a duplicated option);
  // the owner fixes these in a reviewed content pass.
  const content = questions.filter((q) => !addQuestionSchema.safeParse({ ...q, code: q.code || '' }).success).map((q) => String(q._id));
  check(!content.length, 'every question passes all v2 question validators', `${content.length} to fix in a content pass: ${ids(content)}`, 'WARN');
  const legacy = questions.filter((q) => q.correctAnswer !== undefined || q.topics !== undefined).map((q) => String(q._id));
  check(!legacy.length, 'no question keeps correctAnswer or topics', ids(legacy));
  const matchSeed = seedMatcher();
  const seedDocs = questions.filter((q) => matchSeed(q) !== undefined);
  check(new Set(seedDocs.map(matchSeed)).size === seedDocs.length, `each seed question appears once (${seedDocs.length} seed question(s) in the database)`);
  check(!questions.some((q) => String(q._id) === Q25_REMOVE), 'the duplicate copy of seed Q25 is gone');
  const tags = questions.reduce((n, q) => n + (q.distractors || []).length, 0);
  check(true, `misconception tags stored: ${tags}`);

  const users = db.collection('users');
  check(!(await users.countDocuments({ answeredQuestions: { $exists: true } })), 'no user keeps the legacy answeredQuestions array');
  const noLower = (await users.find({ usernameLower: { $exists: false } }, { projection: { _id: 1 } }).toArray()).map((u) => String(u._id));
  results.usersWithoutUsernameLower = noLower;
  const missingDefaults = [];
  for (const path of Object.keys(USER_DEFAULTS)) {
    if (await users.countDocuments({ [path]: { $exists: false } })) missingDefaults.push(path);
  }
  check(!missingDefaults.length, 'every user has the v2 fields', missingDefaults.join(', '));
  check(true, `answer-history rows: ${await db.collection('useransweredquestions').countDocuments()}`);
  check(!(await db.collection('quizsessions').countDocuments({ token: { $exists: false } })), 'no old-model quiz sessions');
  check(!(await db.listCollections({ name: 'quizprogresses' }).toArray()).length, 'quizprogresses is gone');
  const missingIndexes = await steps.find((s) => s.name === 'indexes').missing(db);
  check(!missingIndexes.length, 'every v2 index exists', missingIndexes.join('; '));
  return results;
}

// Prints the checks and the readiness verdict. The database is ready to
// reopen only when no check FAILs and every user has usernameLower (the
// owner resolves the username collisions before reopening).
function printVerification(results) {
  for (const r of results) log(`  ${r.status.padEnd(4)} ${r.label}${r.status !== 'PASS' && r.detail ? `: ${r.detail}` : ''}`);
  const failures = results.filter((r) => r.status === 'FAIL').length;
  const noLower = results.usersWithoutUsernameLower;
  log();
  if (!failures && !noLower.length) {
    log('READY TO REOPEN: every check passed and every user has usernameLower.');
  } else {
    log('NOT READY TO REOPEN:');
    if (failures) log(`  - ${failures} check(s) failed (see FAIL above).`);
    if (noLower.length) {
      log(`  - ${noLower.length} user(s) without usernameLower (resolve their username collisions first): ${noLower.join(', ')}`);
    }
  }
  return { failures, ready: !failures && !noLower.length };
}

async function confirm(dbName) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const answer = await new Promise((resolve) => {
    rl.question(`Type the database name (${dbName}) to apply the migration: `, resolve);
    rl.on('close', () => resolve(null));
  });
  rl.close();
  return answer !== null && answer.trim() === dbName;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.uri) {
    console.error('Refusing: pass the connection string with --uri. This script never reads .env or MONGODB_URI/MONGO_URI.');
    return 1;
  }
  const target = describeTarget(args.uri);
  if (!target) {
    console.error('Refusing: the --uri must name a database, e.g. mongodb://127.0.0.1:27018/<database>.');
    return 1;
  }

  await mongoose.connect(args.uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  try {
    const db = mongoose.connection.db;
    log(`Target host: ${target.hosts}`);
    log(`Database:    ${db.databaseName}`);
    log(`Questions:   ${await db.collection('questions').countDocuments()}`);
    log(`Users:       ${await db.collection('users').countDocuments()}`);
    log(`Mode:        ${args.apply ? '--apply (writes after confirmation)' : 'dry run (no writes)'}`);
    log();

    const problems = await preflight(db);
    if (problems.length) {
      log(`Refusing: ${problems.length} unexpected finding(s); nothing was changed:`);
      problems.forEach((p) => log(`  - ${p}`));
      return 1;
    }

    log('Plan (computed on the database as it is now; on --apply the steps run in this order):');
    for (const [n, step] of steps.entries()) {
      const { count, detail } = await step.plan(db);
      log(`  ${String(n + 1).padStart(2)}. ${step.name.padEnd(16)} ${String(count).padStart(4)}  ${step.describe}`);
      detail.forEach((d) => log(`        ${d}`));
    }
    log();

    if (!args.apply) {
      log('Verification of the database as it is now (FAIL is expected before the migration):');
      printVerification(await verify(db));
      log();
      log('[dry-run] No changes were made. Re-run with --apply to write.');
      return 0;
    }

    if (!(await confirm(db.databaseName))) {
      log('Confirmation did not match the database name. Nothing was changed.');
      return 1;
    }
    log();
    for (const [n, step] of steps.entries()) {
      const changed = await step.apply(db);
      log(`  ${String(n + 1).padStart(2)}. ${step.name.padEnd(16)} done (${changed} changed)`);
    }
    log();
    log('Verification:');
    const { failures, ready } = printVerification(await verify(db));
    log();
    if (failures) {
      log(`${failures} check(s) failed. See above.`);
      return 1;
    }
    log('Migration complete; every check passed (see WARN lines, if any).');
    // Exit code 2: migrated, but not ready to reopen yet.
    return ready ? 0 : 2;
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
      console.error(`productionMigration failed: ${error.message}`);
      process.exitCode = 1;
    }
  );
}

module.exports = { parseArgs, describeTarget };
