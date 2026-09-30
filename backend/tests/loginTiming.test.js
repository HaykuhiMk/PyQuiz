// Login must not reveal whether an account exists: an unknown email (or
// admin username) gets the same generic error as a wrong password and does
// the same bcrypt work (exactly one comparison), so the response time
// doesn't give it away either (utils/passwordCheck.js). Asserting on the
// comparison count, rather than on wall-clock time, keeps this test stable.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const User = require('../models/user');
const { DEFAULT_PASSWORD } = require('./testUtils/authHelpers');

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

async function attempt(path, body) {
  const compare = jest.spyOn(bcrypt, 'compare');
  const res = await request(app).post(path).send(body);
  const comparisons = compare.mock.calls.length;
  compare.mockRestore();
  return { res, comparisons };
}

describe('regular-user login', () => {
  it('treats an unknown email exactly like a wrong password', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'timing', email: 'timing@example.com', password: DEFAULT_PASSWORD });

    const unknown = await attempt('/api/v1/auth/login', { email: 'nobody@example.com', password: 'Wr0ng!pass' });
    const wrong = await attempt('/api/v1/auth/login', { email: 'timing@example.com', password: 'Wr0ng!pass' });

    for (const { res, comparisons } of [unknown, wrong]) {
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual(wrong.res.body);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(comparisons).toBe(1);
    }
    expect(wrong.res.body.error.message).toBe('Invalid credentials');
  });

  it('still logs in with the right password', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'timingok', email: 'timingok@example.com', password: DEFAULT_PASSWORD });
    const { res, comparisons } = await attempt('/api/v1/auth/login', {
      email: 'timingok@example.com',
      password: DEFAULT_PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    expect(comparisons).toBe(1);
  });
});

describe('admin login', () => {
  it('does one comparison for an unknown username, same as a wrong password', async () => {
    await User.create({
      username: 'timingadmin',
      email: 'timingadmin@example.com',
      password: await bcrypt.hash(DEFAULT_PASSWORD, 10),
      role: 'admin',
    });

    const unknown = await attempt('/api/v1/admin/login', { username: 'nobody', password: 'Wr0ng!pass' });
    const wrong = await attempt('/api/v1/admin/login', { username: 'timingadmin', password: 'Wr0ng!pass' });

    expect(unknown.res.body).toEqual(wrong.res.body);
    expect(unknown.comparisons).toBe(1);
    expect(wrong.comparisons).toBe(1);
  });
});
