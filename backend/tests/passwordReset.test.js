process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

jest.mock('../utils/emailUtils', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendContactEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const ResetPassword = require('../models/resetPassword');
const { sendPasswordResetEmail } = require('../utils/emailUtils');

const VALID_PASSWORD = 'Passw0rd!';
const NEW_PASSWORD = 'NewPassw0rd!';

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

describe('POST /api/v1/auth/forgot-password', () => {
  it('returns the generic message and sends no email for an unknown address', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.message).toMatch(/if this email exists/i);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('creates a reset key and emails it for a known address', async () => {
    await request(app).post('/api/v1/auth/register').send({
      username: 'resetter',
      email: 'resetter@example.com',
      password: VALID_PASSWORD,
    });

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'resetter@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.message).toMatch(/if this email exists/i);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    const [emailedTo, resetUrl] = sendPasswordResetEmail.mock.calls[0];
    expect(emailedTo).toBe('resetter@example.com');
    expect(resetUrl).toMatch(/reset_password\.html\?resetKey=[a-f0-9]{40}$/);

    const entry = await ResetPassword.findOne({ email: 'resetter@example.com' });
    expect(entry).not.toBeNull();
  });

  it('stores only the SHA-256 hash of the reset key, never the key itself (Phase 4)', async () => {
    await request(app).post('/api/v1/auth/register').send({
      username: 'hashcheck',
      email: 'hashcheck@example.com',
      password: 'Passw0rd!',
    });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'hashcheck@example.com' });

    const [, resetUrl] = sendPasswordResetEmail.mock.calls[0];
    const resetKey = new URL(resetUrl).searchParams.get('resetKey');
    const raw = await ResetPassword.collection.findOne({ email: 'hashcheck@example.com' });

    expect(raw.resetKeyHash).toBe(require('crypto').createHash('sha256').update(resetKey).digest('hex'));
    expect(JSON.stringify(raw)).not.toContain(resetKey);
    expect(raw.resetKey).toBeUndefined();
  });
});

describe('POST /api/v1/auth/reset-password/:resetKey', () => {
  it('rejects an unknown or expired reset key', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password/not-a-real-key')
      .send({ password: NEW_PASSWORD });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a weak new password', async () => {
    await request(app).post('/api/v1/auth/register').send({
      username: 'weakreset',
      email: 'weakreset@example.com',
      password: VALID_PASSWORD,
    });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'weakreset@example.com' });
    const { resetUrl } = { resetUrl: sendPasswordResetEmail.mock.calls[0][1] };
    const resetKey = new URL(resetUrl).searchParams.get('resetKey');

    const res = await request(app)
      .post(`/api/v1/auth/reset-password/${resetKey}`)
      .send({ password: 'short' });

    expect(res.statusCode).toBe(400);
  });

  it('resets the password, consumes the key, and lets the user log in with the new password', async () => {
    await request(app).post('/api/v1/auth/register').send({
      username: 'fullreset',
      email: 'fullreset@example.com',
      password: VALID_PASSWORD,
    });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'fullreset@example.com' });
    const resetUrl = sendPasswordResetEmail.mock.calls[0][1];
    const resetKey = new URL(resetUrl).searchParams.get('resetKey');

    const resetRes = await request(app)
      .post(`/api/v1/auth/reset-password/${resetKey}`)
      .send({ password: NEW_PASSWORD });

    expect(resetRes.statusCode).toBe(200);
    expect(await ResetPassword.findOne({ email: 'fullreset@example.com' })).toBeNull();

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'fullreset@example.com', password: VALID_PASSWORD });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'fullreset@example.com', password: NEW_PASSWORD });
    expect(newLogin.statusCode).toBe(200);

    // The key is single-use: reusing it should fail even with a fresh valid password.
    const reuse = await request(app)
      .post(`/api/v1/auth/reset-password/${resetKey}`)
      .send({ password: 'AnotherPassw0rd!' });
    expect(reuse.statusCode).toBe(400);
  });
});
