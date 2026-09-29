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
  checkAnswerSchema,
} = require('../../validators/questionValidators');

const router = express.Router();

router.get('/topics', cacheMiddleware('questions:topics', 300), questionController.getTopics);
// Study mode requires login (Phase 2 decision, docs/AUDIT.md item 4): it
// shows full answers/explanations, and unauthenticated access was also a
// way to look up today's Daily Challenge answers before the exclusion added
// alongside this.
router.get(
  '/study',
  authenticateToken,
  validate(questionFilterSchema, 'query'),
  questionController.getStudyQuestions
);
router.get('/random', validate(randomQuestionFilterSchema, 'query'), questionController.getRandomQuestion);
router.get('/', validate(questionFilterSchema, 'query'), questionController.getAllQuestions);
router.post('/add', verifyAdmin, verifyAdminCsrf, validate(addQuestionSchema), questionController.addQuestion);
router.post('/:id/check', validate(checkAnswerSchema), questionController.checkAnswer);

module.exports = router;
