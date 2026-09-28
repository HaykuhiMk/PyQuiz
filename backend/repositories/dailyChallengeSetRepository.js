const DailyChallengeSet = require('../models/dailyChallengeSet');

async function findByDate(date) {
  return DailyChallengeSet.findOne({ date }).lean();
}

// Atomic "create if missing": if two concurrent first-requests-of-the-day
// both try to freeze a set, the unique index on `date` rejects the loser,
// which just reads back the winner's set instead of erroring.
async function createIfMissing(date, questionIds) {
  try {
    return await DailyChallengeSet.create({ date, questionIds });
  } catch (error) {
    if (error.code === 11000) {
      return DailyChallengeSet.findOne({ date }).lean();
    }
    throw error;
  }
}

module.exports = { findByDate, createIfMissing };
