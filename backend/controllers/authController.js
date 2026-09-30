const { successResponse } = require('../core/apiResponse');
const authService = require('../services/authService');
const {
  setAuthCookies,
  clearAuthCookies,
  authCookieName,
  computeCsrfToken,
} = require('../utils/authCookies');

async function register(req, res, next) {
  try {
    await authService.registerUser(req.body);
    return res
      .status(201)
      .json(successResponse({ message: 'User registered successfully!' }));
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { token, user } = await authService.loginUser(req.body);

    // The CSRF token is also returned in the body: the csrfToken cookie is
    // host-only (and __Host- prefixed in production), so a frontend served
    // from a different host than this API can't read it from document.cookie.
    const csrfToken = setAuthCookies(res, token);

    return res.json(
      successResponse({
        message: 'Login successful',
        user,
        csrfToken,
      })
    );
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res) {
  clearAuthCookies(res);
  return res.json(successResponse({ message: 'Logged out successfully.' }));
}

async function me(req, res, next) {
  try {
    const user = await authService.getSessionUser(req.user.userId || req.user.id);
    // authenticateToken only lets a request through with a valid session
    // cookie, so this is always bound to that real session.
    const csrfToken = computeCsrfToken(req.cookies[authCookieName()]);
    return res.json(successResponse({ user, csrfToken }));
  } catch (error) {
    return next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const payload = await authService.requestPasswordReset(req.body.email);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const payload = await authService.resetPassword(req.params.resetKey, req.body.password);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
};
