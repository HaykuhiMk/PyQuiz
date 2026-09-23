const { successResponse } = require('../core/apiResponse');
const authService = require('../services/authService');
const { setAuthCookies, clearAuthCookies } = require('../utils/authCookies');

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

    setAuthCookies(res, token);

    return res.json(
      successResponse({
        message: 'Login successful',
        user,
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
  forgotPassword,
  resetPassword,
};
