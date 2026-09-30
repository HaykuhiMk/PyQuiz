const mongoose = require('mongoose');

const userAnsweredQuestionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    questionId: { type: String, required: true },
    answeredAt: { type: Date, default: Date.now },
    // True once this user has ever answered this question correctly (in any
    // mode/session). Points are awarded only the first time this flips to
    // true, so repeat correct answers can't be farmed for score.
    everCorrect: { type: Boolean, default: false },
});

// One row per (user, question); marking the same question answered twice is
// a no-op upsert instead of growing an ever-larger array on the User doc.
userAnsweredQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

const UserAnsweredQuestion = mongoose.model('UserAnsweredQuestion', userAnsweredQuestionSchema);

module.exports = UserAnsweredQuestion;
