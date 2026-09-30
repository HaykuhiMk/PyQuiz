const mongoose = require('mongoose');

// Freezes which questions belong to a given challenge day (see
// dailyChallengeService) so every request that day — and Study mode's
// exclusion of it — sees the same set, instead of recomputing the shuffle
// (and potentially a different result) on every request.
const dailyChallengeSetSchema = new mongoose.Schema({
  // Challenge-day key in the Asia/Yerevan calendar, e.g. "2026-09-29".
  date: { type: String, required: true, unique: true },
  questionIds: { type: [mongoose.Schema.Types.ObjectId], required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DailyChallengeSet', dailyChallengeSetSchema);
