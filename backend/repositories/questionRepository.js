const Question = require('../models/questionModel');

async function findDistinctTopics() {
  return Question.distinct('topics');
}

async function countQuestions(query) {
  return Question.countDocuments(query);
}

async function findQuestion(query, skip) {
  return Question.findOne(query).skip(skip);
}

async function findQuestionById(id) {
  return Question.findById(id).lean();
}

async function findQuestions(query) {
  return Question.find(query);
}

async function findQuestionsPaginated(query, { page, limit }) {
  const skip = (page - 1) * limit;
  return Question.find(query).sort({ _id: 1 }).skip(skip).limit(limit).lean();
}

async function findRandomQuestion(query) {
  const [question] = await Question.aggregate([
    { $match: query },
    { $sample: { size: 1 } },
  ]);

  return question || null;
}

async function createQuestion(payload) {
  return Question.create(payload);
}

async function updateQuestionById(id, payload) {
  return Question.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
}

async function deleteQuestionById(id) {
  return Question.findByIdAndDelete(id);
}

module.exports = {
  findDistinctTopics,
  countQuestions,
  findQuestion,
  findQuestionById,
  findQuestions,
  findQuestionsPaginated,
  findRandomQuestion,
  createQuestion,
  updateQuestionById,
  deleteQuestionById,
};
