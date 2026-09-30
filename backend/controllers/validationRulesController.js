const { successResponse } = require('../core/apiResponse');
const validationRulesService = require('../services/validationRulesService');

function getValidationRules(req, res) {
  return res.json(successResponse(validationRulesService.getClientValidationRules()));
}

module.exports = { getValidationRules };
