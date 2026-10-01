const { MINIMUM_VERSION, CHECKED_VERSIONS, LEARNER_NOTE, AUTHOR_HINT } = require('../config/pythonVersion');

// The reference Python version for question answers (config/pythonVersion.js).
function getPythonVersion() {
  return {
    minimum: MINIMUM_VERSION,
    checked: [...CHECKED_VERSIONS],
    learnerNote: LEARNER_NOTE,
    authorHint: AUTHOR_HINT,
  };
}

module.exports = { getPythonVersion };
