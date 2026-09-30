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

// Phase 4 (docs/AUDIT.md item 13): the auto-reply was dropped entirely, so
// a submission sends exactly one email, and only to the admin address —
// never to the submitter-supplied address.
describe('sendContactEmail (no auto-reply)', () => {
  it('sends a single email to the admin and nothing to the submitter', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const originalEmailUser = process.env.EMAIL_USER;
    process.env.EMAIL_USER = 'admin@pyquiz.test';

    let realSendContactEmail;
    jest.isolateModules(() => {
      jest.doMock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));
      // The top of this file mocks emailUtils for the route tests; this
      // test needs the real implementation (with nodemailer mocked instead).
      ({ sendContactEmail: realSendContactEmail } = jest.requireActual('../utils/emailUtils'));
    });
    try {
      await realSendContactEmail('Mallory', 'victim@example.com', 'Buy cheap stuff at http://spam.example');
    } finally {
      process.env.EMAIL_USER = originalEmailUser;
    }

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('admin@pyquiz.test');
    expect(JSON.stringify(sendMail.mock.calls)).not.toMatch(/"to":"victim@example.com"/);
  });
});
