const mongoose = require('mongoose');

const userAnsweredQuestionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    questionId: { type: String, required: true },
    answeredAt: { type: Date, default: Date.now },
});

// One row per (user, question); marking the same question answered twice is
// a no-op upsert instead of growing an ever-larger array on the User doc.
userAnsweredQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

const UserAnsweredQuestion = mongoose.model('UserAnsweredQuestion', userAnsweredQuestionSchema);

module.exports = UserAnsweredQuestion;
