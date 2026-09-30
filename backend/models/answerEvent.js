const mongoose = require('mongoose');
const { QUIZ_MODES } = require('../config/quizConfig');

// One document per answer attempt (including timed-out/skipped attempts with
// selectedIndex: null). Groundwork for future adaptive-difficulty features;
// also the source of truth topicMasteryService derives topic accuracy from
// (see docs/AUDIT.md Phase 3 addendum) alongside User.stats, which is
// updated separately. Guest quiz-session attempts are not recorded — see
// docs/AUDIT.md Phase 1 addendum for why. Daily Challenge attempts ARE
// recorded (mode: 'daily'), but have no QuizSession to point to, hence
// `sessionId` is nullable.
const answerEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizSession', default: null },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  mode: { type: String, enum: [...QUIZ_MODES, 'daily'], required: true },
  selectedIndex: { type: Number, default: null },
  // The misconception tagged on the chosen wrong option (Question.distractors,
  // docs/CONCEPT_GRAPH.md Stage 2), or null. Stored as it was when answered,
  // so later retagging doesn't rewrite history. Not an enum for that reason.
  misconceptionId: { type: String, default: null },
  // True when a Blitz question timed out: either a late answer (its
  // selectedIndex and misconceptionId are still recorded) or no answer at
  // all. Lets analysis separate considered answers from timed-out ones.
  timedOut: { type: Boolean, default: false },
  correct: { type: Boolean, required: true },
  attemptNumber: { type: Number, required: true },
  timeTakenMs: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

answerEventSchema.index({ userId: 1, createdAt: -1 });
answerEventSchema.index({ questionId: 1 });

module.exports = mongoose.model('AnswerEvent', answerEventSchema);
