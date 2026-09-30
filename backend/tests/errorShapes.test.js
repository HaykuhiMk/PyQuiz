// Every error response uses the central envelope
// { success: false, data: null, error: { message, details }, meta: {} } with
// a JSON content type: the auth middleware, admin auth, all four rate
// limiters (general /api, auth, contact, quiz-session start) and the
// operational endpoints. Own file, so the limiters start with fresh budgets.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

jest.mock('../utils/emailUtils', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendContactEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterAll(async () => {
  await db.closeDatabase();
});

function expectEnvelope(res, status, message) {
  expect(res.statusCode).toBe(status);
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(Object.keys(res.body).sort()).toEqual(['data', 'error', 'meta', 'success']);
  expect(res.body.success).toBe(false);
  expect(res.body.data).toBeNull();
  expect(res.body.meta).toEqual({});
  expect(Object.keys(res.body.error).sort()).toEqual(['details', 'message']);
  expect(typeof res.body.error.message).toBe('string');
  if (message) expect(res.body.error.message).toMatch(message);
}

async function hitUntil429(makeRequest, max) {
  for (let i = 0; i < max; i += 1) {
    const res = await makeRequest();
    if (res.statusCode === 429) return res;
  }
  throw new Error(`no 429 within ${max} requests`);
}

describe('central error envelope', () => {
  it('user auth middleware (401)', async () => {
    expectEnvelope(await request(app).get('/api/v1/users/me'), 401, /authentication required/i);
    expectEnvelope(
      await request(app).get('/api/v1/users/me').set('Cookie', 'token=not-a-jwt'),
      401,
      /invalid or expired session/i
    );
  });

  it('admin auth (401 and 403)', async () => {
    expectEnvelope(await request(app).get('/api/v1/admin/me'), 401, /authentication required/i);
    const user = await registerAndLogin('shape403@example.com', { username: 'shape403' });
    expectEnvelope(
      await request(app).get('/api/v1/admin/me').set('Cookie', `adminToken=${user.tokenCookieValue}`),
      403,
      /admin access required/i
    );
  });

  it('auth rate limiter (429)', async () => {
    const res = await hitUntil429(() => request(app).post('/api/v1/auth/forgot-password').send({ email: 'x@example.com' }), 25);
    expectEnvelope(res, 429, /too many attempts/i);
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('contact rate limiter (429)', async () => {
    const res = await hitUntil429(() => request(app).post('/api/v1/contact').send({ website: 'spam' }), 10);
    expectEnvelope(res, 429, /too many messages/i);
  });

  it('quiz-session start rate limiter (429)', async () => {
    await Question.create({
      question: 'Q', options: ['a', 'b'], answer: 'b', difficulty: 'easy', primaryTopic: 'Lists', explanation: 'e',
    });
    const user = await registerAndLogin('shapesessions@example.com', { username: 'shapesessions' });
    const res = await hitUntil429(
      () =>
        request(app)
          .post('/api/v1/quiz/sessions')
          .set('Cookie', user.cookieHeader)
          .set('X-CSRF-Token', user.csrfToken)
          .send({ mode: 'classic', topics: [] }),
      70
    );
    expectEnvelope(res, 429, /too many quiz sessions/i);
  });

  it('general /api rate limiter (429), previously plain text', async () => {
    const user = await registerAndLogin('shapegeneral@example.com', { username: 'shapegeneral' });
    const res = await hitUntil429(() => request(app).get('/api/v1/auth/me').set('Cookie', user.cookieHeader), 320);
    expectEnvelope(res, 429, /too many requests/i);
  });

  it('/readyz 503 when the database is not connected', async () => {
    const mongoose = require('mongoose');
    const { host, port, name } = mongoose.connection;
    const original = process.env.SKIP_DB_CONNECT;
    await mongoose.disconnect();
    process.env.SKIP_DB_CONNECT = 'false';
    try {
      const res = await request(app).get('/readyz');
      expectEnvelope(res, 503, /not ready/i);
      expect(res.body.error.details).toEqual({ ready: false, dbState: 0 });
    } finally {
      process.env.SKIP_DB_CONNECT = original;
      // Reconnect to the same test database so closeDatabase() can clean it up.
      await mongoose.connect(`mongodb://${host}:${port}/${name}`);
    }
  });
});
