const UserAnsweredQuestion = require('../models/userAnsweredQuestion');

async function markAnswered(userId, questionId, { correct = false } = {}) {
  const update = { $setOnInsert: { userId, questionId, answeredAt: new Date() } };
  if (correct) {
    update.$set = { everCorrect: true };
  }
  await UserAnsweredQuestion.updateOne({ userId, questionId }, update, { upsert: true });
}

async function wasEverCorrect(userId, questionId) {
  const doc = await UserAnsweredQuestion.findOne({ userId, questionId }).select('everCorrect').lean();
  return Boolean(doc?.everCorrect);
}

async function findAnsweredIds(userId) {
  const docs = await UserAnsweredQuestion.find({ userId }).select('questionId').lean();
  return docs.map((doc) => doc.questionId);
}

async function countAnswered(userId) {
  return UserAnsweredQuestion.countDocuments({ userId });
}

async function deleteAllForUser(userId) {
  return UserAnsweredQuestion.deleteMany({ userId });
}

module.exports = {
  markAnswered,
  wasEverCorrect,
  findAnsweredIds,
  countAnswered,
  deleteAllForUser,
};
