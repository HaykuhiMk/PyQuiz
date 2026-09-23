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

module.exports = verifyCsrf;
