// Phase 4 session security (docs/AUDIT.md items 10 and 12): tokenVersion
// invalidation, HMAC-bound CSRF tokens, __Host- cookies in production, and
// GET /api/v1/auth/me for real login-state detection.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

jest.mock('../utils/emailUtils', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendContactEmail: jest.fn().mockResolvedValue(undefined),
}));

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { DEFAULT_PASSWORD, extractCookies, registerAndLogin, adminSessionHeaders } = require('./testUtils/authHelpers');
const User = require('../models/user');
const { sendPasswordResetEmail } = require('../utils/emailUtils');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await db.closeDatabase();
});

function me(cookieHeader) {
  return request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader);
}

function renameSelf(cookieHeader, csrfToken, username) {
  const req = request(app).patch('/api/v1/users/settings/profile').set('Cookie', cookieHeader);
  if (csrfToken !== undefined) req.set('X-CSRF-Token', csrfToken);
  return req.send({ username });
}

describe('Session invalidation via tokenVersion', () => {
  it('a password change invalidates sessions issued before it', async () => {
    const other = await registerAndLogin('pwchange@example.com', { username: 'pwchange' });
    const current = await registerAndLogin('pwchange@example.com', { username: 'pwchange' });
    expect((await me(other.cookieHeader)).statusCode).toBe(200);

    const change = await request(app)
      .patch('/api/v1/users/settings/password')
      .set('Cookie', current.cookieHeader)
      .set('X-CSRF-Token', current.csrfToken)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'N3wPassw0rd!' });
    expect(change.statusCode).toBe(200);

    expect((await me(other.cookieHeader)).statusCode).toBe(401);
    expect((await me(current.cookieHeader)).statusCode).toBe(401);
  });

  it('a password reset invalidates sessions issued before it', async () => {
    const session = await registerAndLogin('pwreset@example.com', { username: 'pwreset' });

    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'pwreset@example.com' });
    const [, resetUrl] = sendPasswordResetEmail.mock.calls[0];
    const resetKey = new URL(resetUrl).searchParams.get('resetKey');

    const reset = await request(app)
      .post(`/api/v1/auth/reset-password/${resetKey}`)
      .send({ password: 'N3wPassw0rd!' });
    expect(reset.statusCode).toBe(200);

    expect((await me(session.cookieHeader)).statusCode).toBe(401);
  });

  it('a ban invalidates the banned user\'s existing session', async () => {
    const session = await registerAndLogin('banme@example.com', { username: 'banme' });
    const user = await User.findOne({ email: 'banme@example.com' });

    const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await User.create({ username: 'banadmin', email: 'banadmin@example.com', password: hashed, role: 'admin' });
    const adminRes = await request(app)
      .post('/api/v1/admin/login')
      .send({ username: 'banadmin', password: DEFAULT_PASSWORD });

    const ban = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/ban`)
      .set(adminSessionHeaders(adminRes))
      .send({ banned: true });
    expect(ban.statusCode).toBe(200);

    expect((await me(session.cookieHeader)).statusCode).toBe(401);
    expect((await User.findById(user._id)).tokenVersion).toBe(1);
  });

  it('a banned user is rejected at login', async () => {
    await registerAndLogin('prebanned@example.com', { username: 'prebanned' });
    await User.updateOne({ email: 'prebanned@example.com' }, { banned: true });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'prebanned@example.com', password: DEFAULT_PASSWORD });

    expect(res.statusCode).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a pre-Phase-4 token with no tokenVersion claim still works for an untouched account', async () => {
    await registerAndLogin('legacy@example.com', { username: 'legacy' });
    const user = await User.findOne({ email: 'legacy@example.com' });
    const legacyToken = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    expect((await me(`token=${legacyToken}`)).statusCode).toBe(200);
  });
});

describe('HMAC-bound CSRF tokens', () => {
  it('accepts the CSRF token bound to this session', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('csrfok@example.com', { username: 'csrfok' });
    expect((await renameSelf(cookieHeader, csrfToken, 'csrfok2')).statusCode).toBe(200);
  });

  it('rejects a CSRF token bound to a different session (mismatched)', async () => {
    const victim = await registerAndLogin('victim@example.com', { username: 'victim' });
    const attacker = await registerAndLogin('attacker@example.com', { username: 'attacker' });

    const res = await renameSelf(victim.cookieHeader, attacker.csrfToken, 'pwned');
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unbound token even when cookie and header agree (planted double-submit)', async () => {
    // What a sibling subdomain could do against a plain double-submit check:
    // plant its own csrfToken cookie and send the same value as the header.
    const victim = await registerAndLogin('planted@example.com', { username: 'planted' });
    const planted = crypto.randomBytes(32).toString('hex');

    const res = await renameSelf(`token=${victim.tokenCookieValue}; csrfToken=${planted}`, planted, 'pwned');
    expect(res.statusCode).toBe(403);
  });

  it('rejects a missing CSRF header and a non-hex one', async () => {
    const { cookieHeader } = await registerAndLogin('csrfmissing@example.com', { username: 'csrfmissing' });
    expect((await renameSelf(cookieHeader, undefined, 'x1')).statusCode).toBe(403);
    expect((await renameSelf(cookieHeader, 'not-hex-at-all', 'x2')).statusCode).toBe(403);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the user and the CSRF token bound to the session', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('whoami@example.com', { username: 'whoami' });

    const res = await me(cookieHeader);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'whoami@example.com', username: 'whoami' });
    expect(res.body.data.csrfToken).toBe(csrfToken);
  });

  it('the login response body carries the same CSRF token as the cookie', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'bodycsrf', email: 'bodycsrf@example.com', password: DEFAULT_PASSWORD });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bodycsrf@example.com', password: DEFAULT_PASSWORD });

    expect(res.body.data.csrfToken).toBe(extractCookies(res).csrfToken);
  });

  it('returns 401 with no session and for an expired JWT', async () => {
    expect((await request(app).get('/api/v1/auth/me')).statusCode).toBe(401);

    await registerAndLogin('expired@example.com', { username: 'expired' });
    const user = await User.findOne({ email: 'expired@example.com' });
    const expired = jwt.sign(
      { userId: user._id, email: user.email, tokenVersion: 0, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET
    );
    expect((await me(`token=${expired}`)).statusCode).toBe(401);
  });
});

describe('__Host- cookies in production', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('sets __Host- prefixed, Secure, Path=/, Domain-less session and CSRF cookies', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'produser', email: 'produser@example.com', password: DEFAULT_PASSWORD });

    process.env.NODE_ENV = 'production';
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'produser@example.com', password: DEFAULT_PASSWORD });

    const setCookie = res.headers['set-cookie'];
    const session = setCookie.find((c) => c.startsWith('__Host-token='));
    const csrf = setCookie.find((c) => c.startsWith('__Host-csrfToken='));
    for (const cookie of [session, csrf]) {
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; Path=\//);
      expect(cookie).not.toMatch(/Domain=/i);
    }
    expect(session).toMatch(/HttpOnly/);
    expect(csrf).not.toMatch(/HttpOnly/);

    const cookies = extractCookies(res);
    const authed = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `__Host-token=${cookies['__Host-token']}`);
    expect(authed.statusCode).toBe(200);

    // A cookie planted under the unprefixed name (all a sibling subdomain
    // can set) is not read at all in production.
    const shadow = await request(app).get('/api/v1/auth/me').set('Cookie', `token=${cookies['__Host-token']}`);
    expect(shadow.statusCode).toBe(401);
  });

  it('uses unprefixed, non-Secure cookies outside production so http://localhost keeps working', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'devuser', email: 'devuser@example.com', password: DEFAULT_PASSWORD });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'devuser@example.com', password: DEFAULT_PASSWORD });

    const session = res.headers['set-cookie'].find((c) => c.startsWith('token='));
    expect(session).toBeDefined();
    expect(session).not.toMatch(/; Secure/);
  });
});
