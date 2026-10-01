// Split out from quizSessions.test.js (Phase 3's Classic exclusion/practice
// mode work) so this suite gets its own fresh rate-limiter budget — Jest
// gives each test file its own module registry, so the shared
// createAuthLimiter()/register/login counters reset here instead of
// accumulating on top of quizSessions.test.js's already-sizable count.
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

async function startSession(cookieHeader, csrfToken, body) {
  return request(app)
    .post('/api/v1/quiz/sessions')
    .set('Cookie', cookieHeader)
    .set('X-CSRF-Token', csrfToken)
    .send(body);
}

describe('Classic exclusion only excludes everCorrect questions (Phase 3)', () => {
  it('re-serves a question the user only ever got wrong', async () => {
    await createQuestion(); // exactly one question, and it's never answered correctly
    const { cookieHeader, csrfToken } = await registerAndLogin('wrongonly@example.com');

    const first = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await request(app)
        .post(`/api/v1/quiz/sessions/${first.body.data.sessionId}/answer`)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ questionId: first.body.data.question._id, selectedIndex: 0 }); // always wrong
    }
    await request(app)
      .post(`/api/v1/quiz/sessions/${first.body.data.sessionId}/reveal`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send();

    // A fresh Classic session should still be able to serve the same
    // question, since it was never answered correctly (everCorrect stays
    // false), unlike Phase 1's exclusion which used to key off "answered
    // at all."
    const second = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    expect(second.body.data.noMoreQuestions).toBeUndefined();
    expect(second.body.data.question._id).toBe(first.body.data.question._id);
  });

  it('excludes an everCorrect question from a normal Classic session, offers practice mode, and practice mode bypasses the exclusion', async () => {
    await createQuestion(); // exactly one question
    const { cookieHeader, csrfToken } = await registerAndLogin('mastered@example.com');

    const first = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    await request(app)
      .post(`/api/v1/quiz/sessions/${first.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: first.body.data.question._id, selectedIndex: 1 }); // correct, first attempt

    const second = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    expect(second.body.data.noMoreQuestions).toBe(true);
    expect(second.body.data.canPracticeAgain).toBe(true);

    const practice = await startSession(cookieHeader, csrfToken, {
      mode: 'classic',
      topics: [],
      practiceMode: true,
    });
    expect(practice.body.data.noMoreQuestions).toBeUndefined();
    expect(practice.body.data.practiceMode).toBe(true);

    const practiceAnswer = await request(app)
      .post(`/api/v1/quiz/sessions/${practice.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: practice.body.data.question._id, selectedIndex: 1 });

    expect(practiceAnswer.body.data.isCorrect).toBe(true);
    expect(practiceAnswer.body.data.pointsAwarded).toBe(0);
    expect(practiceAnswer.body.data.pointsWithheldReason).toBe('already_mastered');
  });
});
