process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('./testUtils/db');
const { adminSessionHeaders } = require('./testUtils/authHelpers');
const User = require('../models/user');

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

async function createAdmin(username = 'admintester') {
  const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
  const admin = await User.create({
    username,
    email: `${username}@example.com`,
    password: hashed,
    role: 'admin',
  });
  return admin;
}

async function adminLogin(username = 'admintester') {
  await createAdmin(username);
  const res = await request(app).post('/api/v1/admin/login').send({ username, password: VALID_PASSWORD });
  return adminSessionHeaders(res);
}

async function createRegularUser(username, email) {
  const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
  return User.create({ username, email, password: hashed, role: 'user' });
}

describe('GET /api/v1/admin/users', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.statusCode).toBe(401);
  });

  it('lists users without exposing password hashes', async () => {
    await createRegularUser('alice', 'alice@example.com');
    const adminHeaders = await adminLogin();

    const res = await request(app).get('/api/v1/admin/users').set(adminHeaders);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2); // alice + the admin itself
    for (const user of res.body.data) {
      expect(user.password).toBeUndefined();
    }
    const alice = res.body.data.find((u) => u.username === 'alice');
    expect(alice.banned).toBe(false);
  });
});

describe('PATCH /api/v1/admin/users/:id/ban', () => {
  it('rejects requests with no token', async () => {
    const user = await createRegularUser('bob', 'bob@example.com');
    const res = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/ban`)
      .send({ banned: true });
    expect(res.statusCode).toBe(401);
  });

  it('bans a regular user', async () => {
    const user = await createRegularUser('carol', 'carol@example.com');
    const adminHeaders = await adminLogin();

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/ban`)
      .set(adminHeaders)
      .send({ banned: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.banned).toBe(true);

    const stored = await User.findById(user._id).lean();
    expect(stored.banned).toBe(true);
  });

  it('unbans a previously banned user', async () => {
    const user = await createRegularUser('dave', 'dave@example.com');
    await User.findByIdAndUpdate(user._id, { banned: true });
    const adminHeaders = await adminLogin();

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/ban`)
      .set(adminHeaders)
      .send({ banned: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.banned).toBe(false);
  });

  it('refuses to ban an admin account', async () => {
    const target = await createAdmin('otheradmin');
    const adminHeaders = await adminLogin('bannerAdmin');

    const res = await request(app)
      .patch(`/api/v1/admin/users/${target._id}/ban`)
      .set(adminHeaders)
      .send({ banned: true });

    expect(res.statusCode).toBe(403);
    const stored = await User.findById(target._id).lean();
    expect(stored.banned).toBe(false);
  });

  it('returns 404 for a user that does not exist', async () => {
    const adminHeaders = await adminLogin();
    const res = await request(app)
      .patch('/api/v1/admin/users/507f1f77bcf86cd799439011/ban')
      .set(adminHeaders)
      .send({ banned: true });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a non-boolean banned value', async () => {
    const user = await createRegularUser('erin', 'erin@example.com');
    const adminHeaders = await adminLogin();

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/ban`)
      .set(adminHeaders)
      .send({ banned: 'yes' });

    expect(res.statusCode).toBe(400);
  });
});

describe('Banned users cannot log in', () => {
  it('rejects login for a banned account with the correct password', async () => {
    const email = 'banned@example.com';
    await request(app).post('/api/v1/auth/register').send({
      username: 'bannedguy',
      email,
      password: VALID_PASSWORD,
    });
    const user = await User.findOne({ email });
    const adminHeaders = await adminLogin();

    await request(app)
      .patch(`/api/v1/admin/users/${user._id}/ban`)
      .set(adminHeaders)
      .send({ banned: true });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: VALID_PASSWORD });

    expect(loginRes.statusCode).toBe(403);
  });
});
