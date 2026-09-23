const ResetPassword = require('../models/resetPassword');

async function upsertResetKey(email, resetKey) {
  return ResetPassword.findOneAndUpdate(
    { email },
    { resetKey, createdAt: Date.now() },
    { upsert: true, new: true }
  );
}

async function findByResetKey(resetKey) {
  return ResetPassword.findOne({ resetKey });
}

async function deleteByResetKey(resetKey) {
  return ResetPassword.deleteOne({ resetKey });
}

module.exports = {
  upsertResetKey,
  findByResetKey,
  deleteByResetKey,
};
