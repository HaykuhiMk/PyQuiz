const { successResponse } = require('../core/apiResponse');
const pythonVersionService = require('../services/pythonVersionService');

function getPythonVersion(req, res) {
  return res.json(successResponse(pythonVersionService.getPythonVersion()));
}

module.exports = { getPythonVersion };
