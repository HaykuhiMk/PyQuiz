// BENCHMARK_DISABLE_RATE_LIMITS (config/rateLimitBypass.js) exists only so
// scripts/benchmark.js can measure endpoints instead of 429s. It must never
// take effect in production. Uses the contact limiter (5 per 15 min) via the
// honeypot path, which touches no database.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');

const ORIGINAL = { NODE_ENV: process.env.NODE_ENV, FLAG: process.env.BENCHMARK_DISABLE_RATE_LIMITS };

function loadApp(env) {
  jest.resetModules();
  Object.assign(process.env, env);
  return require('../app');
}

async function statusesOfSixContactPosts(app) {
  const statuses = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await request(app).post('/api/v1/contact').send({ website: 'http://spam.example' });
    statuses.push(res.statusCode);
  }
  return statuses;
}

afterEach(() => {
  if (ORIGINAL.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL.NODE_ENV;
  if (ORIGINAL.FLAG === undefined) delete process.env.BENCHMARK_DISABLE_RATE_LIMITS;
  else process.env.BENCHMARK_DISABLE_RATE_LIMITS = ORIGINAL.FLAG;
});

describe('BENCHMARK_DISABLE_RATE_LIMITS', () => {
  it('limits normally when unset', async () => {
    delete process.env.BENCHMARK_DISABLE_RATE_LIMITS;
    const app = loadApp({ NODE_ENV: 'test' });
    expect((await statusesOfSixContactPosts(app))[5]).toBe(429);
  });

  it('turns rate limiting off outside production', async () => {
    const app = loadApp({ NODE_ENV: 'test', BENCHMARK_DISABLE_RATE_LIMITS: 'true' });
    expect(await statusesOfSixContactPosts(app)).toEqual([201, 201, 201, 201, 201, 201]);
  });

  it('is ignored in production', async () => {
    const app = loadApp({ NODE_ENV: 'production', BENCHMARK_DISABLE_RATE_LIMITS: 'true' });
    expect((await statusesOfSixContactPosts(app))[5]).toBe(429);
  });
});
