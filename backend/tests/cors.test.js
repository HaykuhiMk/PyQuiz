// Login and GET /me return the CSRF token in the response body (Phase 4,
// for the cross-host frontend), so that body must never be readable by a
// page on any other origin. The browser enforces that only through CORS:
// these tests pin that the API reflects only allow-listed origins, never an
// arbitrary Origin header, never "*" (which with credentials would be the
// dangerous combination), and never a sibling subdomain.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.CLIENT_URI = 'https://pyquiz.picsartacademy.am';

const request = require('supertest');
const app = require('../app');

const DISALLOWED_ORIGINS = [
  'https://evil.example',
  'https://evil.picsartacademy.am', // sibling subdomain
  'https://pyquiz.picsartacademy.am.evil.example', // suffix trick
  'http://pyquiz.picsartacademy.am', // right host, wrong scheme
  'null', // sandboxed iframe / file:// origin
];

describe('CORS allow-list', () => {
  it.each(DISALLOWED_ORIGINS)('does not grant %s read access to /auth/me', async (origin) => {
    const res = await request(app).get('/api/v1/auth/me').set('Origin', origin);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each(DISALLOWED_ORIGINS)('rejects a credentialed preflight from %s', async (origin) => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never answers with a wildcard origin', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('reflects the configured frontend origin, with credentials, and varies on Origin', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Origin', 'https://pyquiz.picsartacademy.am');

    expect(res.headers['access-control-allow-origin']).toBe('https://pyquiz.picsartacademy.am');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers.vary).toMatch(/Origin/);
  });
});
