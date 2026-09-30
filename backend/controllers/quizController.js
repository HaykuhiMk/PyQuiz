const { successResponse } = require('../core/apiResponse');
const quizSessionService = require('../services/quizSessionService');

async function createSession(req, res, next) {
  try {
    const payload = await quizSessionService.createSession(req.user, req.body);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function nextQuestion(req, res, next) {
  try {
    const payload = await quizSessionService.getNextQuestion(req.params.sessionId, req.user);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function submitAnswer(req, res, next) {
  try {
    const payload = await quizSessionService.submitAnswer(req.params.sessionId, req.user, req.body);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function revealAnswer(req, res, next) {
  try {
    const payload = await quizSessionService.revealAnswer(req.params.sessionId, req.user);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

module.exports = { createSession, nextQuestion, submitAnswer, revealAnswer };
