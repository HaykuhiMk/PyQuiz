process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');

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

describe('POST /api/v1/auth/register', () => {
  it('registers a new user', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'tester',
      email: 'tester@example.com',
      password: VALID_PASSWORD,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/v1/auth/register').send({
      username: 'first',
      email: 'dup@example.com',
      password: VALID_PASSWORD,
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'second',
      email: 'dup@example.com',
      password: VALID_PASSWORD,
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/already exists/i);
  });

  it('rejects a weak password', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'weak',
      email: 'weak@example.com',
      password: 'short',
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a username that collides case-insensitively with an existing one', async () => {
    await request(app).post('/api/v1/auth/register').send({
      username: 'CaseTest',
      email: 'casetest1@example.com',
      password: VALID_PASSWORD,
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'casetest',
      email: 'casetest2@example.com',
      password: VALID_PASSWORD,
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/already exists/i);
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send({
      username: 'loginuser',
      email: 'login@example.com',
      password: VALID_PASSWORD,
    });
  });

  it('logs in with correct credentials and sets httpOnly auth + readable CSRF cookies', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'login@example.com',
      password: VALID_PASSWORD,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.token).toBeUndefined();

    const setCookie = res.headers['set-cookie'];
    const tokenCookie = setCookie.find((c) => c.startsWith('token='));
    const csrfCookie = setCookie.find((c) => c.startsWith('csrfToken='));

    expect(tokenCookie).toMatch(/HttpOnly/);
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toMatch(/HttpOnly/);
  });

  it('rejects an incorrect password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'login@example.com',
      password: 'WrongPass1!',
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'nobody@example.com',
      password: VALID_PASSWORD,
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('authenticateToken (JWT verification)', () => {
  it('rejects a validly-signed token using a non-allowlisted algorithm', async () => {
    const token = jwt.sign({ userId: 'x', email: 'x@example.com' }, process.env.JWT_SECRET, {
      algorithm: 'HS512',
    });

    const res = await request(app).get('/api/v1/users/me').set('Cookie', `token=${token}`);

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the auth and csrf cookies', async () => {
    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    const tokenCookie = setCookie.find((c) => c.startsWith('token='));
    const csrfCookie = setCookie.find((c) => c.startsWith('csrfToken='));

    expect(tokenCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(csrfCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('PATCH /api/v1/users/settings/profile (username uniqueness)', () => {
  it('rejects renaming to a username that collides case-insensitively with another account', async () => {
    await registerAndLogin('taken@example.com', { username: 'TakenName' });
    const { cookieHeader, csrfToken } = await registerAndLogin('renamer@example.com', { username: 'renamer' });

    const res = await request(app)
      .patch('/api/v1/users/settings/profile')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'takenname' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/already exists/i);
  });

  it('allows changing only the case of your own username', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('samecase@example.com', { username: 'MixedCase' });

    const res = await request(app)
      .patch('/api/v1/users/settings/profile')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'mixedcase' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.username).toBe('mixedcase');
  });
});
