// Spaces are valid password characters: no endpoint may trim a password.
// A password with leading/trailing spaces works exactly as typed, and the
// trimmed variant does NOT (which would pass if anything trimmed silently).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

jest.mock('../utils/emailUtils', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendContactEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { extractCookies } = require('./testUtils/authHelpers');
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

const SPACED = '  Passw0rd! spaced  ';

const login = (email, password) => request(app).post('/api/v1/auth/login').send({ email, password });

describe('passwords are never trimmed', () => {
  it('registration stores the password exactly as typed', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'spacey', email: 'spacey@example.com', password: SPACED });
    expect(reg.statusCode).toBe(201);

    expect((await login('spacey@example.com', SPACED)).statusCode).toBe(200);
    expect((await login('spacey@example.com', SPACED.trim())).statusCode).toBe(401);
  });

  it('password reset stores the new password exactly as typed', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'resetspace', email: 'resetspace@example.com', password: 'Passw0rd!' });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'resetspace@example.com' });
    const resetKey = new URL(sendPasswordResetEmail.mock.calls[0][1]).searchParams.get('resetKey');

    const reset = await request(app).post(`/api/v1/auth/reset-password/${resetKey}`).send({ password: SPACED });
    expect(reset.statusCode).toBe(200);

    expect((await login('resetspace@example.com', SPACED)).statusCode).toBe(200);
    expect((await login('resetspace@example.com', SPACED.trim())).statusCode).toBe(401);
  });

  it('change-password stores the new password exactly as typed', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'changespace', email: 'changespace@example.com', password: 'Passw0rd!' });
    const cookies = extractCookies(await login('changespace@example.com', 'Passw0rd!'));

    const change = await request(app)
      .patch('/api/v1/users/settings/password')
      .set('Cookie', `token=${cookies.token}; csrfToken=${cookies.csrfToken}`)
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ currentPassword: 'Passw0rd!', newPassword: SPACED });
    expect(change.statusCode).toBe(200);

    expect((await login('changespace@example.com', SPACED)).statusCode).toBe(200);
    expect((await login('changespace@example.com', SPACED.trim())).statusCode).toBe(401);
  });
});
