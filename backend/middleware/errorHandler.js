const { errorResponse } = require('../core/apiResponse');
const logger = require('../config/logger');

function notFoundHandler(req, res) {
  return res.status(404).json(errorResponse('Route not found'));
}

// Maps an error to what the client is told. AppErrors and body-parser's
// 4xx errors (e.g. malformed JSON) carry messages meant for the client; a
// malformed MongoDB id is a bad request; anything else is unexpected, so
// its internal message stays in the logs and the client gets a generic one.
function toClientError(err) {
  if (err.name === 'CastError') {
    return { statusCode: 400, message: 'Invalid identifier.', details: null };
  }

  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) {
    return { statusCode, message: 'Internal server error.', details: null };
  }

  return { statusCode, message: err.message || 'Request failed.', details: err.details || null };
}

function errorHandler(err, req, res, _next) {
  const { statusCode, message, details } = toClientError(err);

  logger.error(
    {
      path: logger.redactUrl(req.path),
      method: req.method,
      statusCode,
      error: err.message,
      details: err.details || null,
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
