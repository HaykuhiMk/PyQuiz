// GET /api/v1/questions/stats — public aggregate counts for the About page
// (fixes the Phase 2 regression where about.js read the total from the
// login-only Study endpoint and always got a 401).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
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

function createQuestion(overrides = {}) {
  return Question.create({
    question: 'SECRET-PROMPT-TEXT',
    options: ['a', 'b', 'c', 'd'],
    answer: 'b',
    difficulty: 'easy',
    primaryTopic: 'lists',
    secondaryTopics: [],
    explanation: 'SECRET-EXPLANATION',
    ...overrides,
  });
}

describe('GET /api/v1/questions/stats', () => {
  it('is public and returns only aggregate counts', async () => {
    await createQuestion();
    await createQuestion({ primaryTopic: 'strings' });
    await createQuestion({ primaryTopic: 'strings' });

    const res = await request(app).get('/api/v1/questions/stats');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ totalQuestions: 3, topicCount: 2 });
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|"answer"|"options"/);
  });

  it('counts only topics that have questions', async () => {
    const res = await request(app).get('/api/v1/questions/stats');
    expect(res.body.data).toEqual({ totalQuestions: 0, topicCount: 0 });
  });
});
