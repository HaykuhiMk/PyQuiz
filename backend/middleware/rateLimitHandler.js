const AppError = require('../core/AppError');

// Every rate limiter answers through the central error handler, so a 429 has
// the same JSON shape as every other error ({ success: false, data: null,
// error: { message, details }, meta }) and the frontend can show its message.
// express-rate-limit calls this once a client is over its limit; the
// RateLimit-* headers have already been set by then.
function rateLimitHandler(message) {
  return (req, res, next, options) => next(new AppError(message, options.statusCode));
}

module.exports = rateLimitHandler;
