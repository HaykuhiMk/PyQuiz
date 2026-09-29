// Own file (rather than part of adminQuestions.test.js) so these admin
// logins get a fresh /api/v1/admin/login rate-limiter budget — Jest loads
// a fresh app instance per test file.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin, adminSessionHeaders } = require('./testUtils/authHelpers');
const User = require('../models/user');
const Question = require('../models/questionModel');

const VALID_PASSWORD = 'Passw0rd!';
const validQuestionPayload = {
  question: 'What does len([1, 2, 3]) return?',
  options: ['1', '2', '3', '4'],
  answer: '3',
  difficulty: 'easy',
  primaryTopic: 'Lists',
  secondaryTopics: [],
  explanation: 'len returns the number of items.',
};

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

async function adminLogin() {
  const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
  await User.create({
    username: 'admintester',
    email: 'admintester@example.com',
    password: hashed,
    role: 'admin',
  });

  const res = await request(app)
    .post('/api/v1/admin/login')
    .send({ username: 'admintester', password: VALID_PASSWORD });
  return adminSessionHeaders(res);
}

// Phase 4 (docs/AUDIT.md item 11) deliberately replaced the old "admin auth
// is Authorization-header only" behaviour: admin auth now rides its own
// httpOnly cookie, separate from the regular-user cookie, and the Bearer
// header is no longer accepted at all.
describe('verifyAdmin: separate admin cookie only (Phase 4)', () => {
  it('ignores a present regular-user session cookie', async () => {
    const { cookieHeader, csrfToken } = await registerAndLogin('admincookie@example.com', { username: 'admincookie' });

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(403);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('no longer accepts an admin JWT as an Authorization: Bearer header', async () => {
    const adminHeaders = await adminLogin();
    const adminJwt = /adminToken=([^;]+)/.exec(adminHeaders.Cookie)[1];

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Authorization', `Bearer ${adminJwt}`)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(403);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('login returns no token in the body, only an httpOnly admin cookie', async () => {
    const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
    await User.create({ username: 'bodyless', email: 'bodyless@example.com', password: hashed, role: 'admin' });

    const res = await request(app).post('/api/v1/admin/login').send({ username: 'bodyless', password: VALID_PASSWORD });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.token).toBeUndefined();
    const setCookie = res.headers['set-cookie'].join('\n');
    expect(setCookie).toMatch(/adminToken=[^;]+;.*HttpOnly/);
    expect(setCookie).not.toMatch(/(^|\n)token=/);
  });

  it('a valid admin cookie still works even when a regular-user cookie is also present', async () => {
    const user = await registerAndLogin('adminandcookie@example.com', { username: 'adminandcookie' });
    const adminHeaders = await adminLogin();

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Cookie', `${user.cookieHeader}; ${adminHeaders.Cookie}`)
      .set('X-CSRF-Token', adminHeaders['X-CSRF-Token'])
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(201);
    expect(await Question.countDocuments()).toBe(1);
  });

  it('rejects a state-changing admin request whose CSRF header is the regular-user token', async () => {
    const user = await registerAndLogin('csrfmix@example.com', { username: 'csrfmix' });
    const adminHeaders = await adminLogin();

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Cookie', `${user.cookieHeader}; ${adminHeaders.Cookie}`)
      .set('X-CSRF-Token', user.csrfToken)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(403);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('rejects a state-changing admin request with no CSRF header', async () => {
    const adminHeaders = await adminLogin();

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Cookie', adminHeaders.Cookie)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(403);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('GET /admin/me reports the session, and logout clears the admin cookie', async () => {
    const adminHeaders = await adminLogin();

    const me = await request(app).get('/api/v1/admin/me').set('Cookie', adminHeaders.Cookie);
    expect(me.statusCode).toBe(200);
    expect(me.body.data.admin.username).toBe('admintester');
    expect(me.body.data.csrfToken).toBe(adminHeaders['X-CSRF-Token']);

    const logout = await request(app).post('/api/v1/admin/logout').set('Cookie', adminHeaders.Cookie);
    expect(logout.headers['set-cookie'].join('\n')).toMatch(/adminToken=;/);
  });

  it('a demoted admin loses access immediately', async () => {
    const adminHeaders = await adminLogin();
    await User.updateOne({ username: 'admintester' }, { role: 'user' });

    const res = await request(app).get('/api/v1/admin/me').set('Cookie', adminHeaders.Cookie);
    expect(res.statusCode).toBe(401);
  });
});
