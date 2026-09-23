const Question = require('../models/questionModel');
const userRepository = require('../repositories/userRepository');
const userAnsweredQuestionRepository = require('../repositories/userAnsweredQuestionRepository');
const AppError = require('../core/AppError');

async function getTopicMastery(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const answeredIds = new Set(await userAnsweredQuestionRepository.findAnsweredIds(userId));
  const topicStatsMap = new Map(
    (user.topicStats || []).map((entry) => [entry.topic, entry])
  );

  const allQuestions = await Question.find().select('topics').lean();
  const topicTotals = new Map();

  for (const question of allQuestions) {
    for (const topic of question.topics || []) {
      topicTotals.set(topic, (topicTotals.get(topic) || 0) + 1);
    }
  }

  const answeredQuestions = await Question.find({
    _id: { $in: [...answeredIds] },
  })
    .select('topics')
    .lean();

  const topicAnswered = new Map();
  for (const question of answeredQuestions) {
    for (const topic of question.topics || []) {
      topicAnswered.set(topic, (topicAnswered.get(topic) || 0) + 1);
    }
  }

  const mastery = [...topicTotals.entries()]
    .map(([topic, total]) => {
      const answered = topicAnswered.get(topic) || 0;
      const stats = topicStatsMap.get(topic) || { correct: 0, attempted: 0 };
      const accuracy =
        stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0;
      const coverage = Math.round((answered / total) * 100);
      return {
        topic,
        total,
        answered,
        coverage,
        correct: stats.correct,
        attempted: stats.attempted,
        accuracy,
        level:
          coverage >= 80 && accuracy >= 70
            ? 'master'
            : coverage >= 50
              ? 'intermediate'
              : answered > 0
                ? 'beginner'
                : 'new',
      };
    })
    .sort((a, b) => b.coverage - a.coverage || a.topic.localeCompare(b.topic));

  const weakTopics = mastery
    .filter((item) => item.attempted >= 2 && item.accuracy < 60)
    .slice(0, 5);

  return { mastery, weakTopics };
}

module.exports = { getTopicMastery };
