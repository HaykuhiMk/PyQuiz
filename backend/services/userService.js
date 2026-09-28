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
  const user = await userRepository.findById(userId);
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
  if (points >= 500) return 'Python Master';
  if (points >= 200) return 'Advanced';
  if (points >= 50) return 'Intermediate';
  return 'Beginner';
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
// Points are awarded only the first time this user ever answers this exact
// question correctly, across all modes and sessions (see
// docs/AUDIT.md Phase 1 addendum). A repeat correct answer still updates
// streaks/accuracy/topicStats below, just not points — `alreadyCorrectBefore`
// tells the caller whether that's what happened, so it can show
// "already mastered" instead of it looking like a bug.
async function applyAnswerOutcome(userId, question, { isCorrect, mode, timeSpentSec = 0 }) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const alreadyCorrectBefore = await userAnsweredQuestionRepository.wasEverCorrect(userId, question._id);

  user.stats = user.stats || {};
  user.stats.currentStreak = user.stats.currentStreak || 0;
  user.stats.bestStreak = user.stats.bestStreak || 0;
  user.stats.totalPoints = user.stats.totalPoints || 0;
  user.stats.totalCorrect = user.stats.totalCorrect || 0;
  user.stats.totalAnswered = user.stats.totalAnswered || 0;
  user.stats.timedModes = user.stats.timedModes || { blitzBestScore: 0, survivalBestStreak: 0 };

  await userAnsweredQuestionRepository.markAnswered(userId, question._id, { correct: isCorrect });

  user.stats.totalAnswered += 1;
  if (isCorrect) {
    user.stats.totalCorrect += 1;
    user.stats.currentStreak += 1;
  } else {
    user.stats.currentStreak = 0;
  }

  user.stats.bestStreak = Math.max(user.stats.bestStreak, user.stats.currentStreak);
  const pointsAwarded = isCorrect && !alreadyCorrectBefore ? computePoints({ isCorrect, mode, timeSpentSec }) : 0;
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

  if (question.topics?.length) {
    user.topicStats = user.topicStats || [];
    for (const topic of question.topics) {
      let entry = user.topicStats.find((item) => item.topic === topic);
      if (!entry) {
        entry = { topic, correct: 0, attempted: 0 };
        user.topicStats.push(entry);
      }
      entry.attempted += 1;
      if (isCorrect) entry.correct += 1;
    }
  }

  const newAchievements = unlockAchievements(user);
  await userRepository.saveUser(user);

  return {
    pointsAwarded,
    alreadyCorrectBefore,
    currentStreak: user.stats.currentStreak,
    bestStreak: user.stats.bestStreak,
    totalPoints: user.stats.totalPoints,
    newAchievements,
  };
}

async function getGlobalLeaderboard(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const users = await userRepository.findLeaderboard(safeLimit);
  return users.map((user, index) => ({
    rank: index + 1,
    username: user.username,
    totalPoints: user.stats?.totalPoints || 0,
    bestStreak: user.stats?.bestStreak || 0,
    totalCorrect: user.stats?.totalCorrect || 0,
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
