const Question = require('../models/questionModel');
const AnswerEvent = require('../models/answerEvent');
const userRepository = require('../repositories/userRepository');
const userAnsweredQuestionRepository = require('../repositories/userAnsweredQuestionRepository');
const AppError = require('../core/AppError');
const {
  MASTER_COVERAGE_THRESHOLD,
  MASTER_ACCURACY_THRESHOLD,
  INTERMEDIATE_COVERAGE_THRESHOLD,
  WEAK_TOPIC_MIN_ATTEMPTS,
  WEAK_TOPIC_ACCURACY_THRESHOLD,
  WEAK_TOPIC_MAX_COUNT,
} = require('../config/masteryConfig');

// Coverage (`answered`/`total`, per topic) and accuracy (`correct`/
// `attempted`, per topic) are both computed live from source-of-truth
// collections on every call, never from a stored/incremented counter on the
// User document:
//   - coverage comes from UserAnsweredQuestion joined against the current
//     Question collection, so a deleted question drops out of both the
//     numerator and denominator automatically (it can never push coverage
//     above 100%), and a retagged question's topics are always current.
//   - accuracy comes from AnswerEvent (one document per attempt), which
//     only exists from the Phase 1 deployment onward — there is no
//     attempt-level accuracy history before that point.
// This was a deliberate choice over maintaining a stored per-topic counter
// (User.topicStats, removed in Phase 3): a live-derived view can't drift out
// of sync with deletions/retagging the way an incrementally-updated counter
// did (docs/AUDIT.md items 6/7, and the topicStats push bug found in the
// Phase 1 follow-ups) — see docs/AUDIT.md's Phase 3 addendum.
async function getTopicMastery(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const [allQuestions, answeredIds, answerEvents] = await Promise.all([
    Question.find().select('topics').lean(),
    userAnsweredQuestionRepository.findAnsweredIds(userId),
    AnswerEvent.find({ userId }).select('questionId correct').lean(),
  ]);

  const answeredSet = new Set(answeredIds.map(String));

  const topicTotals = new Map();
  const topicAnswered = new Map();
  const questionTopicsById = new Map();
  for (const question of allQuestions) {
    const topics = question.topics || [];
    questionTopicsById.set(String(question._id), topics);
    for (const topic of topics) {
      topicTotals.set(topic, (topicTotals.get(topic) || 0) + 1);
      if (answeredSet.has(String(question._id))) {
        topicAnswered.set(topic, (topicAnswered.get(topic) || 0) + 1);
      }
    }
  }

  const topicAttempted = new Map();
  const topicCorrect = new Map();
  for (const event of answerEvents) {
    const topics = questionTopicsById.get(String(event.questionId)) || [];
    for (const topic of topics) {
      topicAttempted.set(topic, (topicAttempted.get(topic) || 0) + 1);
      if (event.correct) {
        topicCorrect.set(topic, (topicCorrect.get(topic) || 0) + 1);
      }
    }
  }

  const mastery = [...topicTotals.entries()]
    .map(([topic, total]) => {
      const answered = topicAnswered.get(topic) || 0;
      const attempted = topicAttempted.get(topic) || 0;
      const correct = topicCorrect.get(topic) || 0;
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      const coverage = Math.round((answered / total) * 100);
      return {
        topic,
        total,
        answered,
        coverage,
        correct,
        attempted,
        accuracy,
        level:
          coverage >= MASTER_COVERAGE_THRESHOLD && accuracy >= MASTER_ACCURACY_THRESHOLD
            ? 'master'
            : coverage >= INTERMEDIATE_COVERAGE_THRESHOLD
              ? 'intermediate'
              : answered > 0
                ? 'beginner'
                : 'new',
      };
    })
    .sort((a, b) => b.coverage - a.coverage || a.topic.localeCompare(b.topic));

  const weakTopics = mastery
    .filter((item) => item.attempted >= WEAK_TOPIC_MIN_ATTEMPTS && item.accuracy < WEAK_TOPIC_ACCURACY_THRESHOLD)
    .slice(0, WEAK_TOPIC_MAX_COUNT);

  return { mastery, weakTopics };
}

module.exports = { getTopicMastery };
