process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DAILY_CHALLENGE_SEED_SECRET = process.env.DAILY_CHALLENGE_SEED_SECRET || 'test-daily-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');
const DailyChallengeSet = require('../models/dailyChallengeSet');
const AnswerEvent = require('../models/answerEvent');
const UserAnsweredQuestion = require('../models/userAnsweredQuestion');
const User = require('../models/user');
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

function seedQuestions(count = 5) {
  const docs = Array.from({ length: count }, (_, i) => ({
    question: `Question ${i}`,
    options: ['a', 'b', 'c'],
    answer: 'a',
    difficulty: 'easy',
    primaryTopic: 'Loops & Control Flow',
    secondaryTopics: [],
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

  it('counts each question once when the payload repeats an answer', async () => {
    await seedQuestions();
    const { cookieHeader, csrfToken } = await registerAndLogin('daily4@example.com');

    const daily = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    const first = daily.body.data.questions[0];
    const answers = Array.from({ length: 50 }, () => ({ questionId: first._id, selectedIndex: 0 }));

    const res = await request(app)
      .post('/api/v1/challenges/daily/submit')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ answers });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.score).toBe(1);
    expect(res.body.data.pointsAwarded).toBe(20);
  });

  it('awards points only once for concurrent submissions', async () => {
    await seedQuestions();
    const { cookieHeader, csrfToken } = await registerAndLogin('daily5@example.com');

    const daily = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    const answers = daily.body.data.questions.map((q) => ({ questionId: q._id, selectedIndex: 0 }));
    const submit = () =>
      request(app)
        .post('/api/v1/challenges/daily/submit')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ answers });

    const results = await Promise.all([submit(), submit(), submit()]);
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);

    const me = await request(app).get('/api/v1/users/me').set('Cookie', cookieHeader);
    expect(me.body.data.stats.totalPoints).toBe(answers.length * 20);
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

describe('Daily Challenge day key and reset time (Asia/Yerevan)', () => {
  it('uses the Yerevan calendar date, not UTC, near the UTC day boundary', () => {
    // 23:30 UTC on Jan 15 is already 03:30 on Jan 16 in Yerevan (UTC+4).
    const nearMidnightUtc = new Date('2026-01-15T23:30:00Z');
    expect(dailyChallengeService.getTodayKey(nearMidnightUtc)).toBe('2026-01-16');

    // 19:30 UTC on Jan 15 is still Jan 15 in Yerevan (23:30 local).
    const stillSameYerevanDay = new Date('2026-01-15T19:30:00Z');
    expect(dailyChallengeService.getTodayKey(stillSameYerevanDay)).toBe('2026-01-15');
  });

  it('computes the next reset as the following Yerevan midnight, in the future', () => {
    const now = new Date('2026-01-15T10:00:00Z');
    const resetAt = dailyChallengeService.getNextResetAt(now);
    expect(resetAt.getTime()).toBeGreaterThan(now.getTime());
    // Midnight Jan 16 in Yerevan (UTC+4) is 2026-01-15T20:00:00Z.
    expect(resetAt.toISOString()).toBe('2026-01-15T20:00:00.000Z');
  });

  it("GET /daily includes a future nextResetAt", async () => {
    await seedQuestions();
    const { cookieHeader } = await registerAndLogin('resettime@example.com');
    const res = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);

    expect(res.statusCode).toBe(200);
    expect(new Date(res.body.data.nextResetAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("Daily Challenge set is frozen for the day", () => {
  it('keeps serving the same questions after new questions are added', async () => {
    await seedQuestions(5);
    const { cookieHeader } = await registerAndLogin('frozen@example.com');

    const first = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    const firstIds = first.body.data.questions.map((q) => q._id).sort();

    await seedQuestions(10); // adds 10 more questions to the pool

    const second = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    const secondIds = second.body.data.questions.map((q) => q._id).sort();

    expect(secondIds).toEqual(firstIds);
    expect(await DailyChallengeSet.countDocuments({})).toBe(1);
  });

  it('drops a question deleted after the set was frozen instead of failing', async () => {
    await seedQuestions(5);
    const { cookieHeader } = await registerAndLogin('dropped@example.com');

    const first = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    const frozenIds = first.body.data.questions.map((q) => q._id);
    expect(frozenIds).toHaveLength(5);

    await Question.findByIdAndDelete(frozenIds[0]);

    const second = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    expect(second.statusCode).toBe(200);
    expect(second.body.data.questions).toHaveLength(4);
    expect(second.body.data.questions.map((q) => q._id)).not.toContain(frozenIds[0]);
  });
});

describe('Daily Challenge answers count as real evidence', () => {
  it('records AnswerEvent, UserAnsweredQuestion.everCorrect, topic mastery and streaks', async () => {
    await Question.create([
      { question: 'Q1', options: ['a', 'b'], answer: 'a', difficulty: 'easy', primaryTopic: 'Loops & Control Flow', explanation: 'e' },
      { question: 'Q2', options: ['a', 'b'], answer: 'a', difficulty: 'easy', primaryTopic: 'Loops & Control Flow', explanation: 'e' },
    ]);
    const { cookieHeader, csrfToken } = await registerAndLogin('evidence@example.com');

    const daily = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    const questions = daily.body.data.questions;
    const fullQuestions = await Question.find({ _id: { $in: questions.map((q) => q._id) } }).lean();

    // Answer the first correctly, the second incorrectly.
    const answers = questions.map((q, index) => {
      const full = fullQuestions.find((f) => String(f._id) === String(q._id));
      const correctIndex = full.options.indexOf(full.answer);
      return { questionId: q._id, selectedIndex: index === 0 ? correctIndex : (correctIndex + 1) % 2 };
    });

    const submit = await request(app)
      .post('/api/v1/challenges/daily/submit')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ answers });

    expect(submit.statusCode).toBe(200);
    expect(submit.body.data.score).toBe(1);
    expect(submit.body.data.pointsAwarded).toBe(20);

    const rawUser = await User.findOne({ email: 'evidence@example.com' }).lean();

    const events = await AnswerEvent.find({ userId: rawUser._id, mode: 'daily' }).lean();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.sessionId === null)).toBe(true);
    expect(events.filter((e) => e.correct).length).toBe(1);

    const tracked = await UserAnsweredQuestion.find({ userId: rawUser._id }).lean();
    expect(tracked).toHaveLength(2);
    const correctlyTracked = tracked.find((t) => t.questionId === String(answers[0].questionId));
    expect(correctlyTracked.everCorrect).toBe(true);

    const mastery = await request(app).get('/api/v1/users/topic-mastery').set('Cookie', cookieHeader);
    const loopsStats = mastery.body.data.mastery.find((t) => t.topic === 'Loops & Control Flow');
    expect(loopsStats).toMatchObject({ attempted: 2, correct: 1 });

    // First (correct) answer extends the streak; the second (wrong) resets
    // it to 0 — same first-attempt-correct rule as quiz sessions.
    expect(rawUser.stats.currentStreak).toBe(0);
    expect(rawUser.stats.bestStreak).toBe(1);

    // The 20-point daily bonus is separate from the first-correct-ever rule,
    // so it's not reduced even though applyAnswerOutcome awarded 0 points
    // per-question (pointsOverride) — total points come only from the flat
    // per-correct-answer bonus.
    expect(rawUser.stats.totalPoints).toBe(20);
  });
});

describe('Daily Challenge without DAILY_CHALLENGE_SEED_SECRET configured', () => {
  it('returns 503 instead of crashing or falling back to a default seed', async () => {
    await seedQuestions();
    const { cookieHeader } = await registerAndLogin('nosecret@example.com');

    const original = process.env.DAILY_CHALLENGE_SEED_SECRET;
    delete process.env.DAILY_CHALLENGE_SEED_SECRET;
    try {
      // No DailyChallengeSet exists yet for today (fresh DB from afterEach),
      // so this actually has to generate one and hits the missing secret.
      const res = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
      expect(res.statusCode).toBe(503);
      expect(await DailyChallengeSet.countDocuments({})).toBe(0);
    } finally {
      process.env.DAILY_CHALLENGE_SEED_SECRET = original;
    }
  });

  it("still serves a day whose set was already frozen before the secret went missing", async () => {
    await seedQuestions();
    const { cookieHeader } = await registerAndLogin('framebeforeoutage@example.com');

    // Freeze today's set while the secret is present.
    const first = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    expect(first.statusCode).toBe(200);

    const original = process.env.DAILY_CHALLENGE_SEED_SECRET;
    delete process.env.DAILY_CHALLENGE_SEED_SECRET;
    try {
      const second = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
      expect(second.statusCode).toBe(200);
    } finally {
      process.env.DAILY_CHALLENGE_SEED_SECRET = original;
    }
  });
});
