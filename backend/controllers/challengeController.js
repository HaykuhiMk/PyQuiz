const { successResponse } = require('../core/apiResponse');
const dailyChallengeService = require('../services/dailyChallengeService');

async function getDaily(req, res, next) {
  try {
    const userId = req.user?.userId || null;
    const payload = await dailyChallengeService.getDailyChallengeForUser(userId);
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

async function submitDaily(req, res, next) {
  try {
    const payload = await dailyChallengeService.submitDailyChallenge(
      req.user.userId,
      req.body.answers || []
    );
    return res.json(successResponse(payload));
  } catch (error) {
    return next(error);
  }
}

module.exports = { getDaily, submitDaily };
