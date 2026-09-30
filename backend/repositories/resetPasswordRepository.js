const ResetPassword = require('../models/resetPassword');

async function upsertResetKeyHash(email, resetKeyHash) {
  return ResetPassword.findOneAndUpdate(
    { email },
    { resetKeyHash, createdAt: Date.now() },
    { upsert: true, new: true }
  );
}

async function findByResetKeyHash(resetKeyHash) {
  return ResetPassword.findOne({ resetKeyHash });
}

async function deleteByResetKeyHash(resetKeyHash) {
  return ResetPassword.deleteOne({ resetKeyHash });
}

async function deleteByEmail(email) {
  return ResetPassword.deleteMany({ email });
}

module.exports = {
  deleteByEmail,
  upsertResetKeyHash,
  findByResetKeyHash,
  deleteByResetKeyHash,
};
