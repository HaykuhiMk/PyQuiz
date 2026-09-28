const AppError = require('../core/AppError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit-cookie CSRF check. The csrfToken cookie is readable by our
// own frontend JS (unlike the httpOnly auth cookie), so only a same-origin
// script can read it and echo it back as a header. A cross-site request
// forged against a cookie-authenticated route can't produce a matching
// header value, since it has no way to read the cookie itself.
function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new AppError('Invalid or missing CSRF token', 403));
  }

  return next();
}

// For routes that must also allow guests (no auth cookie at all, so no CSRF
// cookie to check against): only enforce the double-submit check when the
// request actually carries the httpOnly auth cookie, i.e. came from a
// logged-in browser session. Guests skip the check entirely rather than
// being unconditionally rejected.
function verifyCsrfIfAuthenticated(req, res, next) {
  if (!req.cookies?.token) {
    return next();
  }
  return verifyCsrf(req, res, next);
}

module.exports = verifyCsrf;
module.exports.verifyCsrfIfAuthenticated = verifyCsrfIfAuthenticated;
