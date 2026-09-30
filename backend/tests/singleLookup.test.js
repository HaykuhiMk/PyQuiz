// Each request resolves its session with exactly one user lookup
// (userRepository.findAuthFields), however many auth middlewares it passes:
// the global optionalAuthenticate and a route's authenticateToken share one
// memoized check (middleware/authenticateToken.js resolveSession), and no
// route mounts optionalAuthenticate a second time.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DAILY_CHALLENGE_SEED_SECRET = process.env.DAILY_CHALLENGE_SEED_SECRET || 'test-daily-seed';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin, adminSessionHeaders, DEFAULT_PASSWORD } = require('./testUtils/authHelpers');
const userRepository = require('../repositories/userRepository');
const optionalAuthenticate = require('../middleware/optionalAuth');
const Question = require('../models/questionModel');
const User = require('../models/user');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
  jest.restoreAllMocks();
});

afterAll(async () => {
  await db.closeDatabase();
});

async function lookupsFor(makeRequest) {
  const spy = jest.spyOn(userRepository, 'findAuthFields');
  const res = await makeRequest();
  const calls = spy.mock.calls.length;
  spy.mockRestore();
  return { res, calls };
}

describe('exactly one user lookup per request with a session', () => {
  it('for public, guest-capable, authenticated and state-changing user routes', async () => {
    await Question.create({
      question: 'Q', options: ['a', 'b'], answer: 'b', difficulty: 'easy', primaryTopic: 'Lists', explanation: 'e',
    });
    const u = await registerAndLogin('onelookup@example.com', { username: 'onelookup' });
    const withSession = (req) => req.set('Cookie', u.cookieHeader).set('X-CSRF-Token', u.csrfToken);

    const start = await withSession(request(app).post('/api/v1/quiz/sessions')).send({ mode: 'classic', topics: [] });
    const { sessionId, question } = start.body.data;

    const cases = {
      'GET /auth/me': () => withSession(request(app).get('/api/v1/auth/me')),
      'GET /users/me': () => withSession(request(app).get('/api/v1/users/me')),
      'GET /users/topic-mastery': () => withSession(request(app).get('/api/v1/users/topic-mastery')),
      'GET /users/leaderboard': () => withSession(request(app).get('/api/v1/users/leaderboard')),
      'GET /questions/study': () => withSession(request(app).get('/api/v1/questions/study')),
      'GET /questions/topics (public)': () => withSession(request(app).get('/api/v1/questions/topics')),
      'GET /challenges/daily': () => withSession(request(app).get('/api/v1/challenges/daily')),
      'PATCH /users/settings/profile': () =>
        withSession(request(app).patch('/api/v1/users/settings/profile')).send({ username: 'onelookup2' }),
      'POST /quiz/sessions': () =>
        withSession(request(app).post('/api/v1/quiz/sessions')).send({ mode: 'classic', topics: [] }),
      'POST /quiz/sessions/:id/answer': () =>
        withSession(request(app).post(`/api/v1/quiz/sessions/${sessionId}/answer`)).send({
          questionId: question._id,
          selectedIndex: 1,
        }),
      'POST /quiz/sessions/:id/next': () => withSession(request(app).post(`/api/v1/quiz/sessions/${sessionId}/next`)),
    };

    for (const [name, makeRequest] of Object.entries(cases)) {
      const { res, calls } = await lookupsFor(makeRequest);
      expect({ name, status: res.statusCode < 500, calls }).toEqual({ name, status: true, calls: 1 });
    }
  });

  it('for admin routes carrying the admin session', async () => {
    await User.create({
      username: 'lookupadmin',
      email: 'lookupadmin@example.com',
      password: await bcrypt.hash(DEFAULT_PASSWORD, 10),
      role: 'admin',
    });
    const login = await request(app).post('/api/v1/admin/login').send({ username: 'lookupadmin', password: DEFAULT_PASSWORD });
    const admin = adminSessionHeaders(login);

    for (const path of ['/api/v1/admin/me', '/api/v1/admin/users']) {
      const { res, calls } = await lookupsFor(() => request(app).get(path).set(admin));
      expect({ path, status: res.statusCode, calls }).toEqual({ path, status: 200, calls: 1 });
    }
  });

  it('for a revoked session (one lookup, then 401)', async () => {
    const u = await registerAndLogin('revokedlookup@example.com', { username: 'revokedlookup' });
    await User.updateOne({ email: 'revokedlookup@example.com' }, { $inc: { tokenVersion: 1 } });

    const { res, calls } = await lookupsFor(() => request(app).get('/api/v1/users/me').set('Cookie', u.cookieHeader));
    expect(res.statusCode).toBe(401);
    expect(calls).toBe(1);
  });

  it('and none at all without a session cookie', async () => {
    const { calls } = await lookupsFor(() => request(app).get('/api/v1/questions/topics'));
    expect(calls).toBe(0);
  });
});

describe('optionalAuthenticate is mounted exactly once', () => {
  it('globally on /api, and on no individual route', () => {
    const appLevel = app._router.stack.filter((layer) => layer.handle === optionalAuthenticate);
    expect(appLevel).toHaveLength(1);

    const routeLevel = [];
    for (const layer of app._router.stack) {
      for (const inner of layer.handle?.stack || []) {
        if (inner.route && inner.route.stack.some((s) => s.handle === optionalAuthenticate)) {
          routeLevel.push(inner.route.path);
        }
      }
    }
    expect(routeLevel).toEqual([]);
  });
});
