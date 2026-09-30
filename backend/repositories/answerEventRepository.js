const AnswerEvent = require('../models/answerEvent');

async function createEvent(payload) {
  return AnswerEvent.create(payload);
}

// Not yet called from any route — groundwork for future adaptive-difficulty
// features that need a per-user or per-question attempt history.
async function findByUser(userId, { limit = 50 } = {}) {
  return AnswerEvent.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

async function findByQuestion(questionId, { limit = 50 } = {}) {
  return AnswerEvent.find({ questionId }).sort({ createdAt: -1 }).limit(limit).lean();
}

async function deleteAllForUser(userId) {
  return AnswerEvent.deleteMany({ userId });
}

module.exports = { createEvent, findByUser, findByQuestion, deleteAllForUser };
