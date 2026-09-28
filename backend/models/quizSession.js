const mongoose = require('mongoose');
const { QUIZ_MODES, SESSION_TTL_SECONDS } = require('../config/quizConfig');

const currentQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null },
    servedAt: { type: Date, default: null },
    // Only set for Blitz; null for Classic/Survival, which have no deadline.
    deadlineAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    resolved: { type: Boolean, default: true },
  },
  { _id: false }
);

const quizSessionSchema = new mongoose.Schema({
  // Null for guest sessions: guests can play but never accrue persisted
  // points/stats (see quizSessionService).
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  mode: { type: String, enum: QUIZ_MODES, required: true },
  filters: {
    topics: { type: [String], default: [] },
    difficulty: { type: String, default: null },
  },
  // Every question already served in this session, so it's never repeated
  // within the same run regardless of mode.
  servedQuestionIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  currentQuestion: { type: currentQuestionSchema, default: () => ({}) },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  endedReason: { type: String, default: null },
  // Correct-answer count for this run only (session-scoped, distinct from
  // the user's all-time stats).
  score: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: SESSION_TTL_SECONDS },
});

quizSessionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('QuizSession', quizSessionSchema);
