const express = require('express');
const request = require('supertest');
const { configureTrustProxy } = require('../config/trustProxy');

function buildTestApp() {
  const app = express();
  configureTrustProxy(app);
  app.get('/__ip', (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe('configureTrustProxy', () => {
  const originalValue = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = originalValue;
    }
  });

  it('resolves req.ip from X-Forwarded-For when TRUST_PROXY is set', async () => {
    process.env.TRUST_PROXY = '1';
    const app = buildTestApp();

    const res = await request(app).get('/__ip').set('X-Forwarded-For', '203.0.113.7');

    expect(res.body.ip).toBe('203.0.113.7');
  });

  it('ignores X-Forwarded-For when TRUST_PROXY is unset (Express default: trust nothing)', async () => {
    delete process.env.TRUST_PROXY;
    const app = buildTestApp();

    const res = await request(app).get('/__ip').set('X-Forwarded-For', '203.0.113.7');

    expect(res.body.ip).not.toBe('203.0.113.7');
  });
});
