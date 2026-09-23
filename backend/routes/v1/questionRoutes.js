const express = require('express');
const questionController = require('../../controllers/questionController');
const validate = require('../../middleware/validate');
const cacheMiddleware = require('../../middleware/cache');
const verifyAdmin = require('../../middleware/verifyAdmin');
const {
  addQuestionSchema,
  questionFilterSchema,
  randomQuestionFilterSchema,
  checkAnswerSchema,
} = require('../../validators/questionValidators');

const router = express.Router();

router.get('/topics', cacheMiddleware('questions:topics', 300), questionController.getTopics);
router.get('/study', validate(questionFilterSchema, 'query'), questionController.getStudyQuestions);
router.get('/random', validate(randomQuestionFilterSchema, 'query'), questionController.getRandomQuestion);
router.get('/', validate(questionFilterSchema, 'query'), questionController.getAllQuestions);
router.post('/add', verifyAdmin, validate(addQuestionSchema), questionController.addQuestion);
router.post('/:id/check', validate(checkAnswerSchema), questionController.checkAnswer);

module.exports = router;
