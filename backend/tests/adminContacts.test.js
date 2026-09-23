process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('./testUtils/db');
const { registerAndLogin } = require('./testUtils/authHelpers');
const User = require('../models/user');
const Contact = require('../models/contact');

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

describe('GET /api/v1/admin/contacts', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/v1/admin/contacts');
    expect(res.statusCode).toBe(403);
  });

  it('rejects a regular, non-admin user', async () => {
    const { tokenCookieValue } = await registerAndLogin('regular@example.com', { username: 'regular' });

    const res = await request(app)
      .get('/api/v1/admin/contacts')
      .set('Authorization', `Bearer ${tokenCookieValue}`);

    expect(res.statusCode).toBe(403);
  });

  it('returns an empty list when there are no submissions', async () => {
    const token = await adminToken();
    const res = await request(app).get('/api/v1/admin/contacts').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('lists submissions newest first', async () => {
    await Contact.create({ name: 'Alice', email: 'alice@example.com', message: 'First message' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await Contact.create({ name: 'Bob', email: 'bob@example.com', message: 'Second message' });

    const token = await adminToken();
    const res = await request(app).get('/api/v1/admin/contacts').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe('Bob');
    expect(res.body.data[1].name).toBe('Alice');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 3; i += 1) {
      await Contact.create({ name: `User ${i}`, email: `user${i}@example.com`, message: 'hi' });
    }
    const token = await adminToken();

    const page1 = await request(app)
      .get('/api/v1/admin/contacts?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    const page2 = await request(app)
      .get('/api/v1/admin/contacts?page=2&limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(page1.body.data).toHaveLength(2);
    expect(page2.body.data).toHaveLength(1);
    expect(page1.body.meta.total).toBe(3);
    expect(page1.body.meta.hasNextPage).toBe(true);
    expect(page2.body.meta.hasNextPage).toBe(false);
  });

  it('submissions created via the honeypot path never appear in the admin list', async () => {
    await request(app).post('/api/v1/contact').send({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'spam',
      website: 'http://spam.example',
    });

    const token = await adminToken();
    const res = await request(app).get('/api/v1/admin/contacts').set('Authorization', `Bearer ${token}`);

    expect(res.body.data).toEqual([]);
  });
});
