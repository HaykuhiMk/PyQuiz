const crypto = require('crypto');
const AppError = require('../core/AppError');
const Question = require('../models/questionModel');
const userRepository = require('../repositories/userRepository');
const dailyChallengeSetRepository = require('../repositories/dailyChallengeSetRepository');
const answerEventRepository = require('../repositories/answerEventRepository');
const userService = require('../services/userService');

const DAILY_QUESTION_COUNT = 5;
const DAILY_POINTS_PER_CORRECT = 20;

// The challenge "day" is defined in Asia/Yerevan local time, not UTC or the
// viewer's own timezone — everyone gets a new challenge at the same instant
// regardless of where they are.
const CHALLENGE_TIMEZONE = 'Asia/Yerevan';

function getTodayKey(now = new Date()) {
  // en-CA formats as YYYY-MM-DD, exactly the date-key format used throughout.
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHALLENGE_TIMEZONE }).format(now);
}

// The UTC-ms offset to ADD to `utcInstant` to read its wall-clock time in
// `timeZone`. Derived from Intl rather than a hardcoded "+04:00" so this
// stays correct even if the zone's civil-time rules ever change (Armenia
// has used a fixed UTC+4 with no DST since 2012, but nothing here assumes
// that will always be true).
function getZoneOffsetMs(utcInstant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(utcInstant)
    .reduce((acc, { type, value }) => {
      acc[type] = value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcInstant.getTime();
}

// The UTC instant of the next Asia/Yerevan midnight after `now` — shown on
// the Daily Challenge page as "next reset", and the moment a new day's set
// gets frozen on its first request.
function getNextResetAt(now = new Date()) {
  const todayKey = getTodayKey(now);
  const tomorrowGuess = new Date(new Date(`${todayKey}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = getTodayKey(tomorrowGuess);
  const utcGuess = new Date(`${tomorrowKey}T00:00:00Z`);
  const offsetMs = getZoneOffsetMs(utcGuess, CHALLENGE_TIMEZONE);
  return new Date(utcGuess.getTime() - offsetMs);
}

// Deterministic per-day seed: HMAC-SHA256(server secret, date key). Unlike a
// plain hash of the date, this can't be predicted by anyone without the
// secret, while still being fully reproducible server-side for the same
// calendar day (so every request that day computes the same shuffle before
// it's even frozen — see getDailyQuestions).
function buildDaySeed(dateKey) {
  const secret = process.env.DAILY_CHALLENGE_SEED_SECRET;
  if (!secret) {
    throw new AppError('Daily challenge is not configured.', 500);
  }
  return crypto.createHmac('sha256', secret).update(dateKey).digest();
}

// mulberry32 — a small, fast, public-domain 32-bit PRNG. Seeded from the
// HMAC digest above (its first 4 bytes), it produces a deterministic stream
// used to Fisher-Yates shuffle the question pool.
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seedBuffer) {
  const random = mulberry32(seedBuffer.readUInt32BE(0));
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Returns today's (or `dateKey`'s) challenge questions as full documents
// (answer/explanation included — callers sanitize as needed). The set is
// frozen in DailyChallengeSet on its first request each day and served from
// there afterward, so it can't change mid-day even if questions are added.
// Robust to a question being deleted after freezing: it's quietly dropped
// rather than failing the whole challenge.
async function getDailyQuestions(dateKey = getTodayKey()) {
  let set = await dailyChallengeSetRepository.findByDate(dateKey);

  if (!set) {
    const allQuestions = await Question.find().select('_id').lean();
    if (!allQuestions.length) {
      throw new AppError('No questions available for daily challenge', 404);
    }
    const shuffled = seededShuffle(
      allQuestions.map((q) => q._id),
      buildDaySeed(dateKey)
    );
    const questionIds = shuffled.slice(0, Math.min(DAILY_QUESTION_COUNT, shuffled.length));
    set = await dailyChallengeSetRepository.createIfMissing(dateKey, questionIds);
  }

  const existing = await Question.find({ _id: { $in: set.questionIds } }).lean();
  const byId = new Map(existing.map((q) => [String(q._id), q]));
  return set.questionIds.map((id) => byId.get(String(id))).filter(Boolean);
}

function sanitizeQuestion(question) {
  return {
    _id: question._id,
    question: question.question,
    code: question.code || '',
    options: question.options,
    difficulty: question.difficulty,
    topics: question.topics,
  };
}

async function getDailyChallengeForUser(userId) {
  const dateKey = getTodayKey();
  const user = userId ? await userRepository.findById(userId) : null;
  const questions = await getDailyQuestions(dateKey);
  const completed = user?.dailyChallenge?.date === dateKey && user.dailyChallenge.completedAt;

  return {
    date: dateKey,
    total: questions.length,
    questions: questions.map(sanitizeQuestion),
    completed: Boolean(completed),
    score: completed ? user.dailyChallenge.score : null,
    nextResetAt: getNextResetAt(),
  };
}

async function submitDailyChallenge(userId, answers = []) {
  const dateKey = getTodayKey();
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  if (user.dailyChallenge?.date === dateKey && user.dailyChallenge.completedAt) {
    throw new AppError('Daily challenge already completed today', 400);
  }

  const questions = await getDailyQuestions(dateKey);
  const questionMap = new Map(questions.map((q) => [String(q._id), q]));
  const scored = new Set();
  const outcomes = [];
  let score = 0;

  // Each of today's questions counts once, using its first answer; repeated
  // or unknown question IDs in the payload are ignored. Pure computation
  // only here — no writes yet — so this can run redundantly across a
  // concurrent double-submission without side effects.
  for (const entry of answers) {
    const id = String(entry.questionId);
    const question = questionMap.get(id);
    if (!question || scored.has(id)) continue;
    scored.add(id);

    const correctIndex = question.options.indexOf(question.answer);
    const isCorrect = Number(entry.selectedIndex) === correctIndex;
    if (isCorrect) score += 1;
    outcomes.push({ question, isCorrect, selectedIndex: entry.selectedIndex });
  }

  const points = score * DAILY_POINTS_PER_CORRECT;
  const claimed = await userRepository.claimDailyChallenge(userId, dateKey, {
    score,
    total: questions.length,
    points,
  });
  if (!claimed) {
    throw new AppError('Daily challenge already completed today', 400);
  }

  // Only the request that won the atomic claim above records evidence, so a
  // concurrent double-submission can't double-count topicStats/streaks even
  // though completion/points were already guaranteed exactly-once by it.
  // Each Daily Challenge question is single-shot, so every one of these is
  // a first-attempt answer; points are fixed at DAILY_POINTS_PER_CORRECT and
  // awarded above independently of the cross-session first-correct-ever
  // rule, so pointsOverride: 0 suppresses per-question point awarding here.
  for (const { question, isCorrect, selectedIndex } of outcomes) {
    await answerEventRepository.createEvent({
      userId,
      sessionId: null,
      questionId: question._id,
      mode: 'daily',
      selectedIndex: Number.isFinite(Number(selectedIndex)) ? Number(selectedIndex) : null,
      correct: isCorrect,
      attemptNumber: 1,
      timeTakenMs: 0,
    });
    await userService.applyAnswerOutcome(userId, question, {
      isCorrect,
      mode: 'daily',
      attemptNumber: 1,
      pointsOverride: 0,
    });
  }

  return {
    score,
    total: questions.length,
    pointsAwarded: points,
    message: 'Daily challenge completed!',
  };
}

module.exports = {
  getDailyChallengeForUser,
  submitDailyChallenge,
  getDailyQuestions,
  getTodayKey,
  getNextResetAt,
};
