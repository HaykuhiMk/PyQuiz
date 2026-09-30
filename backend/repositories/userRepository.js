const User = require('../models/user');

// Avatar can be up to 500KB and is only ever needed by getUserProfile
// (docs/AUDIT.md item 9) — excluded by default so it isn't loaded on every
// other lookup (in particular applyAnswerOutcome, called on every answer).
// A `.select('-avatar')`-projected document can still have `avatar` set and
// saved normally; Mongoose only omits it from what's read, not what's
// writable.
async function findByEmail(email) {
  return User.findOne({ email }).select('-avatar');
}

async function findById(userId) {
  return User.findById(userId).select('-avatar');
}

async function findByIdWithAvatar(userId) {
  return User.findById(userId);
}

// Minimal projection for the per-request tokenVersion check in
// authenticateToken/verifyAdmin (docs/AUDIT.md Phase 4) — runs on every
// authenticated request, so it reads only what that check needs.
async function findAuthFields(userId) {
  return User.findById(userId).select('tokenVersion banned role').lean();
}

async function findByUsernameLower(usernameLower) {
  return User.findOne({ usernameLower }).select('-avatar');
}

async function findAdminByUsername(username) {
  return User.findOne({ username, role: 'admin' }).select('-avatar');
}

async function createUser(payload) {
  return User.create(payload);
}

async function saveUser(user) {
  return user.save();
}

// Records today's daily-challenge result only if it hasn't been recorded
// yet, in one atomic update, so two concurrent submissions can't both
// award points. Resolves to null when today's challenge is already done.
async function claimDailyChallenge(userId, dateKey, { score, total, points }) {
  const now = new Date();
  return User.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ 'dailyChallenge.date': { $ne: dateKey } }, { 'dailyChallenge.completedAt': null }],
    },
    {
      $set: {
        dailyChallenge: { date: dateKey, score, total, completedAt: now },
        'stats.lastAnsweredAt': now,
      },
      $inc: { 'stats.totalPoints': points },
    },
    { new: true }
  );
}

async function deleteById(userId) {
  return User.findByIdAndDelete(userId);
}

async function findLeaderboard(limit = 50) {
  return User.find({})
    .select('username stats.totalPoints stats.bestStreak stats.totalCorrect achievements')
    .sort({ 'stats.totalPoints': -1, 'stats.bestStreak': -1, username: 1 })
    .limit(limit)
    .lean();
}

async function findAllUsers({ page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  return User.find({})
    .select('username email role banned stats.totalPoints stats.totalAnswered')
    .sort({ _id: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function countUsers() {
  return User.countDocuments({});
}

// Banning also bumps tokenVersion so any session the user already holds
// stops working immediately, rather than waiting out its own expiry
// (docs/AUDIT.md Phase 4) — unbanning does not, since there is nothing to
// invalidate in that direction.
async function setBanned(userId, banned) {
  const update = banned ? { banned, $inc: { tokenVersion: 1 } } : { banned };
  return User.findByIdAndUpdate(userId, update, { new: true }).select(
    'username email role banned'
  );
}

module.exports = {
  findByEmail,
  findById,
  findByIdWithAvatar,
  findAuthFields,
  findByUsernameLower,
  findAdminByUsername,
  createUser,
  saveUser,
  claimDailyChallenge,
  deleteById,
  findLeaderboard,
  findAllUsers,
  countUsers,
  setBanned,
};
