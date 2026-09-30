const {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_REQUIREMENTS,
  AVATAR_MAX_DATA_URL_LENGTH,
  AVATAR_MAX_FILE_BYTES,
  AVATAR_TOO_LARGE_MESSAGE,
  DISTRACTOR_FEEDBACK_MAX_LENGTH,
} = require('../config/validationRules');

// The rules the frontend applies client-side, served from the same constants
// the server validates with (config/validationRules.js).
function getClientValidationRules() {
  return {
    password: {
      minLength: PASSWORD_MIN_LENGTH,
      pattern: PASSWORD_PATTERN,
      requirements: PASSWORD_REQUIREMENTS,
    },
    avatar: {
      maxDataUrlLength: AVATAR_MAX_DATA_URL_LENGTH,
      maxFileBytes: AVATAR_MAX_FILE_BYTES,
      tooLargeMessage: AVATAR_TOO_LARGE_MESSAGE,
    },
    distractor: {
      feedbackMaxLength: DISTRACTOR_FEEDBACK_MAX_LENGTH,
    },
  };
}

module.exports = { getClientValidationRules };
