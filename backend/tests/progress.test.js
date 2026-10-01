process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DAILY_CHALLENGE_SEED_SECRET = process.env.DAILY_CHALLENGE_SEED_SECRET || 'test-daily-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');
const DailyChallengeSet = require('../models/dailyChallengeSet');
const dailyChallengeService = require('../services/dailyChallengeService');

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
    question: 'What is 2 + 2?',
    options: ['3', '4', '5', '6'],
    answer: '4',
    difficulty: 'easy',
    primaryTopic: 'numbers',
    secondaryTopics: [],
    explanation: '2 + 2 = 4',
    ...overrides,
  });
}

// Freezes today's Daily Challenge set onto an unrelated decoy question, so
// Study-mode tests below aren't affected by today's set happening to
// randomly include (and therefore exclude from Study) the question(s) they
// create and assert on.
async function freezeUnrelatedDailySet() {
  const decoy = await createQuestion({ question: 'Decoy daily question', primaryTopic: 'tuples' });
  await DailyChallengeSet.create({ date: dailyChallengeService.getTodayKey(), questionIds: [decoy._id] });
}

describe('GET /api/v1/questions/random', () => {
  it('never includes the answer or explanation', async () => {
    await createQuestion();
    const res = await request(app).get('/api/v1/questions/random');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.answer).toBeUndefined();
    expect(res.body.data.explanation).toBeUndefined();
    expect(res.body.data.options).toEqual(['3', '4', '5', '6']);
  });
});

describe('GET /api/v1/questions (public listing)', () => {
  it('never includes the answer or explanation', async () => {
    await createQuestion();
    const res = await request(app).get('/api/v1/questions');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].answer).toBeUndefined();
    expect(res.body.data[0].explanation).toBeUndefined();
  });
});

describe('GET /api/v1/questions/study', () => {
  // Study mode requires login as of Phase 2 (docs/AUDIT.md item 4) — it
  // shows full answers/explanations and could otherwise be used to look up
  // today's Daily Challenge answers.
  it('requires authentication', async () => {
    await createQuestion();
    const res = await request(app).get('/api/v1/questions/study');
    expect(res.statusCode).toBe(401);
  });

  it('includes the answer and explanation for study cards', async () => {
    await freezeUnrelatedDailySet();
    await createQuestion();
    const { cookieHeader } = await registerAndLogin('study1@example.com');
    const res = await request(app).get('/api/v1/questions/study').set('Cookie', cookieHeader);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      answer: '4',
      explanation: '2 + 2 = 4',
    });
    expect(res.body.meta.total).toBe(1);
  });

  it('returns only the study fields, not the full document', async () => {
    await freezeUnrelatedDailySet();
    await createQuestion();
    const { cookieHeader } = await registerAndLogin('study2@example.com');
    const res = await request(app).get('/api/v1/questions/study').set('Cookie', cookieHeader);

    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      ['_id', 'answer', 'code', 'difficulty', 'explanation', 'options', 'primaryTopic', 'question', 'secondaryTopics'].sort()
    );
  });

  it('applies the difficulty filter', async () => {
    await freezeUnrelatedDailySet();
    await createQuestion();
    await createQuestion({ question: 'Hard one?', difficulty: 'hard' });
    const { cookieHeader } = await registerAndLogin('study3@example.com');
    const res = await request(app)
      .get('/api/v1/questions/study?difficulty=hard')
      .set('Cookie', cookieHeader);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].question).toBe('Hard one?');
  });

  it("excludes today's Daily Challenge questions", async () => {
    await createQuestion(); // the only question -> guaranteed to be in today's daily set too
    const { cookieHeader } = await registerAndLogin('study4@example.com');

    const daily = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    expect(daily.body.data.questions).toHaveLength(1);

    const res = await request(app).get('/api/v1/questions/study').set('Cookie', cookieHeader);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });
});

// POST /api/v1/questions/:id/check was removed (Phase 5 follow-up): it was
// public and returned the correct answer and explanation for any question
// id (reveal: true, or by trying each index), including today's Daily
// Challenge questions, and nothing in the frontend had called it since the
// quiz moved to server-side sessions in Phase 1. These tests replace the old
// ones that encoded its answer-revealing behaviour.
describe('POST /api/v1/questions/:id/check (removed)', () => {
  it('no longer exists, for guests or logged-in users', async () => {
    const q = await createQuestion();
    const guest = await request(app).post(`/api/v1/questions/${q._id}/check`).send({ reveal: true });
    expect(guest.statusCode).toBe(404);
    expect(JSON.stringify(guest.body)).not.toContain('2 + 2 = 4');

    const { cookieHeader, csrfToken } = await registerAndLogin('checkgone@example.com', { username: 'checkgone' });
    const user = await request(app)
      .post(`/api/v1/questions/${q._id}/check`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ selectedIndex: 1 });
    expect(user.statusCode).toBe(404);
    expect(user.body.data?.isCorrect).toBeUndefined();
  });

  it('no public question endpoint returns answers or explanations', async () => {
    await createQuestion();
    for (const path of ['/api/v1/questions', '/api/v1/questions/random', '/api/v1/questions/stats']) {
      const res = await request(app).get(path);
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/"answer"|"explanation"|"correctAnswer"|2 \+ 2 = 4/);
    }
  });
});

// Scoring-integrity and answered-question-tracking coverage for what used
// to be POST /api/v1/users/user-progress now lives in quizSessions.test.js:
// that endpoint was removed in Phase 1 because taking `mode`/outcome
// directly from the client was the exact gap that let quiz mode and points
// be forged (docs/AUDIT.md items 1-3). Scoring is now only reachable through
// the server-authoritative POST /api/v1/quiz/sessions/:sessionId/answer
// endpoint, which independently re-derives correctness and mode.

describe('Error responses', () => {
  it('reports malformed JSON as a 400, not a server error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.statusCode).toBe(400);
  });
});
