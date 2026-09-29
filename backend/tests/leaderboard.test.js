process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

describe('GET /api/v1/users/leaderboard', () => {
  it('is public (no auth required)', async () => {
    await registerAndLogin('publicboard@example.com');
    const res = await request(app).get('/api/v1/users/leaderboard');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('marks isCurrentUser on the viewer\'s own row and nowhere else', async () => {
    const userA = await registerAndLogin('boardA@example.com', { username: 'boarda' });
    await registerAndLogin('boardB@example.com', { username: 'boardb' });

    const res = await request(app).get('/api/v1/users/leaderboard').set('Cookie', userA.cookieHeader);

    expect(res.statusCode).toBe(200);
    const flagged = res.body.data.filter((row) => row.isCurrentUser);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].username).toBe('boarda');
  });

  it('marks no row as current user for a guest (no cookie)', async () => {
    await registerAndLogin('boardguest@example.com');
    const res = await request(app).get('/api/v1/users/leaderboard');

    expect(res.body.data.every((row) => row.isCurrentUser === false)).toBe(true);
  });

  it('never includes avatar data', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('boardavatar@example.com');
    await request(app)
      .patch('/api/v1/users/settings/profile')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ avatar: `data:image/png;base64,${'A'.repeat(100)}` });

    const res = await request(app).get('/api/v1/users/leaderboard');
    expect(res.body.data.every((row) => row.avatar === undefined)).toBe(true);
  });
});
