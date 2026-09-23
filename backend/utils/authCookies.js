const crypto = require('crypto');

const COOKIE_MAX_AGE_MS = 3600000; // matches the 1h JWT expiry

function cookieOptions(extra = {}) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    ...extra,
  };
}

function setAuthCookies(res, token) {
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + COOKIE_MAX_AGE_MS);

  res.cookie('token', token, cookieOptions({ expires }));
  // Not httpOnly: the frontend must be able to read this value and echo it
  // back as the X-CSRF-Token header on state-changing requests.
  res.cookie('csrfToken', csrfToken, cookieOptions({ httpOnly: false, expires }));
  res.cookie('guestMode', '', cookieOptions({ expires: new Date(0) }));
}

function clearAuthCookies(res) {
  res.clearCookie('token', cookieOptions());
  res.clearCookie('csrfToken', cookieOptions({ httpOnly: false }));
}

module.exports = { setAuthCookies, clearAuthCookies };
