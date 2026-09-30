const express = require('express');
const challengeController = require('../../controllers/challengeController');
const authenticateToken = require('../../middleware/authenticateToken');
const verifyCsrf = require('../../middleware/csrf');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const router = express.Router();

const submitDailySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedIndex: z.number().int().min(0),
      })
    )
    .min(1),
});

/**
 * @openapi
 * /challenges/daily:
 *   get:
 *     tags: [Challenges]
 *     summary: Get today's Daily Challenge (answers stripped) and the user's status
 *     operationId: challengesGetDaily
 *     security:
 *       - userCookie: []
 *     responses:
 *       200:
 *         description: Today's challenge.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *       503:
 *         description: DAILY_CHALLENGE_SEED_SECRET is not configured and a new day's set must be generated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.get('/daily', authenticateToken, challengeController.getDaily);
/**
 * @openapi
 * /challenges/daily/submit:
 *   post:
 *     tags: [Challenges]
 *     summary: Submit answers for today's Daily Challenge (once per day)
 *     operationId: challengesSubmitDaily
 *     security:
 *       - userCookie: []
 *         csrfHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [questionId, selectedIndex]
 *                   properties:
 *                     questionId: { type: string, minLength: 1 }
 *                     selectedIndex: { type: integer, minimum: 0 }
 *     responses:
 *       200:
 *         description: Graded result.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Validation failed, or today's challenge was already completed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/CsrfForbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *       503:
 *         description: DAILY_CHALLENGE_SEED_SECRET is not configured and a new day's set must be generated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.post(
  '/daily/submit',
  authenticateToken,
  verifyCsrf,
  validate(submitDailySchema),
  challengeController.submitDaily
);

module.exports = router;
