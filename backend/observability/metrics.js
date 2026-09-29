const crypto = require('crypto');
const client = require('prom-client');

client.collectDefaultMetrics();

// In production, /metrics is gated behind a bearer token from env
// (docs/AUDIT.md Phase 4, item 15) — it exposes process/runtime internals
// that shouldn't be publicly readable. Left open outside production so
// local development and CI don't need a token just to check it works.
function requireMetricsToken(req, res, next) {
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const configuredToken = process.env.METRICS_TOKEN;
  const authHeader = req.headers.authorization || '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

  if (!configuredToken) {
    // Fail closed: no token configured in production means /metrics is
    // unreachable rather than silently public.
    return res.status(404).end();
  }

  const expected = Buffer.from(configuredToken);
  const provided = Buffer.from(providedToken);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(401).end();
  }

  return next();
}

function setupMetrics(app) {
  app.get('/metrics', requireMetricsToken, async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });
}

module.exports = {
  setupMetrics,
  requireMetricsToken,
};
