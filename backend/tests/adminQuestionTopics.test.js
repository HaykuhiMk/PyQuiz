// Canonical-topic validation for the admin question form (docs/AUDIT.md
// Phase 3 taxonomy revision): a required primaryTopic from the canonical
// list, optional secondaryTopics from the same list, and no overlap between
// the two. Split out from adminQuestions.test.js so this file's own
// admin-login calls get a fresh rate-limiter budget rather than pushing
// that file's total over /api/v1/admin/login's 20/15min limit.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('./testUtils/db');
const { adminSessionHeaders } = require('./testUtils/authHelpers');
const User = require('../models/user');
const Question = require('../models/questionModel');

const VALID_PASSWORD = 'Passw0rd!';
const validQuestionPayload = {
  question: 'What does len([1, 2, 3]) return?',
  options: ['2', '3', '4'],
  answer: '3',
  difficulty: 'easy',
  primaryTopic: 'Functions & Built-ins',
  secondaryTopics: ['Lists'],
  explanation: 'There are three elements in the list.',
};

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

async function adminLogin() {
  const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
  await User.create({
    username: 'topicsadmin',
    email: 'topicsadmin@example.com',
    password: hashed,
    role: 'admin',
  });

  const res = await request(app)
    .post('/api/v1/admin/login')
    .send({ username: 'topicsadmin', password: VALID_PASSWORD });
  return adminSessionHeaders(res);
}

function createQuestionDirectly(overrides = {}) {
  return Question.create({ ...validQuestionPayload, ...overrides });
}

describe('POST /api/v1/questions/add — canonical topic validation', () => {
  it('rejects a primaryTopic outside the canonical taxonomy', async () => {
    const adminHeaders = await adminLogin();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set(adminHeaders)
      .send({ ...validQuestionPayload, primaryTopic: 'Not A Real Topic' });

    expect(res.statusCode).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('rejects a topic that is both primary and secondary', async () => {
    const adminHeaders = await adminLogin();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set(adminHeaders)
      .send({ ...validQuestionPayload, primaryTopic: 'Lists', secondaryTopics: ['Lists'] });

    expect(res.statusCode).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('accepts a question with only a primary topic and no secondary topics', async () => {
    const adminHeaders = await adminLogin();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set(adminHeaders)
      .send({ ...validQuestionPayload, secondaryTopics: undefined });

    expect(res.statusCode).toBe(201);
  });
});

describe('PATCH /api/v1/admin/questions/:id — canonical topic validation', () => {
  it('rejects changing secondaryTopics to include the (unchanged) primaryTopic', async () => {
    const q = await createQuestionDirectly(); // primaryTopic: 'Functions & Built-ins'
    const adminHeaders = await adminLogin();

    const res = await request(app)
      .patch(`/api/v1/admin/questions/${q._id}`)
      .set(adminHeaders)
      .send({ secondaryTopics: ['Functions & Built-ins'] });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/questions?topics= — primary OR secondary match (Phase 3 taxonomy revision)', () => {
  it('returns a question when the filter topic is only its secondary topic, not its primary', async () => {
    const q = await createQuestionDirectly({
      primaryTopic: 'Functions & Built-ins',
      secondaryTopics: ['Sets'],
    });
    await createQuestionDirectly({
      question: 'A different question, unrelated to Sets',
      primaryTopic: 'Strings',
      secondaryTopics: [],
    });

    const res = await request(app).get('/api/v1/questions').query({ topics: 'Sets' });

    expect(res.statusCode).toBe(200);
    const ids = res.body.data.map((item) => item._id);
    expect(ids).toContain(q._id.toString());
    expect(ids).toHaveLength(1); // the unrelated Strings-only question must not match
  });
});
