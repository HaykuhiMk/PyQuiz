process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const User = require('../models/user');
const Question = require('../models/questionModel');

const VALID_PASSWORD = 'Passw0rd!';
const validQuestionPayload = {
  question: 'What does len([1, 2, 3]) return?',
  options: ['2', '3', '4'],
  answer: '3',
  difficulty: 'easy',
  topics: ['len'],
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

async function adminToken() {
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
  return res.body.data.token;
}

describe('POST /api/v1/admin/login', () => {
  it('rejects an unknown admin username', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ username: 'nobody', password: VALID_PASSWORD });

    expect(res.statusCode).toBe(404);
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

    expect(res.statusCode).toBe(404);
  });

  it('rejects a missing password (validation)', async () => {
    const res = await request(app).post('/api/v1/admin/login').send({ username: 'admintester' });
    expect(res.statusCode).toBe(400);
  });

  it('returns a working admin token for correct credentials', async () => {
    const token = await adminToken();

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Authorization', `Bearer ${token}`)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(201);
  });
});

async function regularUserAuthHeader() {
  // verifyAdmin only reads the Authorization header (it never accepts the
  // auth cookie), so a regular user's session token is re-sent as a Bearer
  // header here purely to exercise that code path.
  const { tokenCookieValue } = await registerAndLogin('regular@example.com', { username: 'regular' });
  return `Bearer ${tokenCookieValue}`;
}

describe('POST /api/v1/questions/add (admin only)', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).post('/api/v1/questions/add').send(validQuestionPayload);

    expect(res.statusCode).toBe(403);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('rejects a regular, non-admin user', async () => {
    const authHeader = await regularUserAuthHeader();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Authorization', authHeader)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(403);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('allows a valid admin token', async () => {
    const token = await adminToken();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Authorization', `Bearer ${token}`)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(201);
    expect(await Question.countDocuments()).toBe(1);
  });

  it('rejects an answer that is not one of the provided options', async () => {
    const token = await adminToken();
    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validQuestionPayload, answer: 'not-an-option' });

    expect(res.statusCode).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });
});

describe('Admin question management (list/get/update/delete)', () => {
  async function createQuestionDirectly(overrides = {}) {
    return Question.create({ ...validQuestionPayload, ...overrides });
  }

  describe('GET /api/v1/admin/questions', () => {
    it('rejects requests with no token', async () => {
      const res = await request(app).get('/api/v1/admin/questions');
      expect(res.statusCode).toBe(403);
    });

    it('returns full question detail, including the answer, for an admin', async () => {
      await createQuestionDirectly();
      const token = await adminToken();

      const res = await request(app).get('/api/v1/admin/questions').set('Authorization', `Bearer ${token}`);

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
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 for a question that does not exist', async () => {
      const token = await adminToken();
      const res = await request(app)
        .get('/api/v1/admin/questions/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });

    it('returns the full question for a valid id', async () => {
      const q = await createQuestionDirectly();
      const token = await adminToken();

      const res = await request(app)
        .get(`/api/v1/admin/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`);

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
      expect(res.statusCode).toBe(403);
    });

    it('updates a single field and persists it', async () => {
      const q = await createQuestionDirectly();
      const token = await adminToken();

      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ explanation: 'Updated explanation' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.explanation).toBe('Updated explanation');

      const stored = await Question.findById(q._id).lean();
      expect(stored.explanation).toBe('Updated explanation');
    });

    it('rejects an empty update body', async () => {
      const q = await createQuestionDirectly();
      const token = await adminToken();

      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('rejects changing the answer to something outside the current options', async () => {
      const q = await createQuestionDirectly();
      const token = await adminToken();

      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ answer: 'not-an-option' });

      expect(res.statusCode).toBe(400);
      const stored = await Question.findById(q._id).lean();
      expect(stored.answer).toBe(validQuestionPayload.answer);
    });

    it('allows changing options and answer together consistently', async () => {
      const q = await createQuestionDirectly();
      const token = await adminToken();

      const res = await request(app)
        .patch(`/api/v1/admin/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ options: ['x', 'y'], answer: 'y' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.answer).toBe('y');
    });
  });

  describe('DELETE /api/v1/admin/questions/:id', () => {
    it('rejects requests with no token', async () => {
      const q = await createQuestionDirectly();
      const res = await request(app).delete(`/api/v1/admin/questions/${q._id}`);
      expect(res.statusCode).toBe(403);
      expect(await Question.findById(q._id)).not.toBeNull();
    });

    it('returns 404 for a question that does not exist', async () => {
      const token = await adminToken();
      const res = await request(app)
        .delete('/api/v1/admin/questions/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });

    it('deletes the question for a valid admin request', async () => {
      const q = await createQuestionDirectly();
      const token = await adminToken();

      const res = await request(app)
        .delete(`/api/v1/admin/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(await Question.findById(q._id)).toBeNull();
    });
  });
});

describe('verifyAdmin: header-only, regardless of cookies present (regression)', () => {
  it('ignores a present regular-user session cookie with no Authorization header', async () => {
    const { cookieHeader } = await registerAndLogin('admincookie@example.com', { username: 'admincookie' });

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Cookie', cookieHeader)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(403);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('a valid admin Authorization header still works even when a regular-user cookie is also present', async () => {
    const { cookieHeader } = await registerAndLogin('adminandcookie@example.com', { username: 'adminandcookie' });
    const token = await adminToken();

    const res = await request(app)
      .post('/api/v1/questions/add')
      .set('Cookie', cookieHeader)
      .set('Authorization', `Bearer ${token}`)
      .send(validQuestionPayload);

    expect(res.statusCode).toBe(201);
    expect(await Question.countDocuments()).toBe(1);
  });
});
