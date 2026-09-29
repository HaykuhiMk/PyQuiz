const crypto = require('crypto');

const COOKIE_MAX_AGE_MS = 3600000; // matches the 1h JWT expiry

// __Host- prefixed cookies (docs/AUDIT.md Phase 4, item 12): the browser
// refuses to set one unless it has Secure, Path=/, and no Domain attribute
// — and refuses to accept one from any host but the exact one that set it,
// which is what actually stops a sibling subdomain of picsartacademy.am
// from shadowing this app's auth/CSRF cookies. Secure requires an actual
// HTTPS connection, which local development over plain http doesn't have
// (browsers reject __Host- cookies there outright), so the prefix and
// Secure are only applied when NODE_ENV is 'production' — checked per call,
// not cached. Local development keeps working over http with the plain,
// unprefixed names; production must be served over HTTPS or the browser
// will silently refuse to store these cookies at all.
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// Two independent session scopes (docs/AUDIT.md Phase 4, item 11): regular
// users and admins each get their own httpOnly session cookie and their
// own CSRF cookie, so an admin session is never carried by — or confused
// with — a regular user's cookie, and logging out of one doesn't touch the
// other.
const BASE_NAMES = {
  user: { auth: 'token', csrf: 'csrfToken' },
  admin: { auth: 'adminToken', csrf: 'adminCsrfToken' },
};

function withPrefix(name) {
  return isProduction() ? `__Host-${name}` : name;
}

function authCookieName(scope = 'user') {
  return withPrefix(BASE_NAMES[scope].auth);
}

function csrfCookieName(scope = 'user') {
  return withPrefix(BASE_NAMES[scope].csrf);
}

function cookieOptions(extra = {}) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'Lax',
    path: '/',
    ...extra,
  };
}

// Binds the CSRF token to this specific session's JWT instead of it being
// an independent random value (docs/AUDIT.md Phase 4, item 12): a forged
// request can't produce a valid header value without knowing the httpOnly
// session cookie's exact contents, which a sibling subdomain setting its
// own cookies has no way to read. Keyed by JWT_SECRET with a distinct label
// so this is a different derivation from the JWT's own signature.
function computeCsrfToken(authToken) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`csrf:${authToken}`).digest('hex');
}

function setSessionCookies(res, token, scope) {
  const csrfToken = computeCsrfToken(token);
  const expires = new Date(Date.now() + COOKIE_MAX_AGE_MS);

  res.cookie(authCookieName(scope), token, cookieOptions({ expires }));
  // Not httpOnly: when the frontend is served from the same host as the
  // API it can read this directly. When it isn't (the cookie is host-only),
  // the same value is returned in the login and /me response bodies.
  res.cookie(csrfCookieName(scope), csrfToken, cookieOptions({ httpOnly: false, expires }));
  return csrfToken;
}

function clearSessionCookies(res, scope) {
  res.clearCookie(authCookieName(scope), cookieOptions());
  res.clearCookie(csrfCookieName(scope), cookieOptions({ httpOnly: false }));
}

function setAuthCookies(res, token) {
  const csrfToken = setSessionCookies(res, token, 'user');
  res.cookie('guestMode', '', cookieOptions({ expires: new Date(0) }));
  return csrfToken;
}

function clearAuthCookies(res) {
  clearSessionCookies(res, 'user');
}

function setAdminAuthCookies(res, token) {
  return setSessionCookies(res, token, 'admin');
}

function clearAdminAuthCookies(res) {
  clearSessionCookies(res, 'admin');
}

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  setAdminAuthCookies,
  clearAdminAuthCookies,
  authCookieName,
  csrfCookieName,
  computeCsrfToken,
};
