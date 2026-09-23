const { errorResponse } = require('../core/apiResponse');
const logger = require('../config/logger');

function notFoundHandler(req, res) {
  return res.status(404).json(errorResponse('Route not found'));
}

function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error.';
  const details = err.details || null;

  logger.error(
    {
      path: req.path,
      method: req.method,
      statusCode,
      error: message,
      details,
      stack: err.stack,
    },
    'Request failed'
  );

  return res.status(statusCode).json(errorResponse(message, details));
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
