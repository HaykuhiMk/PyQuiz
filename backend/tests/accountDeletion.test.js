// Deleting an account removes everything linked to that user. The check is
// driven by the models themselves: every collection whose schema has a
// `userId` path is scanned, so a collection added later that references
// users is covered automatically (and this test fails if deletion misses it).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

jest.mock('../utils/emailUtils', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendContactEmail: jest.fn().mockResolvedValue(undefined),
}));

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin, DEFAULT_PASSWORD } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');
const User = require('../models/user');
const ResetPassword = require('../models/resetPassword');
const Contact = require('../models/contact');

// Register every model, so the scan below sees all of them.
for (const file of fs.readdirSync(path.join(__dirname, '..', 'models'))) {
  require(path.join(__dirname, '..', 'models', file));
}

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

function modelsWithUserId() {
  return mongoose.modelNames()
    .map((name) => mongoose.model(name))
    .filter((model) => model.schema.path('userId'));
}

async function leaveTraces(email, username) {
  const session = await registerAndLogin(email, { username });
  const auth = { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken };

  // A quiz session with two attempts: QuizSession, AnswerEvent rows and a
  // UserAnsweredQuestion record.
  const start = await request(app).post('/api/v1/quiz/sessions').set(auth).send({ mode: 'classic', topics: [] });
  const { sessionId, question } = start.body.data;
  const stored = await Question.findById(question._id);
  const correctIndex = stored.options.indexOf(stored.answer);
  await request(app)
    .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
    .set(auth)
    .send({ questionId: question._id, selectedIndex: (correctIndex + 1) % 4 });
  await request(app)
    .post(`/api/v1/quiz/sessions/${sessionId}/answer`)
    .set(auth)
    .send({ questionId: question._id, selectedIndex: correctIndex });

  // A pending password-reset key and a contact message from the same email.
  await request(app).post('/api/v1/auth/forgot-password').send({ email });
  await request(app).post('/api/v1/contact').send({ name: username, email, message: 'Hello admin' });

  const user = await User.findOne({ email });
  return { session, auth, userId: user._id };
}

describe('account deletion', () => {
  it('removes every record linked to the user, and nothing belonging to anyone else', async () => {
    await Question.create({
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      answer: '4',
      difficulty: 'easy',
      primaryTopic: 'Data Types & Conversion',
      explanation: '2 + 2 = 4',
    });

    const doomed = await leaveTraces('doomed@example.com', 'doomed');
    const keeper = await leaveTraces('keeper@example.com', 'keeper');

    const scanned = modelsWithUserId();
    // Guard against a vacuous pass: these three must be found by the scan.
    expect(scanned.map((m) => m.modelName).sort()).toEqual(
      expect.arrayContaining(['AnswerEvent', 'QuizSession', 'UserAnsweredQuestion'])
    );
    for (const model of scanned) {
      expect(await model.countDocuments({ userId: doomed.userId })).toBeGreaterThan(0);
    }
    expect(await ResetPassword.countDocuments({ email: 'doomed@example.com' })).toBe(1);

    const res = await request(app).delete('/api/v1/users/me').set(doomed.auth).send({ password: DEFAULT_PASSWORD });
    expect(res.statusCode).toBe(200);

    expect(await User.countDocuments({ _id: doomed.userId })).toBe(0);
    for (const model of scanned) {
      expect({ model: model.modelName, left: await model.countDocuments({ userId: doomed.userId }) }).toEqual({
        model: model.modelName,
        left: 0,
      });
      expect(await model.countDocuments({ userId: keeper.userId })).toBeGreaterThan(0);
    }
    expect(await ResetPassword.countDocuments({ email: 'doomed@example.com' })).toBe(0);
    expect(await ResetPassword.countDocuments({ email: 'keeper@example.com' })).toBe(1);

    // Contact messages are messages to the admin, not account data (anyone
    // can send one without an account), so they are deliberately kept.
    expect(await Contact.countDocuments({ email: 'doomed@example.com' })).toBe(1);

    // And the deleted user's session no longer works.
    expect((await request(app).get('/api/v1/auth/me').set(doomed.auth)).statusCode).toBe(401);
  });
});
