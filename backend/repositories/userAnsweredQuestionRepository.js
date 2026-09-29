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

// Classic mode's server-side exclusion (docs/AUDIT.md Phase 3 addendum):
// only questions this user has ever gotten right on a first attempt are
// excluded from being served again — a wrong or later-attempt answer
// leaves the question eligible for a real Classic retry.
async function findEverCorrectIds(userId) {
  const docs = await UserAnsweredQuestion.find({ userId, everCorrect: true }).select('questionId').lean();
  return docs.map((doc) => doc.questionId);
}

async function countAnswered(userId) {
  return UserAnsweredQuestion.countDocuments({ userId });
}

async function deleteAllForUser(userId) {
  return UserAnsweredQuestion.deleteMany({ userId });
}

async function deleteAllForQuestion(questionId) {
  return UserAnsweredQuestion.deleteMany({ questionId: String(questionId) });
}

module.exports = {
  markAnswered,
  wasEverCorrect,
  findAnsweredIds,
  findEverCorrectIds,
  countAnswered,
  deleteAllForUser,
  deleteAllForQuestion,
};
