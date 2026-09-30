const crypto = require('crypto');
const AppError = require('../core/AppError');
const { authCookieName, computeCsrfToken } = require('../utils/authCookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// HMAC-bound CSRF check (docs/AUDIT.md Phase 4, item 12). The expected token
// is recomputed from the request's own httpOnly session cookie rather than
// compared against another cookie value — so a sibling subdomain of
// picsartacademy.am that can plant cookies of its own (which defeats a
// plain double-submit check) still can't produce a valid header without
// knowing this session's actual JWT. Combined with the __Host- cookie prefix
// in production (utils/authCookies.js), which stops a sibling subdomain from
// overwriting the session cookie itself.
function tokenMatches(authToken, headerToken) {
  if (typeof authToken !== 'string' || !authToken || typeof headerToken !== 'string' || !headerToken) {
    return false;
  }

  const expected = Buffer.from(computeCsrfToken(authToken), 'hex');
  const actual = Buffer.from(headerToken, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createCsrfCheck(scope) {
  return function verifyScopedCsrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    const authToken = req.cookies?.[authCookieName(scope)];
    if (!tokenMatches(authToken, req.headers['x-csrf-token'])) {
      return next(new AppError('Invalid or missing CSRF token', 403));
    }

    return next();
  };
}

const verifyCsrf = createCsrfCheck('user');

// Admin routes use the admin session cookie (a separate scope, see
// utils/authCookies.js), so their CSRF token is bound to that cookie instead.
const verifyAdminCsrf = createCsrfCheck('admin');

// For routes that must also allow guests (no auth cookie at all, so no CSRF
// cookie to check against): only enforce the check when the request
// actually carries the httpOnly auth cookie, i.e. came from a logged-in
// browser session. Guests skip the check entirely rather than being
// unconditionally rejected.
function verifyCsrfIfAuthenticated(req, res, next) {
  if (!req.cookies?.[authCookieName()]) {
    return next();
  }
  return verifyCsrf(req, res, next);
}

module.exports = verifyCsrf;
module.exports.verifyCsrfIfAuthenticated = verifyCsrfIfAuthenticated;
module.exports.verifyAdminCsrf = verifyAdminCsrf;
