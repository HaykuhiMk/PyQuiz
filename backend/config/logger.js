const pino = require('pino');

// Credentials never reach the logs: the auth cookie (JWT), the admin
// bearer token, the CSRF token and the cookies set on login.
const redact = {
  paths: [
    'req.headers.cookie',
    'req.headers.authorization',
    'req.headers["x-csrf-token"]',
    'res.headers["set-cookie"]',
  ],
  censor: '[redacted]',
};

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact,
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
});

// Password-reset keys travel in the URL path; keep them out of logged URLs.
function redactUrl(url = '') {
  return url.replace(/(\/reset-password\/)[^/?#]+/, '$1[redacted]');
}

module.exports = logger;
module.exports.redactUrl = redactUrl;
module.exports.redact = redact;
