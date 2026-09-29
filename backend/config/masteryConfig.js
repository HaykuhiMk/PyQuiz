// Named thresholds for topic mastery classification, weak-topic detection,
// and rank computation (docs/AUDIT.md Phase 3 addendum) — centralized here
// instead of inline magic numbers in topicMasteryService/userService.

// A topic is "master" once both thresholds are met; "intermediate" once
// coverage alone clears its (lower) bar; "beginner" once anything has been
// answered; otherwise "new". Percentages, 0-100.
const MASTER_COVERAGE_THRESHOLD = 80;
const MASTER_ACCURACY_THRESHOLD = 70;
const INTERMEDIATE_COVERAGE_THRESHOLD = 50;

// Accuracy is derived from AnswerEvent, which only exists from the Phase 1
// deployment onward (docs/AUDIT.md Phase 3 addendum) — a topic can have
// full coverage history from before then but almost no AnswerEvent data, in
// which case its accuracy figure is too thin a sample to trust for a
// master/intermediate/beginner classification. Below this many recorded
// attempts, a topic with any coverage shows a distinct "measuring" state
// instead. Kept in step with WEAK_TOPIC_MIN_ATTEMPTS below so a topic can
// never be flagged "weak" while still in "measuring" state.
const MIN_ACCURACY_EVENTS = 3;

// A canonical topic needs at least this many questions to support a
// meaningful mastery reading at all; below it, the topic shows "Not enough
// questions yet" regardless of how much of it any user has answered
// (docs/AUDIT.md Phase 3 taxonomy revision).
const MIN_QUESTIONS_FOR_MASTERY = 3;

// A topic surfaces as "weak" once there's enough attempt history to trust
// the accuracy figure (WEAK_TOPIC_MIN_ATTEMPTS — never below
// MIN_ACCURACY_EVENTS) and that accuracy is below the cutoff; capped to the
// lowest-accuracy WEAK_TOPIC_MAX_COUNT topics.
const WEAK_TOPIC_MIN_ATTEMPTS = MIN_ACCURACY_EVENTS;
const WEAK_TOPIC_ACCURACY_THRESHOLD = 60;
const WEAK_TOPIC_MAX_COUNT = 5;

// Checked in order; the first tier whose minPoints is met wins. Keep sorted
// highest-to-lowest.
const RANK_THRESHOLDS = [
  { rank: 'Python Master', minPoints: 500 },
  { rank: 'Advanced', minPoints: 200 },
  { rank: 'Intermediate', minPoints: 50 },
  { rank: 'Beginner', minPoints: 0 },
];

module.exports = {
  MASTER_COVERAGE_THRESHOLD,
  MASTER_ACCURACY_THRESHOLD,
  INTERMEDIATE_COVERAGE_THRESHOLD,
  MIN_ACCURACY_EVENTS,
  MIN_QUESTIONS_FOR_MASTERY,
  WEAK_TOPIC_MIN_ATTEMPTS,
  WEAK_TOPIC_ACCURACY_THRESHOLD,
  WEAK_TOPIC_MAX_COUNT,
  RANK_THRESHOLDS,
};
