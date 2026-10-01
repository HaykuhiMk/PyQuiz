const express = require('express');
const questionController = require('../../controllers/questionController');
const validate = require('../../middleware/validate');
const cacheMiddleware = require('../../middleware/cache');
const verifyAdmin = require('../../middleware/verifyAdmin');
const { verifyAdminCsrf } = require('../../middleware/csrf');
const authenticateToken = require('../../middleware/authenticateToken');
const {
  addQuestionSchema,
  questionFilterSchema,
  randomQuestionFilterSchema,
} = require('../../validators/questionValidators');

const router = express.Router();

/**
 * @openapi
 * /questions/topics:
 *   get:
 *     tags: [Questions]
 *     summary: List topics that have at least one question
 *     description: Public. Cached in Redis for 300s when Redis is configured.
 *     operationId: questionsGetTopics
 *     security: []
 *     responses:
 *       200:
 *         description: Topics with at least one question, as { id, name }, sorted by name.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/TopicEntry' } }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/topics', cacheMiddleware('questions:topics', 300), questionController.getTopics);
// Public, takes no input: aggregate counts only (About page).
/**
 * @openapi
 * /questions/stats:
 *   get:
 *     tags: [Questions]
 *     summary: Public aggregate question counts (About page)
 *     description: Public. Cached in Redis for 300s when Redis is configured.
 *     operationId: questionsGetStats
 *     security: []
 *     responses:
 *       200:
 *         description: Counts.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         totalQuestions: { type: integer }
 *                         topicCount: { type: integer }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/stats', cacheMiddleware('questions:stats', 300), questionController.getPublicStats);
// Study mode requires login (Phase 2 decision, docs/AUDIT.md item 4): it
// shows full answers/explanations, and unauthenticated access was also a
// way to look up today's Daily Challenge answers before the exclusion added
// alongside this.
/**
 * @openapi
 * /questions/study:
 *   get:
 *     tags: [Questions]
 *     summary: Study mode - questions with answers and explanations
 *     description: Requires login. Excludes today's Daily Challenge questions.
 *     operationId: questionsGetStudy
 *     security:
 *       - userCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/DifficultyQuery'
 *       - $ref: '#/components/parameters/TopicsQuery'
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: A page of study questions.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedList' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get(
  '/study',
  authenticateToken,
  validate(questionFilterSchema, 'query'),
  questionController.getStudyQuestions
);
/**
 * @openapi
 * /questions/random:
 *   get:
 *     tags: [Questions]
 *     summary: Get one random question (answer stripped)
 *     description: >
 *       Public. When no question matches, `data` is
 *       `{ noMoreQuestions: true, message, totalAnswered }` instead of a question.
 *     operationId: questionsGetRandom
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/DifficultyQuery'
 *       - $ref: '#/components/parameters/TopicsQuery'
 *       - name: excludeIds
 *         in: query
 *         required: false
 *         description: Comma-separated question ObjectIds to exclude (at most 500).
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           maxItems: 500
 *           items: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: A sanitized question, or the no-more-questions marker.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/random', validate(randomQuestionFilterSchema, 'query'), questionController.getRandomQuestion);
/**
 * @openapi
 * /questions:
 *   get:
 *     tags: [Questions]
 *     summary: List questions (answers and explanations stripped)
 *     description: Public.
 *     operationId: questionsList
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/DifficultyQuery'
 *       - $ref: '#/components/parameters/TopicsQuery'
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: A page of sanitized questions.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedList' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/', validate(questionFilterSchema, 'query'), questionController.getAllQuestions);
/**
 * @openapi
 * /questions/add:
 *   post:
 *     tags: [Questions, Admin]
 *     summary: Add a question (admin only)
 *     operationId: questionsAdd
 *     security:
 *       - adminCookie: []
 *         csrfHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NewQuestion' }
 *     responses:
 *       201:
 *         description: Question added.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminForbidden' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/add', verifyAdmin, verifyAdminCsrf, validate(addQuestionSchema), questionController.addQuestion);

module.exports = router;
