const { successResponse } = require('../core/apiResponse');
const questionService = require('../services/questionService');

async function list(req, res, next) {
  try {
    const { topics, difficulty, page, limit } = req.query;
    const result = await questionService.getQuestionsForAdmin({ topics, difficulty, page, limit });
    return res.json(successResponse(result.questions, result.meta));
  } catch (error) {
    return next(error);
  }
}

async function getOne(req, res, next) {
  try {
    const question = await questionService.getQuestionByIdForAdmin(req.params.id);
    return res.json(successResponse(question));
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const question = await questionService.updateQuestion(req.params.id, req.body);
    return res.json(successResponse(question));
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    await questionService.deleteQuestion(req.params.id);
    return res.json(successResponse({ message: 'Question deleted successfully.' }));
  } catch (error) {
    return next(error);
  }
}

module.exports = { list, getOne, update, remove };
