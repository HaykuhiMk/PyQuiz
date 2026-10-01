const { topicName } = require('../config/topicTaxonomy');
const Question = require('../models/questionModel');
const AnswerEvent = require('../models/answerEvent');
const userRepository = require('../repositories/userRepository');
const userAnsweredQuestionRepository = require('../repositories/userAnsweredQuestionRepository');
const AppError = require('../core/AppError');
const {
  MASTER_COVERAGE_THRESHOLD,
  MASTER_ACCURACY_THRESHOLD,
  INTERMEDIATE_COVERAGE_THRESHOLD,
  MIN_ACCURACY_EVENTS,
  MIN_QUESTIONS_FOR_MASTERY,
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
//
// Every question has exactly one primaryTopic (docs/AUDIT.md Phase 3
// taxonomy revision) — that's the only field used here. A topic with zero
// questions as anyone's primaryTopic (e.g. Numbers & Arithmetic today)
// never appears in the returned `mastery` array at all, which is exactly
// "hidden from the dashboard" — no separate filtering needed.
//
// `level` is one of: 'unavailable' (fewer than MIN_QUESTIONS_FOR_MASTERY
// questions exist in the topic at all — not a property of this user),
// 'new' (no coverage yet), 'measuring' (some coverage, but fewer than
// MIN_ACCURACY_EVENTS recorded attempts to trust the accuracy figure —
// see the note above about AnswerEvent's Phase-1-onward history),
// 'beginner', 'intermediate', or 'master'.
async function getTopicMastery(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const [allQuestions, answeredIds, answerEvents] = await Promise.all([
    Question.find().select('primaryTopic').lean(),
    userAnsweredQuestionRepository.findAnsweredIds(userId),
    AnswerEvent.find({ userId }).select('questionId correct').lean(),
  ]);

  const answeredSet = new Set(answeredIds.map(String));

  // Primary topic only (docs/AUDIT.md Phase 3 taxonomy revision,
  // requirement 4) — a question contributes to exactly one topic's mastery,
  // never its secondaryTopics (those exist only for quiz/study filtering).
  const topicTotals = new Map();
  const topicAnswered = new Map();
  const primaryTopicById = new Map();
  for (const question of allQuestions) {
    const topic = question.primaryTopic;
    primaryTopicById.set(String(question._id), topic);
    topicTotals.set(topic, (topicTotals.get(topic) || 0) + 1);
    if (answeredSet.has(String(question._id))) {
      topicAnswered.set(topic, (topicAnswered.get(topic) || 0) + 1);
    }
  }

  const topicAttempted = new Map();
  const topicCorrect = new Map();
  for (const event of answerEvents) {
    const topic = primaryTopicById.get(String(event.questionId));
    if (!topic) continue; // the question no longer exists — see the comment above
    topicAttempted.set(topic, (topicAttempted.get(topic) || 0) + 1);
    if (event.correct) {
      topicCorrect.set(topic, (topicCorrect.get(topic) || 0) + 1);
    }
  }

  const mastery = [...topicTotals.entries()]
    .map(([topic, total]) => {
      const answered = topicAnswered.get(topic) || 0;
      const attempted = topicAttempted.get(topic) || 0;
      const correct = topicCorrect.get(topic) || 0;
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      const coverage = Math.round((answered / total) * 100);

      // Order matters: a topic too small to classify at all comes first,
      // then "no coverage yet", then — since AnswerEvent (accuracy's source)
      // only exists from the Phase 1 deployment onward — a topic can have
      // real coverage history but too few recorded attempts to trust its
      // accuracy figure, which must not be silently classified as
      // beginner/intermediate/master using that unreliable number.
      let level;
      if (total < MIN_QUESTIONS_FOR_MASTERY) {
        level = 'unavailable'; // "Not enough questions yet" — a property of the topic itself
      } else if (answered === 0) {
        level = 'new';
      } else if (attempted < MIN_ACCURACY_EVENTS) {
        level = 'measuring'; // "Accuracy being measured" — has coverage, but too little AnswerEvent data
      } else if (coverage >= MASTER_COVERAGE_THRESHOLD && accuracy >= MASTER_ACCURACY_THRESHOLD) {
        level = 'master';
      } else if (coverage >= INTERMEDIATE_COVERAGE_THRESHOLD) {
        level = 'intermediate';
      } else {
        level = 'beginner';
      }

      return { topic, total, answered, coverage, correct, attempted, accuracy, level };
    })
    .sort((a, b) => b.coverage - a.coverage || topicName(a.topic).localeCompare(topicName(b.topic)));

  const weakTopics = mastery
    .filter(
      (item) =>
        item.level !== 'unavailable' &&
        item.level !== 'measuring' &&
        item.attempted >= WEAK_TOPIC_MIN_ATTEMPTS &&
        item.accuracy < WEAK_TOPIC_ACCURACY_THRESHOLD
    )
    .slice(0, WEAK_TOPIC_MAX_COUNT);

  return { mastery, weakTopics };
}

module.exports = { getTopicMastery };
