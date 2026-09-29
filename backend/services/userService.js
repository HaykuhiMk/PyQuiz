const bcrypt = require('bcryptjs');
const AppError = require('../core/AppError');
const userRepository = require('../repositories/userRepository');
const userAnsweredQuestionRepository = require('../repositories/userAnsweredQuestionRepository');
const { getTotalQuestionCount } = require('../utils/questionCount');
const {
  BASE_POINTS_BY_MODE,
  BLITZ_TIME_BONUS_MAX,
  BLITZ_TIME_BONUS_DIVISOR_SEC,
} = require('../config/quizConfig');
const { RANK_THRESHOLDS } = require('../config/masteryConfig');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/;
const MAX_AVATAR_LENGTH = 500_000;
const ACHIEVEMENTS = [
  { key: 'first_correct', predicate: (s) => s.totalCorrect >= 1 },
  { key: 'streak_5', predicate: (s) => s.bestStreak >= 5 },
  { key: 'streak_10', predicate: (s) => s.bestStreak >= 10 },
  { key: 'points_100', predicate: (s) => s.totalPoints >= 100 },
  { key: 'points_500', predicate: (s) => s.totalPoints >= 500 },
];

function computePoints({ isCorrect, mode, timeSpentSec }) {
  if (!isCorrect) return 0;
  const base = BASE_POINTS_BY_MODE[mode] ?? BASE_POINTS_BY_MODE.classic;
  if (mode !== 'blitz') return base;
  const timeBonus = Math.max(0, BLITZ_TIME_BONUS_MAX - Math.floor(timeSpentSec / BLITZ_TIME_BONUS_DIVISOR_SEC));
  return base + timeBonus;
}

function unlockAchievements(user) {
  const unlocked = new Set((user.achievements || []).map((a) => a.key));
  const newlyUnlocked = [];
  const now = new Date();

  for (const achievement of ACHIEVEMENTS) {
    if (!unlocked.has(achievement.key) && achievement.predicate(user.stats)) {
      user.achievements.push({ key: achievement.key, unlockedAt: now });
      newlyUnlocked.push(achievement.key);
    }
  }

  return newlyUnlocked;
}

async function getUserProfile(userId) {
  // The only read path that needs the (up-to-500KB) avatar field —
  // findById excludes it by default so it isn't loaded on every other
  // user lookup (docs/AUDIT.md item 9).
  const user = await userRepository.findByIdWithAvatar(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const [answeredCount, totalQuestions] = await Promise.all([
    userAnsweredQuestionRepository.countAnswered(userId),
    getTotalQuestionCount(),
  ]);
  return {
    username: user.username,
    email: user.email,
    avatar: user.avatar || null,
    rank: computeRank(user.stats),
    answered: answeredCount,
    unanswered: Math.max(0, totalQuestions - answeredCount),
    stats: user.stats || {},
    achievements: user.achievements || [],
    dailyChallenge: user.dailyChallenge || null,
  };
}

function computeRank(stats = {}) {
  const points = stats.totalPoints || 0;
  const tier = RANK_THRESHOLDS.find((candidate) => points >= candidate.minPoints);
  return tier ? tier.rank : 'Beginner';
}

async function getUserProgress(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const [answeredQuestions, totalQuestions] = await Promise.all([
    userAnsweredQuestionRepository.findAnsweredIds(userId),
    getTotalQuestionCount(),
  ]);
  const answeredCount = answeredQuestions.length;

  return {
    answered: answeredCount,
    unanswered: Math.max(0, totalQuestions - answeredCount),
    answeredQuestions,
    stats: user.stats || {},
    achievements: user.achievements || [],
  };
}

// Applies the outcome of a single, already-adjudicated answer to a user's
// stats. The caller (quizSessionService) is the trust boundary: it derives
// `isCorrect` from a server-side deadline/attempt check and takes `mode`
// from the session, never from client input, so this function never
// re-derives correctness itself.
//
// Points and streaks reward a *first-attempt* correct answer specifically
// (`attemptNumber === 1`): getting it right after one or more wrong Classic/
// Blitz attempts on the same question still counts toward totalCorrect (and
// toward topic accuracy/coverage, computed separately by
// topicMasteryService from AnswerEvent/UserAnsweredQuestion), but earns no
// points and does not extend the streak — a wrong attempt already broke it.
// Daily Challenge questions are single-shot by construction, so every
// correct answer there is attempt 1.
//
// On top of that, points are awarded only the first time this user has ever
// gotten this exact question right on a first attempt, across all modes and
// sessions (see docs/AUDIT.md Phase 1 addendum) — `UserAnsweredQuestion.
// everCorrect` records exactly that, so a question only ever guessed right
// on a later attempt remains eligible for real points in a future session.
// `alreadyCorrectBefore`/`firstAttemptCorrect` tell the caller which of
// these applied, so it can explain a 0-point correct answer instead of it
// looking like a bug.
//
// `pointsOverride` bypasses the point calculation above entirely (still
// updates streaks/accuracy/everCorrect as usual): the Daily Challenge pays a
// flat per-question bonus independent of the first-correct-ever rule, so it
// calls this once per question with `pointsOverride: 0` and awards its own
// points separately in one lump sum.
async function applyAnswerOutcome(
  userId,
  question,
  { isCorrect, mode, timeSpentSec = 0, attemptNumber = 1, pointsOverride }
) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const firstAttemptCorrect = isCorrect && attemptNumber === 1;
  const alreadyCorrectBefore = await userAnsweredQuestionRepository.wasEverCorrect(userId, question._id);

  user.stats = user.stats || {};
  user.stats.currentStreak = user.stats.currentStreak || 0;
  user.stats.bestStreak = user.stats.bestStreak || 0;
  user.stats.totalPoints = user.stats.totalPoints || 0;
  user.stats.totalCorrect = user.stats.totalCorrect || 0;
  user.stats.totalAnswered = user.stats.totalAnswered || 0;
  user.stats.timedModes = user.stats.timedModes || { blitzBestScore: 0, survivalBestStreak: 0 };

  await userAnsweredQuestionRepository.markAnswered(userId, question._id, { correct: firstAttemptCorrect });

  user.stats.totalAnswered += 1;
  if (isCorrect) {
    user.stats.totalCorrect += 1;
  }
  if (firstAttemptCorrect) {
    user.stats.currentStreak += 1;
  } else {
    user.stats.currentStreak = 0;
  }

  user.stats.bestStreak = Math.max(user.stats.bestStreak, user.stats.currentStreak);
  const pointsAwarded =
    pointsOverride !== undefined
      ? pointsOverride
      : firstAttemptCorrect && !alreadyCorrectBefore
        ? computePoints({ isCorrect: true, mode, timeSpentSec })
        : 0;
  user.stats.totalPoints += pointsAwarded;
  user.stats.lastAnsweredAt = new Date();

  if (mode === 'blitz') {
    user.stats.timedModes.blitzBestScore = Math.max(user.stats.timedModes.blitzBestScore || 0, pointsAwarded);
  }
  if (mode === 'survival') {
    user.stats.timedModes.survivalBestStreak = Math.max(
      user.stats.timedModes.survivalBestStreak || 0,
      user.stats.currentStreak
    );
  }

  const newAchievements = unlockAchievements(user);
  await userRepository.saveUser(user);

  return {
    pointsAwarded,
    alreadyCorrectBefore,
    firstAttemptCorrect,
    currentStreak: user.stats.currentStreak,
    bestStreak: user.stats.bestStreak,
    totalPoints: user.stats.totalPoints,
    newAchievements,
  };
}

async function getGlobalLeaderboard(limit = 50, viewerUserId = null) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const users = await userRepository.findLeaderboard(safeLimit);
  return users.map((user, index) => ({
    rank: index + 1,
    username: user.username,
    totalPoints: user.stats?.totalPoints || 0,
    bestStreak: user.stats?.bestStreak || 0,
    totalCorrect: user.stats?.totalCorrect || 0,
    // Server-computed instead of the frontend matching by username+stats
    // (docs/AUDIT.md item 9) — that heuristic broke down whenever two users
    // shared a username, which case-insensitive uniqueness now prevents
    // going forward, but this is also just a more direct, correct way to
    // identify "my row."
    isCurrentUser: viewerUserId ? String(user._id) === String(viewerUserId) : false,
    achievements: (user.achievements || []).map((a) => a.key),
  }));
}

function validateAvatar(avatar) {
  if (avatar === null || avatar === '') return null;
  if (typeof avatar !== 'string' || !avatar.startsWith('data:image/')) {
    throw new AppError('Avatar must be a valid image file', 400);
  }
  if (avatar.length > MAX_AVATAR_LENGTH) {
    throw new AppError('Image is too large. Please use a file under 500KB.', 400);
  }
  return avatar;
}

async function updateProfile(userId, { username, avatar }) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (username !== undefined) {
    const trimmed = username.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      throw new AppError('Username must be between 2 and 50 characters', 400);
    }
    if (trimmed.toLowerCase() !== user.usernameLower) {
      const existing = await userRepository.findByUsernameLower(trimmed.toLowerCase());
      if (existing) {
        throw new AppError('Username already exists.', 400);
      }
    }
    user.username = trimmed;
  }

  if (avatar !== undefined) {
    user.avatar = validateAvatar(avatar);
  }

  await userRepository.saveUser(user);
  return {
    username: user.username,
    avatar: user.avatar,
    message: 'Profile updated successfully.',
  };
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const valid = await user.isValidPassword(currentPassword);
  if (!valid) {
    throw new AppError('Current password is incorrect', 400);
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    throw new AppError(
      'Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character (@, $, !, %, *, ?, &, _).',
      400
    );
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await userRepository.saveUser(user);
  return { message: 'Password changed successfully.' };
}

async function deleteAccount(userId, { password }) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === 'admin') {
    throw new AppError('Admin accounts cannot be deleted from this page', 403);
  }

  const valid = await user.isValidPassword(password);
  if (!valid) {
    throw new AppError('Password is incorrect', 400);
  }

  await userRepository.deleteById(userId);
  await userAnsweredQuestionRepository.deleteAllForUser(userId);
  return { message: 'Account deleted successfully.' };
}

module.exports = {
  getUserProfile,
  getUserProgress,
  applyAnswerOutcome,
  getGlobalLeaderboard,
  updateProfile,
  changePassword,
  deleteAccount,
};
