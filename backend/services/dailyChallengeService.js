const crypto = require('crypto');
const AppError = require('../core/AppError');
const Question = require('../models/questionModel');
const userRepository = require('../repositories/userRepository');

const DAILY_QUESTION_COUNT = 5;

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function seededShuffle(items, seed) {
  const arr = [...items];
  let state = crypto.createHash('sha256').update(seed).digest();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const hash = crypto.createHash('sha256').update(state).update(String(i)).digest();
    const j = hash.readUInt32BE(0) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
    state = hash;
  }
  return arr;
}

async function getDailyQuestions(dateKey = getTodayKey()) {
  const allQuestions = await Question.find().lean();
  if (!allQuestions.length) {
    throw new AppError('No questions available for daily challenge', 404);
  }
  const shuffled = seededShuffle(allQuestions, `pyquiz-daily-${dateKey}`);
  return shuffled.slice(0, Math.min(DAILY_QUESTION_COUNT, shuffled.length));
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
  const completed =
    user?.dailyChallenge?.date === dateKey && user.dailyChallenge.completedAt;

  return {
    date: dateKey,
    total: questions.length,
    questions: questions.map(sanitizeQuestion),
    completed: Boolean(completed),
    score: completed ? user.dailyChallenge.score : null,
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
  let score = 0;

  for (const entry of answers) {
    const question = questionMap.get(String(entry.questionId));
    if (!question) continue;
    const correctIndex = question.options.indexOf(question.answer);
    if (Number(entry.selectedIndex) === correctIndex) {
      score += 1;
    }
  }

  user.dailyChallenge = {
    date: dateKey,
    score,
    total: questions.length,
    completedAt: new Date(),
  };

  user.stats = user.stats || {};
  user.stats.totalPoints = (user.stats.totalPoints || 0) + score * 20;
  user.stats.lastAnsweredAt = new Date();
  await userRepository.saveUser(user);

  return {
    score,
    total: questions.length,
    pointsAwarded: score * 20,
    message: 'Daily challenge completed!',
  };
}

module.exports = {
  getDailyChallengeForUser,
  submitDailyChallenge,
  getTodayKey,
};
