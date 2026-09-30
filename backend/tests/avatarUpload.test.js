// Avatar uploads (PATCH /api/v1/users/settings/profile): an oversized image
// must get the service's "Image is too large" error, not a bare 413 from the
// body parser's 100 kB default. The larger body limit applies to this route
// only.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const User = require('../models/user');
const { AVATAR_MAX_FILE_BYTES } = require('../config/validationRules');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

const dataUrl = (chars) => `data:image/png;base64,${'A'.repeat(chars)}`;

function uploadAvatar(session, avatar) {
  return request(app)
    .patch('/api/v1/users/settings/profile')
    .set('Cookie', session.cookieHeader)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ avatar });
}

describe('avatar upload body limit', () => {
  it('accepts a realistic photo well above the old 100 kB body limit', async () => {
    const session = await registerAndLogin('avatarok@example.com', { username: 'avatarok' });

    const res = await uploadAvatar(session, dataUrl(300_000));

    expect(res.statusCode).toBe(200);
    expect((await User.findOne({ email: 'avatarok@example.com' })).avatar).toHaveLength(300_000 + 22);
  });

  it('rejects an image over 500,000 characters with the "image too large" error, not a 413', async () => {
    const session = await registerAndLogin('avatarbig@example.com', { username: 'avatarbig' });

    const res = await uploadAvatar(session, dataUrl(600_000));

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/image is too large/i);
    expect((await User.findOne({ email: 'avatarbig@example.com' })).avatar).toBeFalsy();
  });

  it('still refuses bodies over the 1 MB route limit', async () => {
    const session = await registerAndLogin('avatarhuge@example.com', { username: 'avatarhuge' });
    const res = await uploadAvatar(session, dataUrl(1_200_000));
    expect(res.statusCode).toBe(413);
  });

  it('keeps the 100 kB default on every other route', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'bigbody', email: 'bigbody@example.com', password: 'Passw0rd!', padding: 'x'.repeat(200_000) });
    expect(res.statusCode).toBe(413);
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts a %s file of exactly the advertised maximum and rejects one byte more',
    async (mime) => {
      const session = await registerAndLogin(`edge${mime.split('/')[1]}@example.com`, { username: `edge${mime.split('/')[1]}` });
      const encode = (bytes) => `data:${mime};base64,${Buffer.alloc(bytes, 1).toString('base64')}`;

      const atLimit = await uploadAvatar(session, encode(AVATAR_MAX_FILE_BYTES));
      expect(atLimit.statusCode).toBe(200);

      const overLimit = await uploadAvatar(session, encode(AVATAR_MAX_FILE_BYTES + 1));
      expect(overLimit.statusCode).toBe(400);
      expect(overLimit.body.error.message).toBe('Image is too large. The maximum is 366 KB.');
    }
  );

  it('GET /validation-rules advertises the same avatar limits the server enforces', async () => {
    const res = await request(app).get('/api/v1/validation-rules');
    expect(res.body.data.avatar).toEqual({
      maxDataUrlLength: 500_000,
      maxFileBytes: AVATAR_MAX_FILE_BYTES,
      tooLargeMessage: 'Image is too large. The maximum is 366 KB.',
    });
  });
});
