const questionService = require('./questionService');

async function getStudyQuestions({ topics = [], difficulty, page = 1, limit = 10 }) {
  const result = await questionService.getQuestionsByFilters({
    topics,
    difficulty,
    page,
    limit: Math.min(limit, 25),
  });

  return {
    questions: result.questions.map((question) => ({
      _id: question._id,
      question: question.question,
      code: question.code || '',
      options: question.options,
      answer: question.answer,
      difficulty: question.difficulty,
      topics: question.topics,
      explanation: question.explanation,
    })),
    meta: result.meta,
  };
}

module.exports = { getStudyQuestions };
