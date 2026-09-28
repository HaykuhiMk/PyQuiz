const mongoose = require('mongoose');
const { QUIZ_MODES } = require('../config/quizConfig');

// One document per answer attempt (including timed-out/skipped attempts with
// selectedIndex: null). Groundwork for future adaptive-difficulty features;
// existing aggregate counters (User.stats, User.topicStats) are unaffected
// and keep being updated alongside this. Guest attempts are not recorded —
// see docs/AUDIT.md Phase 1 addendum for why.
const answerEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizSession', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  mode: { type: String, enum: QUIZ_MODES, required: true },
  selectedIndex: { type: Number, default: null },
  correct: { type: Boolean, required: true },
  attemptNumber: { type: Number, required: true },
  timeTakenMs: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

answerEventSchema.index({ userId: 1, createdAt: -1 });
answerEventSchema.index({ questionId: 1 });

module.exports = mongoose.model('AnswerEvent', answerEventSchema);
