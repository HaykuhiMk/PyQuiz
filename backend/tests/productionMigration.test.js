// scripts/productionMigration.js: the ordered production runbook, run here
// against the local test database on data shaped like production's (old
// question fields, old answer history, old quiz sessions).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');
const db = require('./testUtils/db');
const seed = require('../database/questions.json');
const codeHistory = require('../database/seedCodeHistory.json');
const { questions: topicMapping } = require('../database/productionTopicMapping.json');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'productionMigration.js');
const Q25_KEEP = '67dd1ccbe41a42083801b230';
const Q25_REMOVE = '67c45ba322943ce7acd24d21';
const OTHER_ID = Object.keys(topicMapping)[0];
const Q11_OLD_CODE = codeHistory.find((h) => h.code === seed[10].code).previousCodes[0];
const oid = (id) => new mongoose.Types.ObjectId(id);

beforeAll(async () => {
  await db.connect();
}, 30000);

// The script writes natively to collections no model in this process
// registers, so clearDatabase() (registered models only) isn't enough.
afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

const uri = () => {
  const { host, port, name } = mongoose.connection;
  return `mongodb://${host}:${port}/${name}`;
};

function run(args, input) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:1/must-not-be-used', MONGO_URI: '' },
    input: input === undefined ? '' : input,
    encoding: 'utf8',
    timeout: 60000,
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

// Production's old shape: correctAnswer, free-form topics, createdBy and
// timestamps on questions; answeredQuestions arrays and no v2 fields on users.
function legacyQuestion(q, extra = {}) {
  return {
    question: q.question,
    code: q.code,
    options: q.options,
    correctAnswer: q.answer,
    difficulty: q.difficulty,
    explanation: 'old explanation',
    topics: ['Old Tag'],
    createdBy: 'admin',
    createdAt: new Date('2025-07-22'),
    updatedAt: new Date('2025-07-22'),
    ...extra,
  };
}

async function insertLegacy() {
  const c = (name) => mongoose.connection.db.collection(name);
  const ids = { q1: new mongoose.Types.ObjectId(), q11: new mongoose.Types.ObjectId() };
  await c('questions').insertMany([
    { _id: ids.q1, ...legacyQuestion(seed[0]) },
    { _id: ids.q11, ...legacyQuestion(seed[10], { code: Q11_OLD_CODE, options: ['a', 'b'], correctAnswer: 'a' }) },
    { _id: oid(Q25_KEEP), ...legacyQuestion(seed[24]) },
    { _id: oid(Q25_REMOVE), ...legacyQuestion(seed[24], { options: [...seed[24].options].reverse() }) },
    { _id: oid(OTHER_ID), question: 'Q', code: 'print(1)', options: ['1', '2'], correctAnswer: '1', difficulty: 'easy', explanation: 'e', topics: ['Old'] },
  ]);
  const users = await c('users').insertMany([
    { username: 'Solo', email: 'solo@example.com', password: 'x', role: 'user', answeredQuestions: [Q25_REMOVE, String(ids.q1)] },
    { username: 'Both', email: 'both@example.com', password: 'x', role: 'user', answeredQuestions: [Q25_REMOVE, Q25_KEEP] },
    { username: 'Alex', email: 'a1@example.com', password: 'x', role: 'user', answeredQuestions: [] },
    { username: 'alex', email: 'a2@example.com', password: 'x', role: 'admin' },
  ]);
  await c('quizsessions').insertMany([
    { email: 'solo@example.com', startTime: new Date(), status: 'active' },
    { email: 'both@example.com', startTime: new Date(), status: 'done' },
  ]);
  await mongoose.connection.db.createCollection('quizprogresses');
  return { ...ids, users: Object.values(users.insertedIds) };
}

const snapshot = async () => {
  const out = {};
  for (const name of ['questions', 'users', 'quizsessions', 'useransweredquestions']) {
    out[name] = await mongoose.connection.db.collection(name).find({}).sort({ _id: 1 }).toArray();
  }
  return JSON.stringify(out);
};

describe('scripts/productionMigration.js', () => {
  it('refuses without --uri, even when MONGODB_URI is set', () => {
    const res = run([]);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/pass the connection string with --uri/);
  });

  it('dry run: prints the target, database and question count first, plans, and writes nothing', async () => {
    await insertLegacy();
    const before = await snapshot();
    const res = run(['--uri', uri()]);
    expect(res.code).toBe(0);
    const lines = res.out.split('\n');
    expect(lines[0]).toMatch(/^Target host: mongodb:\/\/(127\.0\.0\.1|localhost):\d+$/);
    expect(lines[1]).toBe(`Database:    ${mongoose.connection.name}`);
    expect(lines[2]).toBe('Questions:   5');
    expect(res.out).toMatch(/answer-field\s+5/);
    expect(res.out).toMatch(/history moved for 1 user\(s\), duplicate entry removed for 1/);
    expect(res.out).toMatch(/username-lower\s+2 .*\n.*2 account\(s\) skipped/);
    expect(res.out).toMatch(/old-sessions\s+2/);
    expect(res.out).toMatch(/\[dry-run\] No changes were made/);
    expect(await snapshot()).toBe(before);
  });

  it('--apply aborts without writing when the typed name does not match', async () => {
    await insertLegacy();
    const before = await snapshot();
    const res = run(['--uri', uri(), '--apply'], 'pyquiz\n');
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/Confirmation did not match the database name. Nothing was changed./);
    expect(await snapshot()).toBe(before);
  });

  it('--apply migrates everything, then a second run changes nothing', async () => {
    const ids = await insertLegacy();
    const res = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(res.out).toMatch(/Migration complete; every check passed/);
    // Migrated, but the two colliding accounts keep it from being ready.
    expect(res.code).toBe(2);

    const c = (name) => mongoose.connection.db.collection(name);
    // Questions: answer field, seed content/topics/tags, duplicate merged, mapping topics.
    const q1 = await c('questions').findOne({ _id: ids.q1 });
    expect(q1).toMatchObject({ answer: seed[0].answer, primaryTopic: seed[0].primaryTopic, explanation: seed[0].explanation, distractors: seed[0].distractors, createdBy: 'admin' });
    expect(q1.correctAnswer).toBeUndefined();
    expect(q1.topics).toBeUndefined();
    const q11 = await c('questions').findOne({ _id: ids.q11 });
    expect(q11).toMatchObject({ code: seed[10].code, options: seed[10].options, answer: seed[10].answer, distractors: seed[10].distractors });
    expect(await c('questions').findOne({ _id: oid(Q25_REMOVE) })).toBeNull();
    expect((await c('questions').findOne({ _id: oid(Q25_KEEP) })).options).toEqual(seed[24].options);
    const other = await c('questions').findOne({ _id: oid(OTHER_ID) });
    expect(other).toMatchObject({ answer: '1', primaryTopic: topicMapping[OTHER_ID].primaryTopic, secondaryTopics: topicMapping[OTHER_ID].secondaryTopics });

    // Users: history moved (Q25 repointed and deduplicated), defaults, usernameLower except collisions.
    const [solo, both, alex1, alex2] = await Promise.all(ids.users.map((_id) => c('users').findOne({ _id })));
    for (const u of [solo, both, alex1, alex2]) {
      expect(u.answeredQuestions).toBeUndefined();
      expect(u).toMatchObject({ banned: false, tokenVersion: 0, achievements: [], stats: { totalPoints: 0, timedModes: { blitzBestScore: 0 } } });
    }
    expect(alex2.role).toBe('admin');
    expect([solo.usernameLower, both.usernameLower]).toEqual(['solo', 'both']);
    expect(alex1.usernameLower).toBeUndefined();
    expect(alex2.usernameLower).toBeUndefined();
    const history = await c('useransweredquestions').find({}).toArray();
    const rows = (user) => history.filter((h) => String(h.userId) === String(user._id)).map((h) => h.questionId).sort();
    expect(rows(solo)).toEqual([String(ids.q1), Q25_KEEP].sort());
    expect(rows(both)).toEqual([Q25_KEEP]);
    expect(history.every((h) => h.everCorrect === false)).toBe(true);

    // Old sessions and quizprogresses gone; v2 indexes built.
    expect(await c('quizsessions').countDocuments()).toBe(0);
    expect((await mongoose.connection.db.listCollections({ name: 'quizprogresses' }).toArray()).length).toBe(0);
    const names = (await c('users').indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['usernameLower_1', 'email_1']));
    expect((await c('quizsessions').indexes()).map((i) => i.name)).toContain('token_1');
    expect(res.out).toMatch(
      new RegExp(`NOT READY TO REOPEN:\\n  - 2 user\\(s\\) without usernameLower \\(resolve their username collisions first\\): ${alex1._id}, ${alex2._id}`)
    );

    const again = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(again.code).toBe(2);
    for (const step of ['answer-field', 'duplicate-q25', 'seed-questions', 'other-questions', 'username-lower', 'user-defaults', 'answer-history', 'old-sessions', 'quizprogresses', 'indexes']) {
      expect(again.out).toMatch(new RegExp(`${step}\\s+done \\(0 changed\\)`));
    }

    // The owner resolves the collision (renames one account); a dry run then
    // reports the database ready to reopen.
    await c('users').updateOne({ _id: alex2._id }, { $set: { username: 'alex2', usernameLower: 'alex2' } });
    await c('users').updateOne({ _id: alex1._id }, { $set: { usernameLower: 'alex' } });
    const check = run(['--uri', uri()]);
    expect(check.code).toBe(0);
    expect(check.out).toMatch(/READY TO REOPEN: every check passed and every user has usernameLower\./);
    expect(check.out).not.toMatch(/NOT READY/);
  }, 120000);

  it('refuses before any write when a question is neither a seed question nor in the reviewed mapping', async () => {
    await insertLegacy();
    await mongoose.connection.db.collection('questions').insertOne({ question: 'Mystery', code: 'print(2)', options: ['2'], correctAnswer: '2', difficulty: 'easy', explanation: 'e' });
    const before = await snapshot();
    const res = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/Refusing: 1 unexpected finding\(s\); nothing was changed/);
    expect(res.out).toMatch(/neither a seed question nor in productionTopicMapping.json/);
    expect(await snapshot()).toBe(before);
  });
});
