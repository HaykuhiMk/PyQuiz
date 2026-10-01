// The Python version the question answers assume (owner's decision, Stage 3
// review). The single definition: GET /api/v1/python-version serves it to
// the pages that show it, and scripts/verifyQuestions.js checks every seed
// question on the CHECKED_VERSIONS listed here.
const MINIMUM_VERSION = '3.9';
const CHECKED_VERSIONS = ['3.9', '3.14'];

// Shown to learners on the quiz, Study, Daily Challenge and About pages.
const LEARNER_NOTE = `Answers assume Python ${MINIMUM_VERSION} or newer, and are checked on Python ${CHECKED_VERSIONS.join(' and ')}.`;

// Shown to authors in the admin question forms.
const AUTHOR_HINT =
  `The answer must be the same on Python ${MINIMUM_VERSION} and every newer version. ` +
  "Don't rely on version-specific error messages or on CPython caching objects (small integers, equal strings).";

module.exports = { MINIMUM_VERSION, CHECKED_VERSIONS, LEARNER_NOTE, AUTHOR_HINT };
