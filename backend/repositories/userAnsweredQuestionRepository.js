const UserAnsweredQuestion = require('../models/userAnsweredQuestion');

async function markAnswered(userId, questionId) {
  await UserAnsweredQuestion.updateOne(
    { userId, questionId },
    { $setOnInsert: { userId, questionId, answeredAt: new Date() } },
    { upsert: true }
  );
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
  findAnsweredIds,
  countAnswered,
  deleteAllForUser,
};
