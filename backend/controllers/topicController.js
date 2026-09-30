const { successResponse } = require('../core/apiResponse');
const topicService = require('../services/topicService');

function getTaxonomy(req, res) {
  return res.json(successResponse(topicService.getTaxonomy()));
}

module.exports = { getTaxonomy };
