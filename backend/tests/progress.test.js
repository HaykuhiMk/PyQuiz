process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');
const User = require('../models/user');
const UserAnsweredQuestion = require('../models/userAnsweredQuestion');

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
    topics: ['Basic Arithmetic'],
    explanation: '2 + 2 = 4',
    ...overrides,
  });
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
  it('includes the answer and explanation for study cards', async () => {
    await createQuestion();
    const res = await request(app).get('/api/v1/questions/study');

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
    await createQuestion();
    const res = await request(app).get('/api/v1/questions/study');

    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      ['_id', 'answer', 'code', 'difficulty', 'explanation', 'options', 'question', 'topics'].sort()
    );
  });

  it('applies the difficulty filter', async () => {
    await createQuestion();
    await createQuestion({ question: 'Hard one?', difficulty: 'hard' });
    const res = await request(app).get('/api/v1/questions/study?difficulty=hard');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].question).toBe('Hard one?');
  });
});

describe('POST /api/v1/questions/:id/check', () => {
  it('reports a wrong guess without revealing the answer', async () => {
    const q = await createQuestion();
    const res = await request(app).post(`/api/v1/questions/${q._id}/check`).send({ selectedIndex: 0 });

    expect(res.body.data.isCorrect).toBe(false);
    expect(res.body.data.correctAnswer).toBeUndefined();
  });

  it('reveals the answer once the guess is correct', async () => {
    const q = await createQuestion();
    const res = await request(app).post(`/api/v1/questions/${q._id}/check`).send({ selectedIndex: 1 });

    expect(res.body.data.isCorrect).toBe(true);
    expect(res.body.data.correctAnswer).toBe('4');
  });

  it('reveals the answer on request regardless of correctness', async () => {
    const q = await createQuestion();
    const res = await request(app).post(`/api/v1/questions/${q._id}/check`).send({ reveal: true });

    expect(res.body.data.correctAnswer).toBe('4');
    expect(res.body.data.explanation).toBe('2 + 2 = 4');
  });
});

describe('POST /api/v1/users/user-progress (scoring integrity)', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/users/user-progress')
      .send({ questionId: '507f1f77bcf86cd799439011', selectedIndex: 0 });

    expect(res.statusCode).toBe(401);
  });

  it('regression: a forged isCorrect:true with a wrong selectedIndex is ignored', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('forge@example.com');
    const q = await createQuestion();

    const res = await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 0, isCorrect: true, mode: 'classic' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.pointsAwarded).toBe(0);

    const me = await request(app).get('/api/v1/users/me').set('Cookie', cookieHeader);
    expect(me.body.data.stats.totalCorrect).toBe(0);
  });

  it('regression: omitting selectedIndex entirely no longer defaults to correct', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('omit@example.com');
    const q = await createQuestion();

    const res = await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), mode: 'classic' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.pointsAwarded).toBe(0);
  });

  it('awards points for an honest correct selectedIndex', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('honest@example.com');
    const q = await createQuestion();

    const res = await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1, mode: 'classic', timeSpentSec: 5 });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.pointsAwarded).toBeGreaterThan(0);

    const me = await request(app).get('/api/v1/users/me').set('Cookie', cookieHeader);
    expect(me.body.data.stats.totalCorrect).toBe(1);
  });

  it('returns 404 for a question that does not exist', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('missingq@example.com');

    const res = await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: '507f1f77bcf86cd799439011', selectedIndex: 0 });

    expect(res.statusCode).toBe(404);
  });

  it('regression: a request with a valid session cookie but no CSRF header is rejected', async () => {
    const { cookieHeader } = await registerAndLogin('nocsrf@example.com');
    const q = await createQuestion();

    const res = await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .send({ questionId: q._id.toString(), selectedIndex: 1, mode: 'classic' });

    expect(res.statusCode).toBe(403);
  });

  it('regression: a mismatched CSRF header is rejected', async () => {
    const { cookieHeader } = await registerAndLogin('badcsrf@example.com');
    const q = await createQuestion();

    const res = await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', 'not-the-real-token')
      .send({ questionId: q._id.toString(), selectedIndex: 1, mode: 'classic' });

    expect(res.statusCode).toBe(403);
  });
});

describe('Answered-question tracking scales off the User document', () => {
  it('never writes an answeredQuestions array onto the User document', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('scale@example.com');
    const q1 = await createQuestion();
    const q2 = await createQuestion({ question: 'What is 3 + 3?', answer: '6', options: ['5', '6', '7'] });

    for (const q of [q1, q2]) {
      await request(app)
        .post('/api/v1/users/user-progress')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ questionId: q._id.toString(), selectedIndex: 0, mode: 'classic' });
    }

    const rawUser = await User.findOne({ email: 'scale@example.com' }).lean();
    expect(rawUser.answeredQuestions).toBeUndefined();

    const trackedCount = await UserAnsweredQuestion.countDocuments({ userId: rawUser._id });
    expect(trackedCount).toBe(2);
  });

  it('GET /user-progress reflects answered questions from the separate collection', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('reflect@example.com');
    const q = await createQuestion();

    await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1, mode: 'classic' });

    const res = await request(app).get('/api/v1/users/user-progress').set('Cookie', cookieHeader);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.answered).toBe(1);
    expect(res.body.data.answeredQuestions).toEqual([q._id.toString()]);
  });

  it('answering the same question twice does not create a duplicate tracking record', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('dupe@example.com');
    const q = await createQuestion();

    for (let i = 0; i < 2; i += 1) {
      await request(app)
        .post('/api/v1/users/user-progress')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ questionId: q._id.toString(), selectedIndex: 1, mode: 'classic' });
    }

    const rawUser = await User.findOne({ email: 'dupe@example.com' }).lean();
    const trackedCount = await UserAnsweredQuestion.countDocuments({ userId: rawUser._id });
    expect(trackedCount).toBe(1);
  });

  it('deleting the account removes its answered-question tracking records', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('cleanup@example.com');
    const q = await createQuestion();

    await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: q._id.toString(), selectedIndex: 1, mode: 'classic' });

    const rawUser = await User.findOne({ email: 'cleanup@example.com' }).lean();
    expect(await UserAnsweredQuestion.countDocuments({ userId: rawUser._id })).toBe(1);

    const del = await request(app)
      .delete('/api/v1/users/me')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ password: 'Passw0rd!' });

    expect(del.statusCode).toBe(200);
    expect(await UserAnsweredQuestion.countDocuments({ userId: rawUser._id })).toBe(0);
  });
});

describe('Error responses', () => {
  it('reports a malformed question id as a 400 without internal details', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('castid@example.com');

    const res = await request(app)
      .post('/api/v1/users/user-progress')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: 'not-an-object-id', selectedIndex: 0 });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toBe('Invalid identifier.');
    expect(JSON.stringify(res.body)).not.toMatch(/Cast to ObjectId/);
  });

  it('reports malformed JSON as a 400, not a server error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.statusCode).toBe(400);
  });
});
