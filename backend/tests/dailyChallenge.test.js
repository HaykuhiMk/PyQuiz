process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

function seedQuestions(count = 5) {
  const docs = Array.from({ length: count }, (_, i) => ({
    question: `Question ${i}`,
    options: ['a', 'b', 'c'],
    answer: 'a',
    difficulty: 'easy',
    topics: ['t'],
    explanation: 'because a is correct',
  }));
  return Question.insertMany(docs);
}

describe('GET /api/v1/challenges/daily', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/challenges/daily');
    expect(res.statusCode).toBe(401);
  });

  it('does not leak answers or explanations', async () => {
    await seedQuestions();
    const { cookieHeader } = await registerAndLogin('daily1@example.com');

    const res = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.questions.length).toBeGreaterThan(0);
    for (const q of res.body.data.questions) {
      expect(q.answer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }
  });
});

describe('POST /api/v1/challenges/daily/submit', () => {
  it('scores a fully correct submission and blocks a second attempt same day', async () => {
    await seedQuestions();
    const { cookieHeader, csrfToken } = await registerAndLogin('daily2@example.com');

    const daily = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    const questions = daily.body.data.questions;

    const fullQuestions = await Question.find({ _id: { $in: questions.map((q) => q._id) } }).lean();
    const answers = questions.map((q) => {
      const full = fullQuestions.find((f) => String(f._id) === String(q._id));
      return { questionId: q._id, selectedIndex: full.options.indexOf(full.answer) };
    });

    const submit = await request(app)
      .post('/api/v1/challenges/daily/submit')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ answers });

    expect(submit.statusCode).toBe(200);
    expect(submit.body.data.score).toBe(questions.length);

    const second = await request(app)
      .post('/api/v1/challenges/daily/submit')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ answers });

    expect(second.statusCode).toBe(400);
  });

  it('rejects a submission with no CSRF header', async () => {
    await seedQuestions();
    const { cookieHeader } = await registerAndLogin('daily3@example.com');

    const res = await request(app)
      .post('/api/v1/challenges/daily/submit')
      .set('Cookie', cookieHeader)
      .send({ answers: [] });

    expect(res.statusCode).toBe(403);
  });
});
