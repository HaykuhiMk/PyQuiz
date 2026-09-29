process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const User = require('../models/user');
const Question = require('../models/questionModel');
const AnswerEvent = require('../models/answerEvent');

const VALID_PASSWORD = 'Passw0rd!';

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

async function adminToken() {
  const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
  await User.create({
    username: 'masteryadmin',
    email: 'masteryadmin@example.com',
    password: hashed,
    role: 'admin',
  });
  const res = await request(app)
    .post('/api/v1/admin/login')
    .send({ username: 'masteryadmin', password: VALID_PASSWORD });
  return res.body.data.token;
}

function createQuestion(overrides = {}) {
  return Question.create({
    question: 'Q',
    options: ['a', 'b'],
    answer: 'a',
    difficulty: 'easy',
    primaryTopic: 'Loops & Control Flow',
    secondaryTopics: [],
    explanation: 'e',
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

async function answerCorrectly(cookieHeader, csrfToken, sessionId, question) {
  return request(app)
    .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
    .set('Cookie', cookieHeader)
    .set('X-CSRF-Token', csrfToken)
    .send({ questionId: question._id.toString(), selectedIndex: 0 }); // 'a' is always correct here
}

describe('Topic mastery: "measuring" state (Phase 3 follow-up)', () => {
  it('shows measuring instead of a level when coverage exists but attempts are below MIN_ACCURACY_EVENTS', async () => {
    // 3 questions in the topic satisfies MIN_QUESTIONS_FOR_MASTERY, so this
    // isn't masked by the separate "not enough questions" state.
    await Promise.all([createQuestion(), createQuestion(), createQuestion()]);
    const { cookieHeader, csrfToken } = await registerAndLogin('measuring@example.com');

    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    await answerCorrectly(cookieHeader, csrfToken, start.body.data.sessionId, {
      _id: start.body.data.question._id,
    });

    const mastery = await request(app).get('/api/v1/users/topic-mastery').set('Cookie', cookieHeader);
    const loops = mastery.body.data.mastery.find((t) => t.topic === 'Loops & Control Flow');

    expect(loops.total).toBe(3);
    expect(loops.answered).toBe(1);
    expect(loops.attempted).toBe(1);
    expect(loops.level).toBe('measuring');
  });

  it('classifies normally once attempts reach MIN_ACCURACY_EVENTS', async () => {
    await Promise.all([createQuestion(), createQuestion(), createQuestion()]);
    const { cookieHeader, csrfToken } = await registerAndLogin('measured@example.com');

    let current = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    for (let i = 0; i < 3; i += 1) {
      await answerCorrectly(cookieHeader, csrfToken, current.body.data.sessionId, current.body.data.question);
      if (i < 2) {
        current = await request(app)
          .post(`/api/v1/quiz/sessions/${current.body.data.sessionId}/next`)
          .set('Cookie', cookieHeader)
          .set('X-CSRF-Token', csrfToken)
          .send();
      }
    }

    const mastery = await request(app).get('/api/v1/users/topic-mastery').set('Cookie', cookieHeader);
    const loops = mastery.body.data.mastery.find((t) => t.topic === 'Loops & Control Flow');

    expect(loops.attempted).toBe(3);
    expect(loops.level).not.toBe('measuring');
    expect(loops.level).toBe('master'); // 100% coverage, 100% accuracy
  });
});

describe('Topic mastery: "not enough questions" state (Phase 3 taxonomy revision)', () => {
  it('shows unavailable for a topic with fewer than MIN_QUESTIONS_FOR_MASTERY questions', async () => {
    await createQuestion({ primaryTopic: 'Tuples' });
    await createQuestion({ primaryTopic: 'Tuples' }); // only 2, below the minimum of 3
    const { cookieHeader, csrfToken } = await registerAndLogin('raretopic@example.com');

    const start = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    await answerCorrectly(cookieHeader, csrfToken, start.body.data.sessionId, start.body.data.question);

    const mastery = await request(app).get('/api/v1/users/topic-mastery').set('Cookie', cookieHeader);
    const rare = mastery.body.data.mastery.find((t) => t.topic === 'Tuples');

    expect(rare.total).toBe(2);
    expect(rare.level).toBe('unavailable');
  });
});

describe('Topic mastery ignores AnswerEvent rows for deleted questions (Phase 3 follow-up)', () => {
  it('drops a deleted question from coverage/accuracy while keeping its AnswerEvent as history', async () => {
    await Promise.all([
      createQuestion({ primaryTopic: 'Sets' }),
      createQuestion({ primaryTopic: 'Sets' }),
      createQuestion({ primaryTopic: 'Sets' }),
      createQuestion({ primaryTopic: 'Sets' }),
    ]);
    const { cookieHeader, csrfToken } = await registerAndLogin('doomed@example.com');

    // Answer 3 of the 4 questions correctly (enough to clear
    // MIN_ACCURACY_EVENTS and get a real classification).
    let current = await startSession(cookieHeader, csrfToken, { mode: 'classic', topics: [] });
    const answeredQuestionIds = [];
    for (let i = 0; i < 3; i += 1) {
      answeredQuestionIds.push(current.body.data.question._id);
      await answerCorrectly(cookieHeader, csrfToken, current.body.data.sessionId, current.body.data.question);
      if (i < 2) {
        current = await request(app)
          .post(`/api/v1/quiz/sessions/${current.body.data.sessionId}/next`)
          .set('Cookie', cookieHeader)
          .set('X-CSRF-Token', csrfToken)
          .send();
      }
    }

    const before = await request(app).get('/api/v1/users/topic-mastery').set('Cookie', cookieHeader);
    const doomedBefore = before.body.data.mastery.find((t) => t.topic === 'Sets');
    // 3/4 answered (75% coverage) with 100% accuracy — 'intermediate', not
    // 'master' (which needs >=80% coverage too); the level itself isn't
    // what this test is about, just that the raw counts are right.
    expect(doomedBefore).toMatchObject({ total: 4, answered: 3, attempted: 3, correct: 3, level: 'intermediate' });

    // Delete one of the answered questions as an admin.
    const token = await adminToken();
    const deletedId = answeredQuestionIds[0];
    const del = await request(app)
      .delete(`/api/v1/admin/questions/${deletedId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.statusCode).toBe(200);

    // Its AnswerEvent is kept as history...
    const keptEvent = await AnswerEvent.findOne({ questionId: deletedId }).lean();
    expect(keptEvent).not.toBeNull();

    // ...but live mastery no longer counts it: one fewer question overall,
    // and one fewer answered/attempted/correct, not stuck at the old totals.
    const after = await request(app).get('/api/v1/users/topic-mastery').set('Cookie', cookieHeader);
    const doomedAfter = after.body.data.mastery.find((t) => t.topic === 'Sets');
    expect(doomedAfter).toMatchObject({ total: 3, answered: 2, attempted: 2, correct: 2 });
  });
});
