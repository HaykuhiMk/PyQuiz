// Regular-user authentication works only through the httpOnly session
// cookie: an Authorization: Bearer header carrying a perfectly valid session
// JWT is ignored everywhere. And no code path can produce a CSRF token for an
// empty or missing session (it used to be computed from '' for Bearer-only
// requests to /auth/me, giving every such caller the same token).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const Question = require('../models/questionModel');
const QuizSession = require('../models/quizSession');
const User = require('../models/user');
const { computeCsrfToken } = require('../utils/authCookies');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe('a Bearer header alone is rejected', () => {
  it('on GET /auth/me (401, no CSRF token issued)', async () => {
    const user = await registerAndLogin('bearer-me@example.com', { username: 'bearerme' });

    const res = await request(app).get('/api/v1/auth/me').set(bearer(user.tokenCookieValue));

    expect(res.statusCode).toBe(401);
    expect(res.body.data).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/csrfToken/);
  });

  it('on a settings route (401, nothing changed)', async () => {
    const user = await registerAndLogin('bearer-settings@example.com', { username: 'bearersettings' });

    const res = await request(app)
      .patch('/api/v1/users/settings/profile')
      .set(bearer(user.tokenCookieValue))
      .set('X-CSRF-Token', user.csrfToken)
      .send({ username: 'hijacked' });

    expect(res.statusCode).toBe(401);
    expect((await User.findOne({ email: 'bearer-settings@example.com' })).username).toBe('bearersettings');
  });

  it('on the quiz routes: grants no identity (guest session; cannot drive the user\'s own session)', async () => {
    await Question.create({
      question: 'Q', options: ['a', 'b'], answer: 'b', difficulty: 'easy', primaryTopic: 'lists', explanation: 'e',
    });
    const user = await registerAndLogin('bearer-quiz@example.com', { username: 'bearerquiz' });

    // Starting a session with only the Bearer header makes a guest session.
    const started = await request(app)
      .post('/api/v1/quiz/sessions')
      .set(bearer(user.tokenCookieValue))
      .send({ mode: 'classic', topics: [] });
    expect(started.statusCode).toBe(200);
    expect((await QuizSession.findOne({ token: started.body.data.sessionId })).userId).toBeNull();

    // The user's own (cookie-started) session can't be driven with the header.
    const owned = await request(app)
      .post('/api/v1/quiz/sessions')
      .set('Cookie', user.cookieHeader)
      .set('X-CSRF-Token', user.csrfToken)
      .send({ mode: 'classic', topics: [] });
    const answer = await request(app)
      .post(`/api/v1/quiz/sessions/${owned.body.data.sessionId}/answer`)
      .set(bearer(user.tokenCookieValue))
      .send({ questionId: owned.body.data.question._id, selectedIndex: 1 });
    expect(answer.statusCode).toBe(404);
  });

  it('is not an allowed CORS request header any more', async () => {
    process.env.CLIENT_URI = process.env.CLIENT_URI || 'http://localhost:3000';
    const res = await request(app)
      .options('/api/v1/auth/me')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');
    expect((res.headers['access-control-allow-headers'] || '').toLowerCase()).not.toMatch(/authorization/);
  });
});

describe('CSRF tokens exist only for a real session', () => {
  it('refuses to compute one for an empty or missing session token', () => {
    for (const bad of ['', undefined, null, 0]) {
      expect(() => computeCsrfToken(bad)).toThrow(/requires a session token/);
    }
  });

  it('GET /auth/me with the session cookie returns the token bound to that cookie', async () => {
    const user = await registerAndLogin('bearer-ok@example.com', { username: 'bearerok' });
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', user.cookieHeader);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.csrfToken).toBe(computeCsrfToken(user.tokenCookieValue));
  });
});
