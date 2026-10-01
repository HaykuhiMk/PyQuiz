// Stable topic ids (config/topicTaxonomy.js, docs/CONCEPT_GRAPH.md §5).
// Topics are stored and passed by id; display names live only in the config
// and are served by GET /api/v1/topics.
//
// Includes the regression test for the comma bug: "?topics=" is split on
// commas, and the display name "Names, Mutability & Identity" contains one,
// so filtering by that topic used to fail with 400 in Study mode, the admin
// question list and the random-question endpoint.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DAILY_CHALLENGE_SEED_SECRET = process.env.DAILY_CHALLENGE_SEED_SECRET || 'test-daily-secret';

const path = require('path');
const { execFileSync } = require('child_process');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin, adminSessionHeaders, DEFAULT_PASSWORD } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');
const User = require('../models/user');
const DailyChallengeSet = require('../models/dailyChallengeSet');
const dailyChallengeService = require('../services/dailyChallengeService');
const { TOPICS, TOPIC_IDS } = require('../config/topicTaxonomy');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

function createQuestion(overrides = {}) {
  return Question.create({
    question: 'Q',
    code: `x = ${Math.random()}`,
    options: ['a', 'b'],
    answer: 'b',
    difficulty: 'easy',
    primaryTopic: 'lists',
    secondaryTopics: [],
    explanation: 'e',
    ...overrides,
  });
}

async function adminHeaders() {
  await User.create({
    username: 'topicidadmin',
    email: 'topicidadmin@example.com',
    password: await bcrypt.hash(DEFAULT_PASSWORD, 10),
    role: 'admin',
  });
  const res = await request(app).post('/api/v1/admin/login').send({ username: 'topicidadmin', password: DEFAULT_PASSWORD });
  return adminSessionHeaders(res);
}

describe('the taxonomy uses stable ids', () => {
  it('has unique, comma-free, lowercase ids and a name for each', () => {
    expect(new Set(TOPIC_IDS).size).toBe(TOPIC_IDS.length);
    for (const { id, name } of TOPICS) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('accepts the five topics added with the production migration on questions', async () => {
    for (const id of ['classes', 'inheritance', 'scope', 'generators', 'exceptions']) {
      const q = await createQuestion({ primaryTopic: id });
      expect((await Question.collection.findOne({ _id: q._id })).primaryTopic).toBe(id);
    }
    expect(TOPIC_IDS).toHaveLength(16);
  });

  it('GET /api/v1/topics returns every topic as { id, name }, in taxonomy order', async () => {
    const res = await request(app).get('/api/v1/topics');
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual(TOPICS.map(({ id, name }) => ({ id, name })));
  });

  it('GET /questions/topics returns only topics with questions, as { id, name } sorted by name', async () => {
    await createQuestion({ primaryTopic: 'strings' });
    await createQuestion({ primaryTopic: 'mutability' });
    const res = await request(app).get('/api/v1/questions/topics');
    expect(res.body.data).toEqual([
      { id: 'mutability', name: 'Names, Mutability & Identity' },
      { id: 'strings', name: 'Strings' },
    ]);
  });

  it('stores the id on a question and rejects a display name', async () => {
    const q = await createQuestion({ primaryTopic: 'mutability', secondaryTopics: ['lists'] });
    const raw = await Question.collection.findOne({ _id: q._id });
    expect(raw.primaryTopic).toBe('mutability');
    expect(raw.secondaryTopics).toEqual(['lists']);

    await expect(createQuestion({ primaryTopic: 'Names, Mutability & Identity' })).rejects.toThrow();
  });

  it('rejects display names in API filters (breaking change: ids only)', async () => {
    const res = await request(app).get(`/api/v1/questions?topics=${encodeURIComponent('Strings')}`);
    expect(res.statusCode).toBe(400);
  });
});

describe('regression: filtering by the "Names, Mutability & Identity" topic works', () => {
  async function seed() {
    // Study mode excludes today's Daily Challenge questions, which with this
    // few questions would be all of them: freeze today's set on a decoy
    // question of an unrelated topic, the same way progress.test.js does.
    const decoy = await createQuestion({ primaryTopic: 'numbers' });
    await DailyChallengeSet.create({ date: dailyChallengeService.getTodayKey(), questionIds: [decoy._id] });
    const match = await createQuestion({ primaryTopic: 'mutability' });
    const secondaryMatch = await createQuestion({ primaryTopic: 'lists', secondaryTopics: ['mutability'] });
    await createQuestion({ primaryTopic: 'strings' });
    return new Set([String(match._id), String(secondaryMatch._id)]);
  }

  it('in Study mode', async () => {
    const expected = await seed();
    const { cookieHeader } = await registerAndLogin('studycomma@example.com', { username: 'studycomma' });
    const res = await request(app).get('/api/v1/questions/study?topics=mutability').set('Cookie', cookieHeader);
    expect(res.statusCode).toBe(200);
    expect(new Set(res.body.data.map((q) => String(q._id)))).toEqual(expected);
  });

  it('in the admin question list', async () => {
    const expected = await seed();
    const res = await request(app).get('/api/v1/admin/questions?topics=mutability').set(await adminHeaders());
    expect(res.statusCode).toBe(200);
    expect(new Set(res.body.data.map((q) => String(q._id)))).toEqual(expected);
  });

  it('in the random-question endpoint', async () => {
    const expected = await seed();
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get('/api/v1/questions/random?topics=mutability');
      expect(res.statusCode).toBe(200);
      expect(expected.has(String(res.body.data._id))).toBe(true);
    }
  });

  it('together with another topic in one comma-separated filter', async () => {
    await seed();
    const { cookieHeader } = await registerAndLogin('studycomma2@example.com', { username: 'studycomma2' });
    const res = await request(app).get('/api/v1/questions/study?topics=mutability,strings').set('Cookie', cookieHeader);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });
});

describe('scripts/migrateTopicIds.js (display names -> ids)', () => {
  const script = path.join(__dirname, '..', 'scripts', 'migrateTopicIds.js');
  const run = (...args) => {
    const { host, port, name } = mongoose.connection;
    try {
      return { code: 0, out: execFileSync(process.execPath, [script, ...args], {
        env: { ...process.env, MONGODB_URI: `mongodb://${host}:${port}/${name}`, MONGO_URI: '' },
        encoding: 'utf8',
      }) };
    } catch (error) {
      return { code: error.status, out: `${error.stdout}${error.stderr}` };
    }
  };

  async function insertLegacy() {
    // Native inserts, bypassing the schema enum, exactly as data written
    // before the stable ids looks.
    await Question.collection.insertMany([
      { question: 'Q1', options: ['a'], answer: 'a', difficulty: 'easy', explanation: 'e', primaryTopic: 'Names, Mutability & Identity', secondaryTopics: ['Lists'] },
      { question: 'Q2', options: ['a'], answer: 'a', difficulty: 'easy', explanation: 'e', primaryTopic: 'strings', secondaryTopics: [] },
    ]);
    await mongoose.connection.collection('quizsessions').insertOne({ token: 't1', mode: 'classic', filters: { topics: ['Loops & Control Flow', 'sets'] } });
  }

  it('dry run by default: reports, writes nothing', async () => {
    await insertLegacy();
    const { code, out } = run();
    expect(code).toBe(0);
    expect(out).toMatch(/1 question\(s\) to convert; 1 quiz session\(s\) to convert/);
    expect(out).toMatch(/\[dry-run\]/);
    expect(await Question.collection.countDocuments({ primaryTopic: 'Names, Mutability & Identity' })).toBe(1);
  });

  it('--apply converts names to ids, and a second run changes nothing (idempotent)', async () => {
    await insertLegacy();
    expect(run('--apply').code).toBe(0);

    const q1 = await Question.collection.findOne({ question: 'Q1' });
    expect(q1.primaryTopic).toBe('mutability');
    expect(q1.secondaryTopics).toEqual(['lists']);
    const session = await mongoose.connection.collection('quizsessions').findOne({ token: 't1' });
    expect(session.filters.topics).toEqual(['loops', 'sets']);

    const again = run('--apply');
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/0 question\(s\) to convert; 0 quiz session\(s\) to convert/);
  });

  it('refuses to apply when a value is neither an id nor a known name', async () => {
    await insertLegacy();
    await Question.collection.insertOne({ question: 'Q3', options: ['a'], answer: 'a', difficulty: 'easy', explanation: 'e', primaryTopic: 'Mystery Topic', secondaryTopics: [] });

    const res = run('--apply');
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/unknown primaryTopic "Mystery Topic"/);
    expect(await Question.collection.countDocuments({ primaryTopic: 'Names, Mutability & Identity' })).toBe(1);
  });
});
