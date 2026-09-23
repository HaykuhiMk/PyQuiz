const { successResponse } = require('../core/apiResponse');
const adminAuthService = require('../services/adminAuthService');

async function login(req, res, next) {
  try {
    const payload = await adminAuthService.loginAdmin(req.body);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

module.exports = { login };
