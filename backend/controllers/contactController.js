const { successResponse } = require('../core/apiResponse');
const contactService = require('../services/contactService');

async function submitContact(req, res, next) {
  try {
    const payload = await contactService.submitContact(req.body);
    return res.status(201).json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

module.exports = { submitContact };
