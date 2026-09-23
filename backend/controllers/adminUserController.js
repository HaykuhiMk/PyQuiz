const { successResponse } = require('../core/apiResponse');
const adminUserService = require('../services/adminUserService');

async function list(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await adminUserService.listUsers({ page, limit });
    return res.json(successResponse(result.users, result.meta));
  } catch (error) {
    return next(error);
  }
}

async function setBanned(req, res, next) {
  try {
    const user = await adminUserService.setUserBanned(req.params.id, req.body.banned);
    return res.json(successResponse(user));
  } catch (error) {
    return next(error);
  }
}

module.exports = { list, setBanned };
