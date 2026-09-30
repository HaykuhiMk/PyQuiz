// Phase 4 (docs/AUDIT.md item 15): /metrics is bearer-token protected and
// /api-docs is disabled in production unless ENABLE_API_DOCS=true. Each
// case loads a fresh app with NODE_ENV set before app.js is required, since
// Swagger is mounted at load time.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');

const ORIGINAL_ENV = { ...process.env };

function loadApp(env) {
  jest.resetModules();
  Object.assign(process.env, env);
  return require('../app');
}

afterEach(() => {
  for (const key of ['NODE_ENV', 'METRICS_TOKEN', 'ENABLE_API_DOCS']) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

describe('/metrics in production', () => {
  it('requires the configured bearer token', async () => {
    const app = loadApp({ NODE_ENV: 'production', METRICS_TOKEN: 'metrics-secret' });

    const missing = await request(app).get('/metrics');
    expect(missing.statusCode).toBe(401);
    expect(missing.body).toMatchObject({ success: false, data: null, error: { message: expect.any(String) } });
    expect((await request(app).get('/metrics').set('Authorization', 'Bearer wrong')).statusCode).toBe(401);

    const ok = await request(app).get('/metrics').set('Authorization', 'Bearer metrics-secret');
    expect(ok.statusCode).toBe(200);
    expect(ok.text).toMatch(/process_cpu/);
  });

  it('fails closed (404) when no METRICS_TOKEN is configured', async () => {
    delete process.env.METRICS_TOKEN;
    const app = loadApp({ NODE_ENV: 'production' });
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ success: false, data: null, error: { message: 'Route not found' } });
  });

  it('stays open outside production', async () => {
    const app = loadApp({ NODE_ENV: 'test' });
    expect((await request(app).get('/metrics')).statusCode).toBe(200);
  });
});

describe('/api-docs in production', () => {
  it('is not served by default', async () => {
    delete process.env.ENABLE_API_DOCS;
    const app = loadApp({ NODE_ENV: 'production' });
    expect((await request(app).get('/api-docs/')).statusCode).toBe(404);
  });

  it('is served when ENABLE_API_DOCS=true', async () => {
    const app = loadApp({ NODE_ENV: 'production', ENABLE_API_DOCS: 'true' });
    expect((await request(app).get('/api-docs/')).statusCode).toBe(200);
  });
});

describe('Helmet Content-Security-Policy', () => {
  it('allows no inline scripts on the API', async () => {
    const app = loadApp({ NODE_ENV: 'test' });
    const csp = (await request(app).get('/')).headers['content-security-policy'];
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src '));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toMatch(/unsafe-inline/);
  });
});
