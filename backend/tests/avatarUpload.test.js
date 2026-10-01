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

// A PNG signature, then filler: `chars` base64 characters in all.
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
const dataUrl = (chars) => `data:image/png;base64,${PNG_HEAD}${'A'.repeat(chars - PNG_HEAD.length)}`;
const SIGNATURES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')],
};

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
      const encode = (bytes) => {
        const file = Buffer.alloc(bytes, 1);
        Buffer.from(SIGNATURES[mime]).copy(file);
        return `data:${mime};base64,${file.toString('base64')}`;
      };

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

describe('avatar format', () => {
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');

  it.each([
    ['a text file named .png', `data:image/png;base64,${Buffer.from('hello, not an image').toString('base64')}`],
    ['PNG bytes declared as JPEG', `data:image/jpeg;base64,${b64(SIGNATURES['image/png'])}`],
    ['an SVG', `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`],
    ['a GIF', `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`],
    ['a data URL that is not base64', 'data:image/png,%89PNG'],
    ['base64 with characters outside the alphabet', `data:image/png;base64,${b64(SIGNATURES['image/png'])}<script>`],
  ])('rejects %s and keeps the current photo', async (_, avatar) => {
    const session = await registerAndLogin('format@example.com', { username: 'format' });
    const good = dataUrl(1000);
    expect((await uploadAvatar(session, good)).statusCode).toBe(200);

    const res = await uploadAvatar(session, avatar);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toBe('Avatar must be a JPG, PNG or WebP image');
    expect((await User.findOne({ email: 'format@example.com' })).avatar).toBe(good);
  });

  it('removing the photo (null) still works', async () => {
    const session = await registerAndLogin('remove@example.com', { username: 'remove' });
    await uploadAvatar(session, dataUrl(1000));
    expect((await uploadAvatar(session, null)).statusCode).toBe(200);
    expect((await User.findOne({ email: 'remove@example.com' })).avatar).toBeFalsy();
  });
});
