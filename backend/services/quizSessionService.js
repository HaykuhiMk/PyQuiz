const AppError = require('../core/AppError');
const Question = require('../models/questionModel');
const quizSessionRepository = require('../repositories/quizSessionRepository');
const answerEventRepository = require('../repositories/answerEventRepository');
const userAnsweredQuestionRepository = require('../repositories/userAnsweredQuestionRepository');
const questionService = require('../services/questionService');
const { chosenMisconceptionId } = require('../utils/distractors');
const userService = require('../services/userService');
const {
  MAX_ATTEMPTS,
  RETRYABLE_MODES,
  BLITZ_TIME_LIMIT_MS,
  BLITZ_LATENCY_GRACE_MS,
} = require('../config/quizConfig');

const SESSION_TOKEN_REGEX = /^[a-f0-9]{64}$/;

function isRetryable(mode) {
  return RETRYABLE_MODES.includes(mode);
}

async function loadOwnedSession(sessionToken, requester) {
  if (typeof sessionToken !== 'string' || !SESSION_TOKEN_REGEX.test(sessionToken)) {
    throw new AppError('Quiz session not found.', 404);
  }

  const session = await quizSessionRepository.findByToken(sessionToken);
  if (!session) {
    throw new AppError('Quiz session not found.', 404);
  }

  // Guest sessions (userId null) have no owner check: the session token
  // itself is the only credential, same as the rest of today's guest
  // experience. A session created by a logged-in user can only be driven by
  // that same user.
  if (session.userId && String(session.userId) !== String(requester?.userId)) {
    throw new AppError('Quiz session not found.', 404);
  }

  return session;
}

function sanitizeFilters({ topics = [], difficulty } = {}) {
  return { topics, difficulty: difficulty || null };
}

// Fetches and serves the next question for a session, applying Classic's
// permanent (cross-session) exclusion of questions this user has already
// gotten right on a first attempt (everCorrect — docs/AUDIT.md Phase 3
// addendum: a question only ever answered wrong, or guessed on a later
// attempt, stays eligible for a real Classic retry) and each session's own
// never-repeat-within-this-run exclusion. A `practiceMode` session skips the
// everCorrect exclusion entirely, letting a user replay already-mastered
// questions — they can never earn points for it (the first-correct-ever
// rule already guarantees that), so the frontend labels it accordingly.
// Mutates and saves `session`. Shared by session creation (first question)
// and the "next" action.
async function serveNextQuestion(session) {
  const excludeIds = new Set(session.servedQuestionIds.map(String));

  if (session.mode === 'classic' && session.userId && !session.practiceMode) {
    const everCorrectIds = await userAnsweredQuestionRepository.findEverCorrectIds(session.userId);
    everCorrectIds.forEach((id) => excludeIds.add(String(id)));
  }

  const result = await questionService.getRandomQuestion({
    topics: session.filters.topics,
    difficulty: session.filters.difficulty || undefined,
    excludeIds: Array.from(excludeIds),
  });

  if (result.noMoreQuestions) {
    session.status = 'ended';
    session.endedReason = 'exhausted';
    session.currentQuestion = { questionId: null, servedAt: null, deadlineAt: null, attempts: 0, resolved: true };
    await quizSessionRepository.save(session);
    return {
      sessionId: session.token,
      noMoreQuestions: true,
      message: result.message,
      totalAnswered: result.totalAnswered,
      sessionStatus: session.status,
      // Only meaningful for a non-practice Classic session: Blitz/Survival
      // have no everCorrect-based exclusion to bypass, and a practice
      // session that's already exhausted has nothing further to offer.
      canPracticeAgain: session.mode === 'classic' && !session.practiceMode,
    };
  }

  const now = new Date();
  session.servedQuestionIds.push(result._id);
  session.currentQuestion = {
    questionId: result._id,
    servedAt: now,
    deadlineAt: session.mode === 'blitz' ? new Date(now.getTime() + BLITZ_TIME_LIMIT_MS + BLITZ_LATENCY_GRACE_MS) : null,
    attempts: 0,
    resolved: false,
  };
  await quizSessionRepository.save(session);

  return {
    sessionId: session.token,
    mode: session.mode,
    practiceMode: session.practiceMode,
    question: result,
    attemptsRemaining: isRetryable(session.mode) ? MAX_ATTEMPTS : 1,
    deadlineAt: session.currentQuestion.deadlineAt,
    sessionStatus: session.status,
  };
}

async function recordAttempt({ session, question, selectedIndex, isCorrect, attemptNumber, timeTakenMs, timedOut = false }) {
  if (!session.userId) return; // guests: no durable identity, nothing to attribute the event to
  await answerEventRepository.createEvent({
    userId: session.userId,
    sessionId: session._id,
    questionId: question._id,
    mode: session.mode,
    selectedIndex: selectedIndex === undefined || selectedIndex === null ? null : Number(selectedIndex),
    misconceptionId: chosenMisconceptionId(question, selectedIndex),
    timedOut: Boolean(timedOut),
    correct: isCorrect,
    attemptNumber,
    timeTakenMs: Math.max(0, Math.round(timeTakenMs)),
  });
}

// Boils an outcomeResult (or its absence, for guests) down to why a correct
// answer earned 0 points, so the client can explain it instead of it looking
// like a bug. Null when points were awarded or the answer was wrong.
function pointsWithheldReason(isCorrect, outcomeResult) {
  if (!isCorrect || !outcomeResult || outcomeResult.pointsAwarded > 0) return null;
  if (!outcomeResult.firstAttemptCorrect) return 'not_first_attempt';
  if (outcomeResult.alreadyCorrectBefore) return 'already_mastered';
  return null;
}

async function createSession(requester, { mode, topics, difficulty, practiceMode }) {
  const session = await quizSessionRepository.create({
    userId: requester?.userId || null,
    mode,
    // Only meaningful for Classic; harmless if sent for another mode, since
    // only Classic ever checks it.
    practiceMode: mode === 'classic' && Boolean(practiceMode),
    filters: sanitizeFilters({ topics, difficulty }),
    servedQuestionIds: [],
    currentQuestion: { questionId: null, servedAt: null, deadlineAt: null, attempts: 0, resolved: true },
    status: 'active',
    score: 0,
  });

  return serveNextQuestion(session);
}

// Auto-resolves an unanswered Blitz question as a timeout when the client
// asks to move on without ever submitting — closing the exact gap where the
// old client-only timer just skipped to the next question for free.
async function resolveBlitzTimeout(session) {
  const current = session.currentQuestion;
  const now = new Date();
  const question = await Question.findById(current.questionId).lean();

  current.attempts += 1;
  current.resolved = true;

  if (question && session.userId) {
    await recordAttempt({
      session,
      question,
      selectedIndex: null,
      isCorrect: false,
      attemptNumber: current.attempts,
      timeTakenMs: now - current.servedAt,
      timedOut: true,
    });
    await userService.applyAnswerOutcome(session.userId, question, {
      isCorrect: false,
      mode: session.mode,
      timeSpentSec: (now - current.servedAt) / 1000,
      attemptNumber: current.attempts,
    });
  }
}

async function getNextQuestion(sessionToken, requester) {
  const session = await loadOwnedSession(sessionToken, requester);

  if (session.status !== 'active') {
    throw new AppError('This quiz session has ended.', 400);
  }

  const current = session.currentQuestion;
  if (current?.questionId && !current.resolved) {
    if (session.mode === 'blitz') {
      await resolveBlitzTimeout(session);
    } else {
      throw new AppError('Answer the current question before continuing.', 400);
    }
  }

  return serveNextQuestion(session);
}

async function submitAnswer(sessionToken, requester, { questionId, selectedIndex }) {
  const session = await loadOwnedSession(sessionToken, requester);

  if (session.status !== 'active') {
    throw new AppError('This quiz session has ended.', 400);
  }

  const current = session.currentQuestion;
  if (!current?.questionId) {
    throw new AppError('No active question for this session.', 400);
  }
  if (current.resolved) {
    throw new AppError('This question has already been resolved. Call next to continue.', 400);
  }
  if (String(current.questionId) !== String(questionId)) {
    throw new AppError('This answer does not match the current question.', 409);
  }

  const maxAttempts = isRetryable(session.mode) ? MAX_ATTEMPTS : 1;
  if (current.attempts >= maxAttempts) {
    throw new AppError('No attempts remaining for this question.', 400);
  }

  const question = await Question.findById(current.questionId).lean();
  if (!question) {
    throw new AppError('Question not found.', 404);
  }

  const now = new Date();
  const timeTakenMs = now - current.servedAt;
  const correctIndex = question.options.indexOf(question.answer);

  const timedOut = session.mode === 'blitz' && current.deadlineAt && now > current.deadlineAt;
  const isCorrect =
    !timedOut && selectedIndex !== undefined && selectedIndex !== null && Number(selectedIndex) === correctIndex;

  current.attempts += 1;
  const attemptNumber = current.attempts;

  let resolved;
  let outcome;
  if (isCorrect) {
    resolved = true;
    outcome = 'correct';
  } else if (timedOut) {
    resolved = true;
    outcome = 'timeout';
  } else if (session.mode === 'survival') {
    resolved = true;
    outcome = 'wrong';
  } else if (attemptNumber >= maxAttempts) {
    resolved = false; // exhausted, but the client must explicitly reveal
    outcome = 'exhausted';
  } else {
    resolved = false;
    outcome = 'retry';
  }

  current.resolved = resolved;

  await recordAttempt({
    session,
    question,
    selectedIndex,
    isCorrect,
    attemptNumber,
    timeTakenMs,
    timedOut,
  });

  let outcomeResult = null;
  if (resolved) {
    if (session.mode === 'survival' && !isCorrect) {
      session.status = 'ended';
      session.endedReason = 'mistake';
    }
    if (isCorrect) {
      session.score += 1;
    }

    if (session.userId) {
      outcomeResult = await userService.applyAnswerOutcome(session.userId, question, {
        isCorrect,
        mode: session.mode,
        timeSpentSec: timeTakenMs / 1000,
        attemptNumber,
      });
    }
  }

  await quizSessionRepository.save(session);

  const response = {
    isCorrect,
    resolved,
    outcome,
    attemptsRemaining: isRetryable(session.mode) ? Math.max(0, maxAttempts - attemptNumber) : 0,
    sessionStatus: session.status,
    endedReason: session.endedReason,
    pointsAwarded: outcomeResult?.pointsAwarded || 0,
    pointsWithheldReason: pointsWithheldReason(isCorrect, outcomeResult),
    totalPoints: outcomeResult?.totalPoints,
    currentStreak: outcomeResult?.currentStreak,
    bestStreak: outcomeResult?.bestStreak,
    newAchievements: outcomeResult?.newAchievements || [],
  };

  if (resolved) {
    response.correctIndex = correctIndex;
    response.correctAnswer = question.answer;
    response.explanation = question.explanation;
  }

  return response;
}

async function revealAnswer(sessionToken, requester) {
  const session = await loadOwnedSession(sessionToken, requester);

  if (session.status !== 'active') {
    throw new AppError('This quiz session has ended.', 400);
  }

  const current = session.currentQuestion;
  if (!current?.questionId || current.resolved) {
    throw new AppError('There is no exhausted question to reveal.', 400);
  }
  if (!isRetryable(session.mode) || current.attempts < MAX_ATTEMPTS) {
    throw new AppError('This question still has attempts remaining.', 400);
  }

  const question = await Question.findById(current.questionId).lean();
  if (!question) {
    throw new AppError('Question not found.', 404);
  }

  current.resolved = true;

  let outcomeResult = null;
  if (session.userId) {
    outcomeResult = await userService.applyAnswerOutcome(session.userId, question, {
      isCorrect: false,
      mode: session.mode,
      timeSpentSec: (Date.now() - current.servedAt) / 1000,
      attemptNumber: current.attempts,
    });
  }

  await quizSessionRepository.save(session);

  return {
    resolved: true,
    correctIndex: question.options.indexOf(question.answer),
    correctAnswer: question.answer,
    explanation: question.explanation,
    sessionStatus: session.status,
    pointsAwarded: 0,
    pointsWithheldReason: null,
    totalPoints: outcomeResult?.totalPoints,
    currentStreak: outcomeResult?.currentStreak,
    bestStreak: outcomeResult?.bestStreak,
    newAchievements: outcomeResult?.newAchievements || [],
  };
}

module.exports = {
  createSession,
  getNextQuestion,
  submitAnswer,
  revealAnswer,
};
