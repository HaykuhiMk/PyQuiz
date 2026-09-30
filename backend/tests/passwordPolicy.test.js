// Registration, password reset and change-password share one password rule
// (validators/authValidators.js passwordRule). Previously change-password
// used a stricter character whitelist, so e.g. a password containing "#"
// could be registered but never set again through Settings.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin, DEFAULT_PASSWORD } = require('./testUtils/authHelpers');
const { registerSchema, resetPasswordSchema } = require('../validators/authValidators');
const { changePasswordSchema } = require('../validators/userValidators');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

const CANDIDATES = ['Passw0rd!#', 'Passw0rd#x', 'Pa55word!', 'Émile#2024x', 'short1!A', 'alllowercase1!', 'NoDigits!!', 'NoSpecial11'];

describe('one password rule everywhere a password is set', () => {
  it.each(CANDIDATES)('registration, reset and change-password agree on %s', (password) => {
    const register = registerSchema.safeParse({ username: 'someone', email: 'a@b.co', password }).success;
    const reset = resetPasswordSchema.safeParse({ password }).success;
    const change = changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: password }).success;

    expect(reset).toBe(register);
    expect(change).toBe(register);
  });

  it('lets a user change their password to one containing "#" (allowed at registration)', async () => {
    // Has a required special character (!) plus "#", which the old
    // change-password whitelist rejected.
    const withHash = 'Passw0rd!#';
    expect(registerSchema.safeParse({ username: 'someone', email: 'a@b.co', password: withHash }).success).toBe(true);
    const session = await registerAndLogin('hashpw@example.com', { username: 'hashpw' });

    const res = await request(app)
      .patch('/api/v1/users/settings/password')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: withHash });
    expect(res.statusCode).toBe(200);

    const login = await request(app).post('/api/v1/auth/login').send({ email: 'hashpw@example.com', password: withHash });
    expect(login.statusCode).toBe(200);
  });

  it('still rejects a weak new password', async () => {
    const session = await registerAndLogin('weakpw@example.com', { username: 'weakpw' });
    const res = await request(app)
      .patch('/api/v1/users/settings/password')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'password' });
    expect(res.statusCode).toBe(400);
  });
});
