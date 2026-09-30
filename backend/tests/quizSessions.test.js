process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');
const QuizSession = require('../models/quizSession');
const AnswerEvent = require('../models/answerEvent');
const UserAnsweredQuestion = require('../models/userAnsweredQuestion');
const User = require('../models/user');

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
    primaryTopic: 'Numbers & Arithmetic',
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

async function forceDeadlineIntoPast(sessionToken) {
  await QuizSession.updateOne(
    { token: sessionToken },
    { $set: { 'currentQuestion.deadlineAt': new Date(Date.now() - 1000) } }
  );
}

describe('POST /api/v1/quiz/sessions (create)', () => {
  it('starts a session and serves a sanitized first question', async () => {
    await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('create@example.com');

    const res = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.sessionId).toBeDefined();
    expect(res.body.data.question.answer).toBeUndefined();
    expect(res.body.data.question.explanation).toBeUndefined();
    expect(res.body.data.attemptsRemaining).toBe(3);
  });

  it('works for guests (no auth cookies)', async () => {
    await createQuestion();
    const res = await request(app).post('/api/v1/quiz/sessions').send({ mode: 'classic', topics: [] });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.sessionId).toBeDefined();
  });
});

describe('Mode is session-scoped and cannot be overridden per-request', () => {
  it('ignores a mode field sent alongside an answer', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('modeoverride@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    const { sessionId } = start.body.data;

    // A wrong answer with a forged `mode: 'survival'` field must still behave
    // like Classic (retry allowed), proving mode came from the session, not
    // this request body — submitAnswerSchema doesn't even declare a `mode`
    // field, so zod strips it before the service ever sees it.
    const res = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 0, mode: 'survival' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.resolved).toBe(false);
    expect(res.body.data.sessionStatus).toBe('active');
    expect(res.body.data.attemptsRemaining).toBe(2);
  });
});

describe('Classic mode attempt cap', () => {
  it('allows retries up to 3 attempts, then rejects a 4th', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('classic4th@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    const { sessionId } = start.body.data;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const res = await request(app)
        .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ questionId: q._id.toString(), selectedIndex: 0 }); // '3' is always wrong

      expect(res.statusCode).toBe(200);
      expect(res.body.data.isCorrect).toBe(false);
    }

    const fourth = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 0 });

    expect(fourth.statusCode).toBe(400);
  });

  it('reveals the answer only after explicitly requested post-exhaustion', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('classicreveal@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    const { sessionId } = start.body.data;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const res = await request(app)
        .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ questionId: q._id.toString(), selectedIndex: 0 });
      // Never revealed while attempts remain or right after exhausting them.
      expect(res.body.data.correctAnswer).toBeUndefined();
    }

    const reveal = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/reveal`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send();

    expect(reveal.statusCode).toBe(200);
    expect(reveal.body.data.correctAnswer).toBe('4');
  });
});

describe('Survival mode ends on the first mistake', () => {
  it('rejects further answers after a wrong one', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('survival@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'survival', topics: [] });
    const { sessionId } = start.body.data;

    const wrong = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 0 });

    expect(wrong.body.data.isCorrect).toBe(false);
    expect(wrong.body.data.sessionStatus).toBe('ended');
    expect(wrong.body.data.endedReason).toBe('mistake');

    const again = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    expect(again.statusCode).toBe(400);

    const next = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/next`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send();

    expect(next.statusCode).toBe(400);
  });
});

describe('Blitz mode timing', () => {
  it('computes a server-side time bonus for a fast correct answer', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('blitzbonus@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'blitz', topics: [] });
    const { sessionId, deadlineAt } = start.body.data;
    expect(deadlineAt).toBeTruthy();

    const res = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    expect(res.body.data.isCorrect).toBe(true);
    // Base 12 + up to +10 time bonus for an almost-instant answer.
    expect(res.body.data.pointsAwarded).toBeGreaterThan(12);
  });

  it('rejects a late answer as a timeout and reveals the answer', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('blitztimeout@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'blitz', topics: [] });
    const { sessionId } = start.body.data;

    await forceDeadlineIntoPast(sessionId);

    const res = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1 }); // the correct index, submitted too late

    expect(res.statusCode).toBe(200);
    expect(res.body.data.isCorrect).toBe(false);
    expect(res.body.data.outcome).toBe('timeout');
    expect(res.body.data.resolved).toBe(true);
    expect(res.body.data.correctAnswer).toBe('4');
  });

  it('also scores a question as a timeout if the client moves on without answering', async () => {
    await createQuestion();
    await createQuestion({ question: 'What is 3 + 3?', answer: '6', options: ['5', '6', '7'] });
    const { cookieHeader, csrfToken } = await registerAndLogin('blitzskip@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'blitz', topics: [] });
    const { sessionId } = start.body.data;

    const next = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/next`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send();

    expect(next.statusCode).toBe(200);

    const rawUser = await User.findOne({ email: 'blitzskip@example.com' }).lean();
    expect(rawUser.stats.totalAnswered).toBe(1);
    expect(rawUser.stats.currentStreak).toBe(0);
  });
});

describe('Points cannot be farmed by repetition', () => {
  it('awards 0 points the second time a user ever answers a question correctly, across sessions', async () => {
    await createQuestion(); // exactly one question, so a fresh session must re-serve it
    const { cookieHeader, csrfToken } = await registerAndLogin('farm@example.com');

    const firstSession = await startSession(cookieHeader, csrfToken, { mode: 'survival', topics: [] });
    const firstQuestionId = firstSession.body.data.question._id;
    const first = await request(app)
      .post(`/api/v1/quiz/sessions/${firstSession.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: firstQuestionId, selectedIndex: 1 });

    expect(first.body.data.isCorrect).toBe(true);
    expect(first.body.data.pointsAwarded).toBeGreaterThan(0);
    const pointsAfterFirst = first.body.data.totalPoints;

    const secondSession = await startSession(cookieHeader, csrfToken, { mode: 'survival', topics: [] });
    const secondQuestionId = secondSession.body.data.question._id;
    const second = await request(app)
      .post(`/api/v1/quiz/sessions/${secondSession.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: secondQuestionId, selectedIndex: 1 });

    expect(second.body.data.isCorrect).toBe(true);
    expect(second.body.data.pointsAwarded).toBe(0);
    expect(second.body.data.pointsWithheldReason).toBe('already_mastered');
    expect(second.body.data.totalPoints).toBe(pointsAfterFirst);

    const rawUser = await User.findOne({ email: 'farm@example.com' }).lean();
    // Repeats still count toward stats/accuracy, just not points.
    expect(rawUser.stats.totalCorrect).toBe(2);
    expect(rawUser.stats.totalPoints).toBe(pointsAfterFirst);
  });
});

describe('Guests can play but never accrue persisted points/stats', () => {
  it('answers correctly with no totalPoints/streak in the response and no AnswerEvent recorded', async () => {
    const q = await createQuestion();
    const start = await request(app).post('/api/v1/quiz/sessions').send({ mode: 'classic', topics: [] });
    const { sessionId } = start.body.data;

    const res = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.isCorrect).toBe(true);
    expect(res.body.data.totalPoints).toBeUndefined();
    expect(res.body.data.pointsAwarded).toBe(0);

    expect(await AnswerEvent.countDocuments({})).toBe(0);
  });
});

describe('Session ownership and validity', () => {
  it('rejects a missing/foreign sessionId', async () => {
    const q = await createQuestion();
    const userA = await registerAndLogin('ownerA@example.com');
    const userB = await registerAndLogin('ownerB@example.com', { username: 'ownerb' });

    const start = await startSession(userA.cookieHeader, userA.csrfToken, { mode: 'classic', topics: [] });
    const { sessionId } = start.body.data;

    const malformed = await request(app)
      .post('/api/v1/quiz/sessions/not-a-valid-token/answer')
      .set('Cookie', userA.cookieHeader)
      .set('X-CSRF-Token', userA.csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 0 });
    expect(malformed.statusCode).toBe(404);

    // Well-formed (64 hex chars, like a real token) but no session ever
    // issued it.
    const nonExistent = await request(app)
      .post(`/api/v1/quiz/sessions/${'a'.repeat(64)}/answer`)
      .set('Cookie', userA.cookieHeader)
      .set('X-CSRF-Token', userA.csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 0 });
    expect(nonExistent.statusCode).toBe(404);

    const foreign = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', userB.cookieHeader)
      .set('X-CSRF-Token', userB.csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 0 });
    expect(foreign.statusCode).toBe(404);
  });
});

describe('CSRF protection on authenticated sessions', () => {
  it('rejects a request with a valid session cookie but no CSRF header', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('nocsrf@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });

    const res = await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    expect(res.statusCode).toBe(403);
  });

  it('rejects a mismatched CSRF header', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('badcsrf@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });

    const res = await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', 'not-the-real-token')
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    expect(res.statusCode).toBe(403);
  });
});

describe('AnswerEvent groundwork', () => {
  it('records one event per attempt for an authenticated user', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('events@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    const { sessionId } = start.body.data;

    await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 0 });
    await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    // AnswerEvent.sessionId stores the internal _id (a normal foreign key),
    // not the public token, so look the session up to get it.
    const rawSession = await QuizSession.findOne({ token: sessionId }).lean();
    const events = await AnswerEvent.find({ sessionId: rawSession._id }).sort({ attemptNumber: 1 }).lean();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ attemptNumber: 1, correct: false, mode: 'classic' });
    expect(events[1]).toMatchObject({ attemptNumber: 2, correct: true, mode: 'classic' });
  });
});

describe('Scoring by attempt (Phase 1 follow-up)', () => {
  it('awards no points and does not extend the streak for a correct answer after a wrong attempt', async () => {
    await createQuestion(); // exactly one question
    const { cookieHeader, csrfToken } = await registerAndLogin('lateattempt@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    const { sessionId, question } = start.body.data;

    await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: question._id, selectedIndex: 0 }); // wrong, attempt 1

    const second = await request(app)
      .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: question._id, selectedIndex: 1 }); // correct, attempt 2

    expect(second.body.data.isCorrect).toBe(true);
    expect(second.body.data.pointsAwarded).toBe(0);
    expect(second.body.data.pointsWithheldReason).toBe('not_first_attempt');
    expect(second.body.data.currentStreak).toBe(0);

    const rawUser = await User.findOne({ email: 'lateattempt@example.com' }).lean();
    expect(rawUser.stats.totalPoints).toBe(0);
    expect(rawUser.stats.totalCorrect).toBe(1); // still counts for accuracy
    expect(rawUser.stats.currentStreak).toBe(0);

    const tracked = await UserAnsweredQuestion.findOne({ userId: rawUser._id, questionId: question._id }).lean();
    expect(tracked.everCorrect).toBe(false); // only a first-attempt correct sets this

    // A later session (Survival doesn't cross-session-exclude) gets the same
    // question and answers it correctly on the first attempt this time —
    // still eligible for real points, since everCorrect was never set.
    const survivalStart = await startSession(cookieHeader, csrfToken, { mode: 'survival', topics: [] });
    const third = await request(app)
      .post(`/api/v1/quiz/sessions/${survivalStart.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: survivalStart.body.data.question._id, selectedIndex: 1 });

    expect(third.body.data.isCorrect).toBe(true);
    expect(third.body.data.pointsAwarded).toBeGreaterThan(0);
    expect(third.body.data.pointsWithheldReason).toBeNull();

    const trackedAfter = await UserAnsweredQuestion.findOne({ userId: rawUser._id, questionId: question._id }).lean();
    expect(trackedAfter.everCorrect).toBe(true);
  });
});

describe('Achievements, topicStats and bestStreak through the session endpoints', () => {
  it('unlocks first_correct on a first-attempt correct answer', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('achievement@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });

    const res = await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    expect(res.body.data.newAchievements).toContain('first_correct');

    const rawUser = await User.findOne({ email: 'achievement@example.com' }).lean();
    expect(rawUser.achievements.map((a) => a.key)).toContain('first_correct');
  });

  it('updates the primary topic only (not secondary topics) — mastery uses primaryTopic alone', async () => {
    const q = await createQuestion({ primaryTopic: 'Numbers & Arithmetic', secondaryTopics: ['Data Types & Conversion'] });
    const { cookieHeader, csrfToken } = await registerAndLogin('topicstats@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });

    await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    const mastery = await request(app).get('/api/v1/users/topic-mastery').set('Cookie', cookieHeader);
    const byTopic = Object.fromEntries(mastery.body.data.mastery.map((t) => [t.topic, t]));
    expect(byTopic['Numbers & Arithmetic']).toMatchObject({ attempted: 1, correct: 1 });
    // The secondary topic exists only for quiz/study filtering — it must
    // not accrue any mastery attempts of its own from this question.
    expect(byTopic['Data Types & Conversion']?.attempted || 0).toBe(0);
  });

  it('grows bestStreak across consecutive first-attempt correct answers in a session', async () => {
    await createQuestion({ question: 'Q1', answer: '4', options: ['1', '4', '9'] });
    await createQuestion({ question: 'Q2', answer: '6', options: ['1', '6', '9'] });
    const { cookieHeader, csrfToken } = await registerAndLogin('beststreak@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });

    const first = await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({
        questionId: start.body.data.question._id,
        selectedIndex: start.body.data.question.options.indexOf(
          start.body.data.question.question === 'Q1' ? '4' : '6'
        ),
      });
    expect(first.body.data.isCorrect).toBe(true);
    expect(first.body.data.currentStreak).toBe(1);

    const next = await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/next`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send();

    const second = await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({
        questionId: next.body.data.question._id,
        selectedIndex: next.body.data.question.options.indexOf(next.body.data.question.question === 'Q1' ? '4' : '6'),
      });

    expect(second.body.data.isCorrect).toBe(true);
    expect(second.body.data.currentStreak).toBe(2);
    expect(second.body.data.bestStreak).toBe(2);

    const rawUser = await User.findOne({ email: 'beststreak@example.com' }).lean();
    expect(rawUser.stats.bestStreak).toBe(2);
  });
});

describe('Answered-question tracking still works through the session flow', () => {
  it('tracks a correct answer in UserAnsweredQuestion and cascades on account deletion', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('tracking@example.com');
    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });

    await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1 });

    const rawUser = await User.findOne({ email: 'tracking@example.com' }).lean();
    expect(rawUser.answeredQuestions).toBeUndefined();
    expect(await UserAnsweredQuestion.countDocuments({ userId: rawUser._id })).toBe(1);

    const progress = await request(app).get('/api/v1/users/user-progress').set('Cookie', cookieHeader);
    expect(progress.body.data.answered).toBe(1);

    const del = await request(app)
      .delete('/api/v1/users/me')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ password: 'Passw0rd!' });

    expect(del.statusCode).toBe(200);
    expect(await UserAnsweredQuestion.countDocuments({ userId: rawUser._id })).toBe(0);
  });
});
