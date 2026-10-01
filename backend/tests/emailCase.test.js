// Emails are case-insensitive identities (owner's decision A1, real-data
// audit): registration, login and password reset normalize them to trimmed
// lowercase, and scripts/lowercaseEmails.js converts stored emails that
// still have capital letters (3 accounts in production).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
jest.mock('../utils/emailUtils', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendContactEmail: jest.fn().mockResolvedValue(undefined),
}));

const path = require('path');
const { spawnSync } = require('child_process');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const db = require('./testUtils/db');
const User = require('../models/user');
const ResetPassword = require('../models/resetPassword');
const { sendPasswordResetEmail } = require('../utils/emailUtils');

const PASSWORD = 'Passw0rd!';
const SCRIPT = path.join(__dirname, '..', 'scripts', 'lowercaseEmails.js');

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

const login = (email, password = PASSWORD) => request(app).post('/api/v1/auth/login').send({ email, password });

describe('emails are normalized to lowercase', () => {
  it('registration stores the email trimmed and lowercased', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ username: 'mixed', email: '  Mixed.Case@Example.COM ', password: PASSWORD });
    expect(res.statusCode).toBe(201);
    expect((await User.collection.findOne({ usernameLower: 'mixed' })).email).toBe('mixed.case@example.com');
  });

  it('login accepts the email in any case', async () => {
    await request(app).post('/api/v1/auth/register').send({ username: 'anycase', email: 'any@example.com', password: PASSWORD });
    for (const typed of ['any@example.com', 'ANY@Example.com', ' Any@EXAMPLE.com ']) {
      expect((await login(typed)).statusCode).toBe(200);
    }
  });

  it('refuses a second account whose email differs only in case', async () => {
    await request(app).post('/api/v1/auth/register').send({ username: 'first', email: 'same@example.com', password: PASSWORD });
    const res = await request(app).post('/api/v1/auth/register').send({ username: 'second', email: 'SAME@example.com', password: PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toBe('Email already exists.');
    expect(await User.countDocuments()).toBe(1);
  });

  it('a password reset requested in another case finds the account and stores a lowercase email', async () => {
    await request(app).post('/api/v1/auth/register').send({ username: 'resetter', email: 'reset@example.com', password: PASSWORD });
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'Reset@Example.com' });
    expect(res.statusCode).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect((await ResetPassword.collection.findOne({})).email).toBe('reset@example.com');
  });
});

describe('scripts/lowercaseEmails.js', () => {
  const uri = () => {
    const { host, port, name } = mongoose.connection;
    return `mongodb://${host}:${port}/${name}`;
  };
  const run = (args, input = '') => {
    const res = spawnSync(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:1/must-not-be-used', MONGO_URI: '' },
      input,
      encoding: 'utf8',
      timeout: 60000,
    });
    return { code: res.status, out: `${res.stdout}${res.stderr}` };
  };
  // Native inserts: stored before the change, so the model's lowercase
  // setter never saw them.
  async function insertLegacy(extra = []) {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const docs = [
      { username: 'Legacy', usernameLower: 'legacy', email: 'Legacy.User@Example.com', password: hash, role: 'user', tokenVersion: 0 },
      { username: 'plain', usernameLower: 'plain', email: 'plain@example.com', password: hash, role: 'user', tokenVersion: 0 },
      ...extra.map((e, i) => ({ username: `x${i}`, usernameLower: `x${i}`, email: e, password: hash, role: 'user', tokenVersion: 0 })),
    ];
    const { insertedIds } = await User.collection.insertMany(docs);
    return Object.values(insertedIds).map(String);
  }

  it('refuses without --uri', () => {
    const res = run([]);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/pass the connection string with --uri/);
  });

  it('a stored mixed-case email blocks login until the script has run; then any case logs in', async () => {
    const [legacyId] = await insertLegacy();
    expect((await login('legacy.user@example.com')).statusCode).toBe(401);

    const dry = run(['--uri', uri()]);
    expect(dry.code).toBe(0);
    expect(dry.out).toMatch(/^Target host: mongodb:\/\/(127\.0\.0\.1|localhost):\d+\nDatabase: {4}\S+\nUsers: {7}2\n/);
    expect(dry.out).toContain(`Emails to lowercase: 1 account(s) (ids): ${legacyId}`);
    expect(dry.out).not.toMatch(/@/); // ids only, never an address
    expect((await User.collection.findOne({ usernameLower: 'legacy' })).email).toBe('Legacy.User@Example.com');

    const wrong = run(['--uri', uri(), '--apply'], 'pyquiz\n');
    expect(wrong.code).toBe(1);
    expect(wrong.out).toMatch(/Nothing was changed/);

    const applied = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(applied.code).toBe(0);
    expect(applied.out).toMatch(/Lowercased 1 account email\(s\)/);
    expect((await User.collection.findOne({ usernameLower: 'legacy' })).email).toBe('legacy.user@example.com');
    expect((await login('Legacy.User@Example.com')).statusCode).toBe(200);

    const again = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/Emails to lowercase: 0 account\(s\)/);
    expect(again.out).toMatch(/Nothing to change/);
  });

  it('refuses before any write if lowercasing would make two accounts share an email', async () => {
    const ids = await insertLegacy(['PLAIN@example.com']);
    const res = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/Refusing: lowercasing would make accounts share an email/);
    expect(res.out).toContain(`${ids[1]}, ${ids[2]}`);
    expect((await User.collection.findOne({ usernameLower: 'legacy' })).email).toBe('Legacy.User@Example.com');
  });
});
