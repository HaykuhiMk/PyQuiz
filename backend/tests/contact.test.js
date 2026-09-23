process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

jest.mock('../utils/emailUtils', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendContactEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const Contact = require('../models/contact');
const { sendContactEmail } = require('../utils/emailUtils');

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

describe('POST /api/v1/contact', () => {
  it('accepts a valid submission, persists it, and emails it', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Tester',
      email: 'jane@example.com',
      message: 'Hello there',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.message).toMatch(/message sent successfully/i);
    expect(await Contact.countDocuments()).toBe(1);
    expect(sendContactEmail).toHaveBeenCalledWith('Jane Tester', 'jane@example.com', 'Hello there');
  });

  it('rejects missing required fields with a clear message', async () => {
    const res = await request(app).post('/api/v1/contact').send({ name: 'QA' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/please provide all required fields/i);
    expect(await Contact.countDocuments()).toBe(0);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it('rejects an invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .send({ name: 'QA', email: 'not-an-email', message: 'hello' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/valid email/i);
    expect(await Contact.countDocuments()).toBe(0);
  });

  it('rejects an overly long message', async () => {
    const res = await request(app)
      .post('/api/v1/contact')
      .send({ name: 'QA', email: 'qa@example.com', message: 'a'.repeat(5001) });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/too long/i);
  });

  it('honeypot short-circuits to success even when other fields are garbage/invalid, with no persistence or email', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: '',
      email: 'not-an-email',
      website: 'http://spam.example',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.message).toMatch(/message sent successfully/i);
    expect(await Contact.countDocuments()).toBe(0);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });
});
