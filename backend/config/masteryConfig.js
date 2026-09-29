// Named thresholds for topic mastery classification, weak-topic detection,
// and rank computation (docs/AUDIT.md Phase 3 addendum) — centralized here
// instead of inline magic numbers in topicMasteryService/userService.

// A topic is "master" once both thresholds are met; "intermediate" once
// coverage alone clears its (lower) bar; "beginner" once anything has been
// answered; otherwise "new". Percentages, 0-100.
const MASTER_COVERAGE_THRESHOLD = 80;
const MASTER_ACCURACY_THRESHOLD = 70;
const INTERMEDIATE_COVERAGE_THRESHOLD = 50;

// A topic surfaces as "weak" once there's enough attempt history to trust
// the accuracy figure (WEAK_TOPIC_MIN_ATTEMPTS) and that accuracy is below
// the cutoff; capped to the lowest-accuracy WEAK_TOPIC_MAX_COUNT topics.
const WEAK_TOPIC_MIN_ATTEMPTS = 2;
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
  WEAK_TOPIC_MIN_ATTEMPTS,
  WEAK_TOPIC_ACCURACY_THRESHOLD,
  WEAK_TOPIC_MAX_COUNT,
  RANK_THRESHOLDS,
};
