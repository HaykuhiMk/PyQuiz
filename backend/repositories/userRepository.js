const User = require('../models/user');

async function findByEmail(email) {
  return User.findOne({ email });
}

async function findById(userId) {
  return User.findById(userId);
}

async function findAdminByUsername(username) {
  return User.findOne({ username, role: 'admin' });
}

async function createUser(payload) {
  return User.create(payload);
}

async function saveUser(user) {
  return user.save();
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

async function setBanned(userId, banned) {
  return User.findByIdAndUpdate(userId, { banned }, { new: true }).select(
    'username email role banned'
  );
}

module.exports = {
  findByEmail,
  findById,
  findAdminByUsername,
  createUser,
  saveUser,
  deleteById,
  findLeaderboard,
  findAllUsers,
  countUsers,
  setBanned,
};
