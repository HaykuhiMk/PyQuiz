// Previously unvalidated inputs are now Zod-validated and rejected with 400,
// consistent with paginationQuerySchema on the admin list endpoints:
// the leaderboard `limit` query (it used to be clamped or silently replaced
// by 50) and the admin `:id` path parameters (only a Mongoose CastError
// used to catch a malformed id).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin, adminSessionHeaders, DEFAULT_PASSWORD } = require('./testUtils/authHelpers');
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

function expectValidationError(res, field) {
  expect(res.statusCode).toBe(400);
  expect(res.body.success).toBe(false);
  expect(res.body.error.message).toBe('Validation failed');
  expect(res.body.error.details.fieldErrors[field]).toBeDefined();
}

async function adminLogin() {
  await User.create({
    username: 'queryadmin',
    email: 'queryadmin@example.com',
    password: await bcrypt.hash(DEFAULT_PASSWORD, 10),
    role: 'admin',
  });
  const res = await request(app).post('/api/v1/admin/login').send({ username: 'queryadmin', password: DEFAULT_PASSWORD });
  return adminSessionHeaders(res);
}

describe('GET /api/v1/users/leaderboard limit', () => {
  it('accepts an integer from 1 to 100, and defaults to 50', async () => {
    for (const name of ['lb1', 'lb2', 'lb3']) {
      await registerAndLogin(`${name}@example.com`, { username: name });
    }
    expect((await request(app).get('/api/v1/users/leaderboard?limit=2')).body.data).toHaveLength(2);
    expect((await request(app).get('/api/v1/users/leaderboard?limit=100')).statusCode).toBe(200);
    expect((await request(app).get('/api/v1/users/leaderboard')).body.data).toHaveLength(3);
  });

  it.each(['abc', '0', '-5', '101', '1e3', '2.7', '', '%20', '2&limit=3'])('rejects limit=%s with 400', async (value) => {
    expectValidationError(await request(app).get(`/api/v1/users/leaderboard?limit=${value}`), 'limit');
  });

  it('matches the admin endpoints, which already reject a bad limit the same way', async () => {
    const admin = await adminLogin();
    expectValidationError(await request(app).get('/api/v1/admin/users?limit=abc').set(admin), 'limit');
    expectValidationError(await request(app).get('/api/v1/users/leaderboard?limit=abc'), 'limit');
  });
});

describe('admin :id path parameters', () => {
  const MALFORMED = ['not-an-id', '123', `${'a'.repeat(25)}`, 'zzzzzzzzzzzzzzzzzzzzzzzz'];

  it.each(MALFORMED)('reject id=%s with 400 on every admin route that takes one', async (id) => {
    const admin = await adminLogin();
    expectValidationError(await request(app).get(`/api/v1/admin/questions/${id}`).set(admin), 'id');
    expectValidationError(await request(app).patch(`/api/v1/admin/questions/${id}`).set(admin).send({ difficulty: 'easy' }), 'id');
    expectValidationError(await request(app).delete(`/api/v1/admin/questions/${id}`).set(admin), 'id');
    expectValidationError(await request(app).patch(`/api/v1/admin/users/${id}/ban`).set(admin).send({ banned: true }), 'id');
  });

  it('still returns 404 for a well-formed id that does not exist', async () => {
    const admin = await adminLogin();
    const id = '507f1f77bcf86cd799439011';
    expect((await request(app).get(`/api/v1/admin/questions/${id}`).set(admin)).statusCode).toBe(404);
    expect((await request(app).patch(`/api/v1/admin/users/${id}/ban`).set(admin).send({ banned: true })).statusCode).toBe(404);
  });

  it('checks authentication before the id (401, not 400, without a session)', async () => {
    expect((await request(app).get('/api/v1/admin/questions/not-an-id')).statusCode).toBe(401);
  });
});
