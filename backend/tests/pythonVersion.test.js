// GET /api/v1/python-version serves the reference Python version for question
// answers from one constant (config/pythonVersion.js).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const { MINIMUM_VERSION, CHECKED_VERSIONS } = require('../config/pythonVersion');

describe('GET /api/v1/python-version', () => {
  it('is public and serves the version, the learner note and the author hint', async () => {
    const res = await request(app).get('/api/v1/python-version');
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      minimum: '3.9',
      checked: ['3.9', '3.14'],
      learnerNote: 'Answers assume Python 3.9 or newer, and are checked on Python 3.9 and 3.14.',
      authorHint: expect.stringContaining('Python 3.9 and every newer version'),
    });
  });

  it('builds the texts from the constants, so they cannot drift apart', () => {
    expect(CHECKED_VERSIONS[0]).toBe(MINIMUM_VERSION);
  });
});
