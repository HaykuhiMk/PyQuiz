const { successResponse } = require('../core/apiResponse');
const adminAuthService = require('../services/adminAuthService');
const {
  setAdminAuthCookies,
  clearAdminAuthCookies,
  authCookieName,
  computeCsrfToken,
} = require('../utils/authCookies');

async function login(req, res, next) {
  try {
    const { token, admin } = await adminAuthService.loginAdmin(req.body);

    // No token in the body any more (docs/AUDIT.md Phase 4, item 11): the
    // session lives only in the httpOnly admin cookie. The CSRF token is
    // returned for the same cross-host reason as the regular user login.
    const csrfToken = setAdminAuthCookies(res, token);

    return res.json(successResponse({ message: 'Login successful', admin, csrfToken }));
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res) {
  clearAdminAuthCookies(res);
  return res.json(successResponse({ message: 'Logged out successfully.' }));
}

async function me(req, res) {
  const csrfToken = computeCsrfToken(req.cookies[authCookieName('admin')]);
  return res.json(
    successResponse({ admin: { id: req.admin.id, username: req.admin.username }, csrfToken })
  );
}

module.exports = { login, logout, me };
