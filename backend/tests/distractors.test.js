// Misconception tags on wrong options (Question.distractors,
// docs/CONCEPT_GRAPH.md Stage 2): admin validation, never shown to learners,
// and the chosen option's misconceptionId recorded on each AnswerEvent.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DAILY_CHALLENGE_SEED_SECRET = process.env.DAILY_CHALLENGE_SEED_SECRET || 'test-daily-secret';

const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin, adminSessionHeaders, DEFAULT_PASSWORD } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');
const User = require('../models/user');
const AnswerEvent = require('../models/answerEvent');
const DailyChallengeSet = require('../models/dailyChallengeSet');
const dailyChallengeService = require('../services/dailyChallengeService');
const { chosenMisconceptionId } = require('../utils/distractors');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

// b = a; b.append(3); print(a) -> [1, 2, 3]
const payload = {
  question: 'What does this print?',
  code: 'a = [1, 2]\nb = a\nb.append(3)\nprint(a)',
  options: ['[1, 2]', '[1, 2, 3]', 'Error'],
  answer: '[1, 2, 3]',
  difficulty: 'easy',
  primaryTopic: 'mutability',
  secondaryTopics: [],
  explanation: 'b and a name the same list.',
};
const TAG = { option: '[1, 2]', misconceptionId: 'mutability.assignment-copies', feedback: 'b = a does not copy.' };

function createQuestion(overrides = {}) {
  return Question.create({ ...payload, distractors: [TAG], ...overrides });
}

async function adminHeaders() {
  await User.create({
    username: 'distractoradmin',
    email: 'distractoradmin@example.com',
    password: await bcrypt.hash(DEFAULT_PASSWORD, 10),
    role: 'admin',
  });
  const res = await request(app).post('/api/v1/admin/login').send({ username: 'distractoradmin', password: DEFAULT_PASSWORD });
  return adminSessionHeaders(res);
}

const addQuestion = async (headers, body) => request(app).post('/api/v1/questions/add').set(headers).send(body);

describe('admin: distractors on wrong options', () => {
  it('stores a misconceptionId and feedback on a wrong option, and the admin view returns them', async () => {
    const headers = await adminHeaders();
    const res = await addQuestion(headers, { ...payload, distractors: [TAG, { option: 'Error', feedback: 'Nothing fails here.' }] });
    expect(res.statusCode).toBe(201);

    const stored = await Question.findOne({ code: payload.code }).lean();
    expect(stored.distractors).toEqual([TAG, { option: 'Error', feedback: 'Nothing fails here.' }]);

    const admin = await request(app).get(`/api/v1/admin/questions/${stored._id}`).set(headers);
    expect(admin.body.data.distractors).toEqual(stored.distractors);
  });

  it('defaults to no distractors', async () => {
    const res = await addQuestion(await adminHeaders(), payload);
    expect(res.statusCode).toBe(201);
    expect((await Question.findOne({ code: payload.code }).lean()).distractors).toEqual([]);
  });

  it.each([
    ['an unknown misconception id', [{ option: '[1, 2]', misconceptionId: 'mutability.no-such-belief' }]],
    ['a display name instead of an id', [{ option: '[1, 2]', misconceptionId: 'b = a makes a copy.' }]],
    ['a tag on the correct answer', [{ option: '[1, 2, 3]', misconceptionId: 'mutability.assignment-copies' }]],
    ['an option that does not exist', [{ option: '[2, 1]', misconceptionId: 'mutability.assignment-copies' }]],
    ['two entries for one option', [TAG, { option: '[1, 2]', feedback: 'again' }]],
    ['neither a misconceptionId nor feedback', [{ option: '[1, 2]' }]],
    ['feedback over 300 characters', [{ option: '[1, 2]', feedback: 'x'.repeat(301) }]],
  ])('rejects %s with 400', async (_label, distractors) => {
    const res = await addQuestion(await adminHeaders(), { ...payload, distractors });
    expect(res.statusCode).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('update replaces distractors, and rejects option or answer changes that leave a tag stale', async () => {
    const headers = await adminHeaders();
    const q = await createQuestion();
    const patch = (body) => request(app).patch(`/api/v1/admin/questions/${q._id}`).set(headers).send(body);

    const retag = await patch({ distractors: [{ option: 'Error', misconceptionId: 'types.implicit-str-number-coercion' }] });
    expect(retag.statusCode).toBe(200);
    expect((await Question.findById(q._id).lean()).distractors).toEqual([
      { option: 'Error', misconceptionId: 'types.implicit-str-number-coercion' },
    ]);

    // The tagged option 'Error' is removed without resending distractors.
    expect((await patch({ options: ['[1, 2]', '[1, 2, 3]', 'None'] })).statusCode).toBe(400);
    // The tagged option becomes the answer.
    expect((await patch({ answer: 'Error', options: ['[1, 2]', '[1, 2, 3]', 'Error'] })).statusCode).toBe(400);
    // Both together, with matching distractors, is fine.
    const ok = await patch({ options: ['[1, 2]', '[1, 2, 3]', 'None'], distractors: [TAG] });
    expect(ok.statusCode).toBe(200);
    expect((await Question.findById(q._id).lean()).distractors).toEqual([TAG]);
  });

  it('GET /validation-rules serves the feedback limit the server enforces', async () => {
    const res = await request(app).get('/api/v1/validation-rules');
    expect(res.body.data.distractor).toEqual({ feedbackMaxLength: 300 });
  });
});

describe('learners never see distractors (a tagged option is known to be wrong)', () => {
  const noLeak = (value) => {
    const body = JSON.stringify(value);
    expect(body).not.toContain('distractors');
    expect(body).not.toContain('mutability.assignment-copies');
    expect(body).not.toContain(TAG.feedback);
  };

  it('in the question list, random question, Study mode, quiz sessions and the Daily Challenge', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('noleak@example.com');

    noLeak((await request(app).get('/api/v1/questions')).body);
    noLeak((await request(app).get('/api/v1/questions/random')).body);

    const daily = await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    expect(daily.body.data.questions).toHaveLength(1);
    noLeak(daily.body);

    // Study excludes today's Daily question, so freeze today's set on a decoy.
    const decoy = await createQuestion({ code: 'decoy', distractors: [] });
    await DailyChallengeSet.deleteMany({});
    await DailyChallengeSet.create({ date: dailyChallengeService.getTodayKey(), questionIds: [decoy._id] });
    const study = await request(app).get('/api/v1/questions/study?topics=mutability').set('Cookie', cookieHeader);
    expect(study.body.data.map((s) => String(s._id))).toContain(String(q._id));
    noLeak(study.body);

    await Question.deleteOne({ _id: decoy._id });
    const start = await request(app)
      .post('/api/v1/quiz/sessions')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ mode: 'classic', topics: [] });
    noLeak(start.body);
    const answer = await request(app)
      .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionId: String(q._id), selectedIndex: 0 });
    expect(answer.statusCode).toBe(200);
    noLeak(answer.body);
  });
});

describe('AnswerEvent.misconceptionId records the chosen option\'s tag', () => {
  async function answerInSession(selections) {
    const q = await createQuestion({ distractors: [{ option: '[1, 2]', misconceptionId: 'mutability.assignment-copies' }, { option: 'Error', feedback: 'only feedback' }] });
    const { cookieHeader, csrfToken } = await registerAndLogin('events@example.com');
    const start = await request(app)
      .post('/api/v1/quiz/sessions')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ mode: 'classic', topics: [] });
    for (const selectedIndex of selections) {
      const res = await request(app)
        .post(`/api/v1/quiz/sessions/${start.body.data.sessionId}/answer`)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ questionId: String(q._id), selectedIndex });
      expect(res.statusCode).toBe(200);
    }
    return AnswerEvent.find({ questionId: q._id }).sort({ attemptNumber: 1 }).lean();
  }

  it('in a quiz session: the tag of a tagged wrong option, null for an untagged one and for the correct one', async () => {
    const events = await answerInSession([0, 2, 1]);
    expect(events.map((e) => [e.selectedIndex, e.correct, e.misconceptionId])).toEqual([
      [0, false, 'mutability.assignment-copies'],
      [2, false, null],
      [1, true, null],
    ]);
  });

  it('in the Daily Challenge', async () => {
    const q = await createQuestion();
    const { cookieHeader, csrfToken } = await registerAndLogin('dailyevents@example.com');
    await request(app).get('/api/v1/challenges/daily').set('Cookie', cookieHeader);
    const res = await request(app)
      .post('/api/v1/challenges/daily/submit')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ answers: [{ questionId: String(q._id), selectedIndex: 0 }] });
    expect(res.statusCode).toBe(200);
    const [event] = await AnswerEvent.find({ questionId: q._id }).lean();
    expect(event).toMatchObject({ mode: 'daily', correct: false, misconceptionId: 'mutability.assignment-copies' });
  });

  it('is null for no answer, an out-of-range index and a question without distractors', () => {
    const question = { ...payload, distractors: [TAG] };
    expect(chosenMisconceptionId(question, null)).toBeNull();
    expect(chosenMisconceptionId(question, undefined)).toBeNull();
    expect(chosenMisconceptionId(question, 7)).toBeNull();
    expect(chosenMisconceptionId({ ...payload }, 0)).toBeNull();
    expect(chosenMisconceptionId(question, 0)).toBe('mutability.assignment-copies');
  });
});
