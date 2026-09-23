const { successResponse } = require('../core/apiResponse');
const questionService = require('../services/questionService');
const studyService = require('../services/studyService');

async function getTopics(req, res, next) {
  try {
    const topics = await questionService.getTopics();
    return res.json(successResponse(topics));
  } catch (error) {
    return next(error);
  }
}

async function getAllQuestions(req, res, next) {
  try {
    const { topics, difficulty, page, limit } = req.query;
    const result = await questionService.getQuestionsByFilters({
      topics,
      difficulty,
      page,
      limit,
    });
    return res.json(successResponse(result.questions, result.meta));
  } catch (error) {
    return next(error);
  }
}

async function getRandomQuestion(req, res, next) {
  try {
    const { topics, difficulty, excludeIds } = req.query;
    const question = await questionService.getRandomQuestion({ topics, difficulty, excludeIds });
    return res.json(successResponse(question));
  } catch (error) {
    return next(error);
  }
}

async function addQuestion(req, res, next) {
  try {
    await questionService.addQuestion(req.body);
    return res.status(201).json(successResponse({ message: 'Question added successfully!' }));
  } catch (error) {
    return next(error);
  }
}

async function checkAnswer(req, res, next) {
  try {
    const { selectedIndex, reveal } = req.body;
    const result = await questionService.checkAnswer(req.params.id, { selectedIndex, reveal });
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

async function getStudyQuestions(req, res, next) {
  try {
    const { topics = [], difficulty, page, limit } = req.query;
    const result = await studyService.getStudyQuestions({
      topics,
      difficulty,
      page,
      limit,
    });
    return res.json(successResponse(result.questions, result.meta));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getTopics,
  getAllQuestions,
  getRandomQuestion,
  addQuestion,
  checkAnswer,
  getStudyQuestions,
};
