const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const quizController = require('../../controllers/quizController');
const optionalAuthenticate = require('../../middleware/optionalAuth');
const { verifyCsrfIfAuthenticated } = require('../../middleware/csrf');
const validate = require('../../middleware/validate');
const { createSessionSchema, submitAnswerSchema } = require('../../validators/quizValidators');

const router = express.Router();

// Scoped to this one route rather than defined in app.js: '/sessions' is a
// path prefix of the per-session action routes below it, so mounting a
// limiter on that shared prefix would also throttle answer/next/reveal
// calls during normal play. This limits how many sessions (guest or
// authenticated) one client can start, independent of how many questions
// they answer within them.
//
// Keyed by user ID for authenticated requests (each account gets its own
// budget, however many other people share its network) and by IP for
// guests — but a shared IP is a real, common case for guests specifically
// (a classroom or office behind one NAT/proxy IP), so the guest cap is set
// much higher than any one legitimate user should need, rather than by
// account like the authenticated cap. optionalAuthenticate runs before this
// middleware so req.user is already populated when the key is computed.
const createSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => (req.user?.userId ? 60 : 300),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.userId ? `user:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip)}`),
  message: { error: 'Too many quiz sessions started. Please try again later.' },
});

// Guests can play Classic/Blitz/Survival without an account (they just never
// accrue persisted points/stats), so none of these require authentication —
// verifyCsrfIfAuthenticated still protects logged-in sessions.
router.post(
  '/sessions',
  optionalAuthenticate,
  createSessionLimiter,
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
