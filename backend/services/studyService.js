const questionService = require('./questionService');
const dailyChallengeService = require('./dailyChallengeService');

// Study mode requires login (Phase 2 decision) and excludes today's Daily
// Challenge questions until the next reset, so logging today's answers
// couldn't be trivially looked up as study cards. The exclusion is applied
// at the query level (not a post-filter) so pagination/meta.total stay
// accurate.
async function getStudyQuestions({ topics = [], difficulty, page = 1, limit = 10 }) {
  const dailyQuestions = await dailyChallengeService.getDailyQuestions();
  const excludeIds = dailyQuestions.map((q) => String(q._id));

  const result = await questionService.getQuestionsForStudy({
    topics,
    difficulty,
    excludeIds,
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
      primaryTopic: question.primaryTopic,
      secondaryTopics: question.secondaryTopics || [],
      explanation: question.explanation,
    })),
    meta: result.meta,
  };
}

module.exports = { getStudyQuestions };
