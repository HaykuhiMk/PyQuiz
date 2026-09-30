const { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN, PASSWORD_REQUIREMENTS } = require('../config/validationRules');

// The rules the frontend applies client-side, served from the same constants
// the server validates with (config/validationRules.js).
function getClientValidationRules() {
  return {
    password: {
      minLength: PASSWORD_MIN_LENGTH,
      pattern: PASSWORD_PATTERN,
      requirements: PASSWORD_REQUIREMENTS,
    },
  };
}

module.exports = { getClientValidationRules };
