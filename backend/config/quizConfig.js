// Named constants for server-authoritative quiz sessions (Phase 1). Centralized
// here so timing/scoring rules aren't duplicated across the session service
// and the points calculation.

const QUIZ_MODES = ['classic', 'blitz', 'survival'];

// Classic and Blitz both allow up to this many attempts on a question before
// the client must explicitly request a reveal; Survival allows exactly one.
const MAX_ATTEMPTS = 3;
const RETRYABLE_MODES = ['classic', 'blitz'];

// Blitz timing: the deadline is fixed once when the question is served and
// never extended by wrong attempts (no pause-on-wrong-answer) — see
// docs/AUDIT.md Phase 1 addendum for the reasoning. The grace period only
// absorbs normal request latency; it is not shown to the user as extra time.
const BLITZ_TIME_LIMIT_MS = 45000;
const BLITZ_LATENCY_GRACE_MS = 1500;

// Session documents are guest- and account-scoped scratch state, not a
// permanent record — expire them a day after creation.
const SESSION_TTL_SECONDS = 24 * 60 * 60;

const BASE_POINTS_BY_MODE = { classic: 10, blitz: 12, survival: 15 };
const BLITZ_TIME_BONUS_MAX = 10;
const BLITZ_TIME_BONUS_DIVISOR_SEC = 3;

module.exports = {
  QUIZ_MODES,
  MAX_ATTEMPTS,
  RETRYABLE_MODES,
  BLITZ_TIME_LIMIT_MS,
  BLITZ_LATENCY_GRACE_MS,
  SESSION_TTL_SECONDS,
  BASE_POINTS_BY_MODE,
  BLITZ_TIME_BONUS_MAX,
  BLITZ_TIME_BONUS_DIVISOR_SEC,
};
