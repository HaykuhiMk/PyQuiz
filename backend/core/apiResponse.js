function successResponse(data, meta = {}) {
  return {
    success: true,
    data,
    error: null,
    meta,
  };
}

function errorResponse(message, details = null, meta = {}) {
  return {
    success: false,
    data: null,
    error: {
      message,
      details,
    },
    meta,
  };
}

module.exports = {
  successResponse,
  errorResponse,
};
