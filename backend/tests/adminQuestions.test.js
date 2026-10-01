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
  options: ['2', '3', '4'],
  answer: '3',
  difficulty: 'easy',
  primaryTopic: 'functions',
  secondaryTopics: ['lists'],
  explanation: 'There are three elements in the list.',
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

describe('POST /api/v1/admin/login', () => {
  // Was 404 "Admin not found" before, which revealed which admin usernames
  // exist; it now gets the same generic 401 as a wrong password.
  it('rejects an unknown admin username with the generic invalid-credentials error', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ username: 'nobody', password: VALID_PASSWORD });

    expect(res.statusCode).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('answers an unknown username and a wrong password identically', async () => {
    const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
    await User.create({ username: 'realadmin', email: 'realadmin@example.com', password: hashed, role: 'admin' });
    // A regular (non-admin) account's username must not be distinguishable either.
    await User.create({ username: 'plainuser', email: 'plainuser@example.com', password: hashed, role: 'user' });

    const unknown = await request(app).post('/api/v1/admin/login').send({ username: 'nobody', password: 'Wr0ng!pass' });
    const wrongPassword = await request(app)
      .post('/api/v1/admin/login')
      .send({ username: 'realadmin', password: 'Wr0ng!pass' });
    const nonAdmin = await request(app).post('/api/v1/admin/login').send({ username: 'plainuser', password: VALID_PASSWORD });

    for (const res of [unknown, wrongPassword, nonAdmin]) {
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual(wrongPassword.body);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('rejects an incorrect password', async () => {
    const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
    await User.create({
      username: 'wrongpasstest',
      email: 'wrongpasstest@example.com',
      password: hashed,
      role: 'admin',
    });

    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ username: 'wrongpasstest', password: 'WrongPass1!' });

    expect(res.statusCode).toBe(401);
  });

  it('rejects a regular (non-admin) user by username, even with the correct password', async () => {
    await request(app).post('/api/v1/auth/register').send({
      username: 'notanadmin',
      email: 'notanadmin@example.com',
      password: VALID_PASSWORD,
    });

    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ username: 'notanadmin', password: VALID_PASSWORD });

    // Generic 401 (was 404) so the response doesn't reveal that the account exists.
    expect(res.statusCode).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('rejects a missing password (validation)', async () => {
    const res = await request(app).post('/api/v1/admin/login').send({ username: 'admintester' });
    expect(res.statusCode).toBe(400);
  });

  it('returns a working admin token for correct credentials', async () => {
    const adminHeaders = await adminLogin();

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set(adminHeaders)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(201);
  });
});

async function regularUserInAdminCookie() {
  // verifyAdmin only reads the admin session cookie, so a regular user's
  // session JWT is placed in that cookie slot here purely to exercise its
  // role check (rather than its missing-cookie check).
  const { tokenCookieValue } = await registerAndLogin('regular@example.com', { username: 'regular' });
  return `adminToken=${tokenCookieValue}`;
}

describe('POST /api/v1/questions/add (admin only)', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).post('/api/v1/questions/add').send(validQuestionPayload);

    expect(res.statusCode).toBe(401);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('rejects a regular, non-admin user', async () => {
    const cookie = await regularUserInAdminCookie();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Cookie', cookie)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(403);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('allows a valid admin token', async () => {
    const adminHeaders = await adminLogin();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set(adminHeaders)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(201);
    expect(await Question.countDocuments()).toBe(1);
  });

  it('rejects an answer that is not one of the provided options', async () => {
    const adminHeaders = await adminLogin();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set(adminHeaders)
      .send({ ...validQuestionPayload, answer: 'not-an-option' });

    expect(res.statusCode).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  // Canonical-topic validation (primaryTopic enum, primary/secondary
  // collision) is covered separately in adminQuestionTopics.test.js — kept
  // out of this file so its extra admin-login calls don't push this file's
  // total past the /api/v1/admin/login rate limiter's 20/15min budget.
});

describe('Admin question management (list/get/update/delete)', () => {
  async function createQuestionDirectly(overrides = {}) {
    return Question.create({ ...validQuestionPayload, ...overrides });
  }

  describe('GET /api/v1/admin/questions', () => {
    it('rejects requests with no token', async () => {
      const res = await request(app).get('/api/v1/admin/questions');
      expect(res.statusCode).toBe(401);
    });

    it('returns full question detail, including the answer, for an admin', async () => {
      await createQuestionDirectly();
      const adminHeaders = await adminLogin();

      const res = await request(app).get('/api/v1/admin/questions').set(adminHeaders);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].answer).toBe(validQuestionPayload.answer);
      expect(res.body.data[0].explanation).toBe(validQuestionPayload.explanation);
    });
  });

  describe('GET /api/v1/admin/questions/:id', () => {
    it('rejects requests with no token', async () => {
      const q = await createQuestionDirectly();
      const res = await request(app).get(`/api/v1/admin/questions/${q._id}`);
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for a question that does not exist', async () => {
      const adminHeaders = await adminLogin();
      const res = await request(app)
        .get('/api/v1/admin/questions/507f1f77bcf86cd799439011')
        .set(adminHeaders);
      expect(res.statusCode).toBe(404);
    });

    it('returns the full question for a valid id', async () => {
      const q = await createQuestionDirectly();
      const adminHeaders = await adminLogin();

      const res = await request(app)
        .get(`/api/v1/admin/questions/${q._id}`)
        .set(adminHeaders);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.answer).toBe(validQuestionPayload.answer);
    });
  });

  describe('PATCH /api/v1/admin/questions/:id', () => {
    it('rejects requests with no token', async () => {
      const q = await createQuestionDirectly();
      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .send({ explanation: 'Updated explanation' });
      expect(res.statusCode).toBe(401);
    });

    it('updates a single field and persists it', async () => {
      const q = await createQuestionDirectly();
      const adminHeaders = await adminLogin();

      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .set(adminHeaders)
        .send({ explanation: 'Updated explanation' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.explanation).toBe('Updated explanation');

      const stored = await Question.findById(q._id).lean();
      expect(stored.explanation).toBe('Updated explanation');
    });

    it('rejects an empty update body', async () => {
      const q = await createQuestionDirectly();
      const adminHeaders = await adminLogin();

      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .set(adminHeaders)
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('rejects changing the answer to something outside the current options', async () => {
      const q = await createQuestionDirectly();
      const adminHeaders = await adminLogin();

      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .set(adminHeaders)
        .send({ answer: 'not-an-option' });

      expect(res.statusCode).toBe(400);
      const stored = await Question.findById(q._id).lean();
      expect(stored.answer).toBe(validQuestionPayload.answer);
    });

    it('allows changing options and answer together consistently', async () => {
      const q = await createQuestionDirectly();
      const adminHeaders = await adminLogin();

      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .set(adminHeaders)
        .send({ options: ['x', 'y'], answer: 'y' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.answer).toBe('y');
    });

    // rejects changing secondaryTopics to collide with primaryTopic: see
    // adminQuestionTopics.test.js.
  });

  describe('DELETE /api/v1/admin/questions/:id', () => {
    it('rejects requests with no token', async () => {
      const q = await createQuestionDirectly();
      const res = await request(app).delete(`/api/v1/admin/questions/${q._id}`);
      expect(res.statusCode).toBe(401);
      expect(await Question.findById(q._id)).not.toBeNull();
    });

    it('returns 404 for a question that does not exist', async () => {
      const adminHeaders = await adminLogin();
      const res = await request(app)
        .delete('/api/v1/admin/questions/507f1f77bcf86cd799439011')
        .set(adminHeaders);
      expect(res.statusCode).toBe(404);
    });

    it('deletes the question for a valid admin request', async () => {
      const q = await createQuestionDirectly();
      const adminHeaders = await adminLogin();

      const res = await request(app)
        .delete(`/api/v1/admin/questions/${q._id}`)
        .set(adminHeaders);

      expect(res.statusCode).toBe(200);
      expect(await Question.findById(q._id)).toBeNull();
    });
  });
});
