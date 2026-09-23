const { successResponse } = require('../core/apiResponse');
const contactService = require('../services/contactService');

async function list(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await contactService.getContactsForAdmin({ page, limit });
    return res.json(successResponse(result.contacts, result.meta));
  } catch (error) {
    return next(error);
  }
}

module.exports = { list };
