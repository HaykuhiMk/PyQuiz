const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { rateLimitsBypassed } = require('../../config/rateLimitBypass');
const rateLimitHandler = require('../../middleware/rateLimitHandler');
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
  skip: rateLimitsBypassed,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.userId ? `user:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip)}`),
  handler: rateLimitHandler('Too many quiz sessions started. Please try again later.'),
});

// Guests can play Classic/Blitz/Survival without an account (they just never
// accrue persisted points/stats), so none of these require authentication —
// verifyCsrfIfAuthenticated still protects logged-in sessions.
/**
 * @openapi
 * /quiz/sessions:
 *   post:
 *     tags: [Quiz]
 *     summary: Start a quiz session and get its first question
 *     description: >
 *       Guests allowed (no persisted points/stats). When the request carries the user session
 *       cookie, `X-CSRF-Token` is required.
 *       Limited to 60 new sessions per 15 minutes per user, 300 per guest IP.
 *     operationId: quizCreateSession
 *     security:
 *       - {}
 *       - userCookie: []
 *         csrfHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode: { $ref: '#/components/schemas/QuizMode' }
 *               topics:
 *                 type: array
 *                 maxItems: 150
 *                 default: []
 *                 items: { $ref: '#/components/schemas/Topic' }
 *               difficulty: { $ref: '#/components/schemas/Difficulty' }
 *               practiceMode:
 *                 type: boolean
 *                 default: false
 *                 description: Only honoured for classic mode.
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/CsrfForbidden' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/sessions',
  optionalAuthenticate,
  createSessionLimiter,
  verifyCsrfIfAuthenticated,
  validate(createSessionSchema),
  quizController.createSession
);
/**
 * @openapi
 * /quiz/sessions/{sessionId}/next:
 *   post:
 *     tags: [Quiz]
 *     summary: Advance to the next question
 *     description: >
 *       Guests allowed (no persisted points/stats). When the request carries the user session
 *       cookie, `X-CSRF-Token` is required.
 *       An unanswered Blitz question is resolved as a timeout.
 *     operationId: quizNextQuestion
 *     security:
 *       - {}
 *       - userCookie: []
 *         csrfHeader: []
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdPath'
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Session has ended, or the current question has not been answered yet.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       403: { $ref: '#/components/responses/CsrfForbidden' }
 *       404:
 *         description: Session not found (malformed token, unknown token, or owned by another user).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/sessions/:sessionId/next',
  optionalAuthenticate,
  verifyCsrfIfAuthenticated,
  quizController.nextQuestion
);
/**
 * @openapi
 * /quiz/sessions/{sessionId}/answer:
 *   post:
 *     tags: [Quiz]
 *     summary: Submit an answer to the current question
 *     description: >
 *       Guests allowed (no persisted points/stats). When the request carries the user session
 *       cookie, `X-CSRF-Token` is required.
 *     operationId: quizSubmitAnswer
 *     security:
 *       - {}
 *       - userCookie: []
 *         csrfHeader: []
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [questionId]
 *             properties:
 *               questionId: { $ref: '#/components/schemas/ObjectId' }
 *               selectedIndex:
 *                 type: integer
 *                 minimum: 0
 *                 nullable: true
 *                 description: Coerced to a number; null or omitted means no answer.
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Validation failed, session ended, no active/already-resolved question, or no attempts left.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       403: { $ref: '#/components/responses/CsrfForbidden' }
 *       404:
 *         description: Session not found (malformed token, unknown token, or owned by another user).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *       409:
 *         description: questionId does not match the session's current question.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.post(
  '/sessions/:sessionId/answer',
  optionalAuthenticate,
  verifyCsrfIfAuthenticated,
  validate(submitAnswerSchema),
  quizController.submitAnswer
);
/**
 * @openapi
 * /quiz/sessions/{sessionId}/reveal:
 *   post:
 *     tags: [Quiz]
 *     summary: Reveal the answer to an exhausted question
 *     description: >
 *       Guests allowed (no persisted points/stats). When the request carries the user session
 *       cookie, `X-CSRF-Token` is required.
 *     operationId: quizRevealAnswer
 *     security:
 *       - {}
 *       - userCookie: []
 *         csrfHeader: []
 *     parameters:
 *       - $ref: '#/components/parameters/SessionIdPath'
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Session ended, no exhausted question to reveal, or attempts remain.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       403: { $ref: '#/components/responses/CsrfForbidden' }
 *       404:
 *         description: Session not found (malformed token, unknown token, or owned by another user).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/sessions/:sessionId/reveal',
  optionalAuthenticate,
  verifyCsrfIfAuthenticated,
  quizController.revealAnswer
);

module.exports = router;
