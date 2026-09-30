// One-time remediation for the pre-Phase-1 scoring bug where answering the
// same question correctly more than once (in the same or different
// sessions/modes) awarded points every time (docs/AUDIT.md item 3). This
// recomputes each user's stats.totalPoints as a best-effort estimate of what
// they would have earned under the new "points once per question, ever"
// rule, and drops any points-based achievement that no longer qualifies.
//
// LIMITATION — read before running: UserAnsweredQuestion did not track
// per-question correctness before Phase 1, so which distinct questions a
// user answered correctly historically cannot be recovered exactly. As a
// documented approximation, this script caps the number of "correct"
// questions at
//   min(user.stats.totalCorrect, distinct questions ever answered by that user)
// and prices every one of them at the Classic base rate (the lowest of the
// three modes), since the historical mode/time-bonus behind each correct
// answer isn't recoverable either. Treat the result as "at most this many
// points," not an exact reconstruction of what was legitimately earned.
//
// totalAnswered/totalCorrect/streaks and topic mastery (derived separately,
// see docs/AUDIT.md Phase 3 addendum) are left untouched — this script only
// touches stats.totalPoints and points-based achievements.
//
// Usage:
//   node backend/scripts/resetFarmedPoints.js --dry-run   # prints changes only, writes nothing
//   node backend/scripts/resetFarmedPoints.js             # applies them
//
// Idempotent: it always recomputes from source data rather than applying a
// fixed delta, so running it again after it already applied makes no
// further changes.
//
// Does NOT run automatically and must never be pointed at production without
// the author's explicit decision to do so.

require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri, MISSING_MONGO_URI_MESSAGE } = require('../config/mongoUri');
const User = require('../models/user');
const UserAnsweredQuestion = require('../models/userAnsweredQuestion');

const CLASSIC_BASE_POINTS = 10;
const POINTS_ACHIEVEMENTS = [
  { key: 'points_100', threshold: 100 },
  { key: 'points_500', threshold: 500 },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error(MISSING_MONGO_URI_MESSAGE);
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(mongoUri);

  try {
    const users = await User.find({}).select('_id username stats achievements').lean();
    const changes = [];

    for (const user of users) {
      const distinctAnswered = await UserAnsweredQuestion.countDocuments({ userId: user._id });
      const currentTotalCorrect = user.stats?.totalCorrect || 0;
      const estimatedCorrectQuestions = Math.min(currentTotalCorrect, distinctAnswered);
      const recomputedPoints = estimatedCorrectQuestions * CLASSIC_BASE_POINTS;
      const currentPoints = user.stats?.totalPoints || 0;

      if (recomputedPoints === currentPoints) continue;

      const existingAchievements = user.achievements || [];
      const keptAchievements = existingAchievements.filter((achievement) => {
        const rule = POINTS_ACHIEVEMENTS.find((p) => p.key === achievement.key);
        if (!rule) return true;
        return recomputedPoints >= rule.threshold;
      });
      const removedAchievements = existingAchievements
        .map((achievement) => achievement.key)
        .filter((key) => !keptAchievements.some((kept) => kept.key === key));

      changes.push({
        userId: String(user._id),
        username: user.username,
        currentPoints,
        recomputedPoints,
        removedAchievements,
      });

      if (!dryRun) {
        await User.updateOne(
          { _id: user._id },
          { $set: { 'stats.totalPoints': recomputedPoints, achievements: keptAchievements } }
        );
      }
    }

    console.log(
      dryRun ? `[dry-run] ${changes.length} user(s) would change:` : `Updated ${changes.length} user(s):`
    );
    for (const change of changes) {
      const achievementNote = change.removedAchievements.length
        ? `, removing achievements: ${change.removedAchievements.join(', ')}`
        : '';
      console.log(
        `  ${change.username} (${change.userId}): ${change.currentPoints} -> ${change.recomputedPoints}${achievementNote}`
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('resetFarmedPoints failed:', error);
  process.exit(1);
});
