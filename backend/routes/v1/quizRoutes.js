const express = require('express');
const quizController = require('../../controllers/quizController');
const optionalAuthenticate = require('../../middleware/optionalAuth');
const { verifyCsrfIfAuthenticated } = require('../../middleware/csrf');
const validate = require('../../middleware/validate');
const { createSessionSchema, submitAnswerSchema } = require('../../validators/quizValidators');

const router = express.Router();

// Guests can play Classic/Blitz/Survival without an account (they just never
// accrue persisted points/stats), so none of these require authentication —
// verifyCsrfIfAuthenticated still protects logged-in sessions.
router.post(
  '/sessions',
  optionalAuthenticate,
  verifyCsrfIfAuthenticated,
  validate(createSessionSchema),
  quizController.createSession
);
router.post(
  '/sessions/:sessionId/next',
  optionalAuthenticate,
  verifyCsrfIfAuthenticated,
  quizController.nextQuestion
);
router.post(
  '/sessions/:sessionId/answer',
  optionalAuthenticate,
  verifyCsrfIfAuthenticated,
  validate(submitAnswerSchema),
  quizController.submitAnswer
);
router.post(
  '/sessions/:sessionId/reveal',
  optionalAuthenticate,
  verifyCsrfIfAuthenticated,
  quizController.revealAnswer
);

module.exports = router;
