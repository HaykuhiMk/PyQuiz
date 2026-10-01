const logger = require('./logger');

// BENCHMARK_DISABLE_RATE_LIMITS=true turns every rate limiter off so
// scripts/benchmark.js measures the endpoints rather than the limiter's 429s
// (the general limiter allows 1000 requests per user and per guest IP per
// 15 minutes, far below any useful benchmark). It is honoured only outside
// production and is re-checked on every request, so it cannot take effect in
// a process running with NODE_ENV=production.
function rateLimitsBypassed() {
  return process.env.BENCHMARK_DISABLE_RATE_LIMITS === 'true' && process.env.NODE_ENV !== 'production';
}

function warnAboutRateLimitBypass() {
  if (process.env.BENCHMARK_DISABLE_RATE_LIMITS !== 'true') return;
  if (process.env.NODE_ENV === 'production') {
    logger.error('BENCHMARK_DISABLE_RATE_LIMITS is set but ignored in production; rate limits stay on.');
  } else {
    logger.warn('BENCHMARK_DISABLE_RATE_LIMITS=true: all rate limiting is OFF. Use only for local benchmarking.');
  }
}

module.exports = { rateLimitsBypassed, warnAboutRateLimitBypass };
