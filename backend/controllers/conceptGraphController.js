const { successResponse } = require('../core/apiResponse');
const conceptGraphService = require('../services/conceptGraphService');

function getGraph(req, res) {
  return res.json(successResponse(conceptGraphService.getGraph()));
}

module.exports = { getGraph };
