const { successResponse } = require('../core/apiResponse');
const userService = require('../services/userService');
const topicMasteryService = require('../services/topicMasteryService');

async function me(req, res, next) {
  try {
    const payload = await userService.getUserProfile(req.user.userId);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function getProgress(req, res, next) {
  try {
    const payload = await userService.getUserProgress(req.user.userId);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function updateProgress(req, res, next) {
  try {
    const payload = await userService.updateUserProgress(req.user.userId, req.body);
    return res.json(successResponse({ message: 'Progress updated successfully.', ...payload }));
  } catch (error) {
    return next(error);
  }
}

async function getLeaderboard(req, res, next) {
  try {
    const leaderboard = await userService.getGlobalLeaderboard(req.query.limit);
    return res.json(successResponse(leaderboard));
  } catch (error) {
    return next(error);
  }
}

async function getTopicMastery(req, res, next) {
  try {
    const payload = await topicMasteryService.getTopicMastery(req.user.userId);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const payload = await userService.updateProfile(req.user.userId, req.body);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const payload = await userService.changePassword(req.user.userId, req.body);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const payload = await userService.deleteAccount(req.user.userId, req.body);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  me,
  getProgress,
  updateProgress,
  getLeaderboard,
  getTopicMastery,
  updateProfile,
  changePassword,
  deleteAccount,
};
