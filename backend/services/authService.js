const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../core/AppError');
const userRepository = require('../repositories/userRepository');
const resetPasswordRepository = require('../repositories/resetPasswordRepository');
const { sendPasswordResetEmail } = require('../utils/emailUtils');

const GENERIC_RESET_MESSAGE = 'If this email exists, a password reset link has been sent.';

async function registerUser({ username, email, password }) {
  const existingUser = await userRepository.findByEmail(email);
  if (existingUser) {
    throw new AppError('Email already exists.', 400);
  }

  // Case-insensitive: "Alice" and "alice" collide (docs/AUDIT.md item 9 /
  // Phase 3 addendum). The unique index on usernameLower is the actual
  // guarantee; this check exists to turn a race-condition duplicate into a
  // clean 400 instead of a raw MongoDB duplicate-key error.
  const existingUsername = await userRepository.findByUsernameLower(username.trim().toLowerCase());
  if (existingUsername) {
    throw new AppError('Username already exists.', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await userRepository.createUser({
    username,
    email,
    password: hashedPassword,
  });
}

async function loginUser({ email, password }) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError('Invalid credentials', 401);
  }

  if (user.banned) {
    throw new AppError('This account has been suspended.', 403);
  }

  const token = jwt.sign(
    { userId: user._id, email: user.email, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return {
    token,
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
    },
  };
}

// Backs GET /api/v1/auth/me (docs/AUDIT.md Phase 4, item 12): lets the
// frontend confirm a session is actually still valid server-side instead of
// inferring it from a cookie that outlives a revoked or expired JWT.
async function getSessionUser(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found.', 404);
  }
  return { id: user._id, email: user.email, username: user.username };
}

function hashResetKey(resetKey) {
  return crypto.createHash('sha256').update(resetKey).digest('hex');
}

async function requestPasswordReset(email) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    // Same response whether or not the account exists, to avoid leaking
    // which emails are registered.
    return { message: GENERIC_RESET_MESSAGE };
  }

  // Only the hash is stored (docs/AUDIT.md Phase 4, item 14) — the plaintext
  // key exists only in this email and in the reset request that redeems it.
  const resetKey = crypto.randomBytes(20).toString('hex');
  await resetPasswordRepository.upsertResetKeyHash(email, hashResetKey(resetKey));

  const clientUri = process.env.CLIENT_URI || 'http://localhost:3000';
  const resetUrl = `${clientUri}/reset_password.html?resetKey=${resetKey}`;
  await sendPasswordResetEmail(email, resetUrl);

  return { message: GENERIC_RESET_MESSAGE };
}

async function resetPassword(resetKey, newPassword) {
  const resetKeyHash = hashResetKey(resetKey);
  const resetEntry = await resetPasswordRepository.findByResetKeyHash(resetKeyHash);
  if (!resetEntry) {
    throw new AppError('Invalid or expired reset key.', 400);
  }

  // The lookup above is already an exact match on the hash; this recompares
  // it with a constant-time comparison rather than trusting the query's own
  // equality check, per the explicit requirement that this be compared with
  // crypto.timingSafeEqual (docs/AUDIT.md Phase 4, item 14).
  const stored = Buffer.from(resetEntry.resetKeyHash, 'hex');
  const provided = Buffer.from(resetKeyHash, 'hex');
  if (stored.length !== provided.length || !crypto.timingSafeEqual(stored, provided)) {
    throw new AppError('Invalid or expired reset key.', 400);
  }

  const user = await userRepository.findByEmail(resetEntry.email);
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  user.password = await bcrypt.hash(newPassword, 10);
  // Invalidates any session issued before the reset (docs/AUDIT.md Phase 4,
  // item 10) — most relevant here since a password reset often means the
  // old password (and any session logged in with it) may be compromised.
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await userRepository.saveUser(user);
  await resetPasswordRepository.deleteByResetKeyHash(resetKeyHash);

  return { message: 'Password successfully reset.' };
}

module.exports = {
  registerUser,
  loginUser,
  getSessionUser,
  requestPasswordReset,
  resetPassword,
};
