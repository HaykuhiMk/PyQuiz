const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../core/AppError');
const userRepository = require('../repositories/userRepository');

// Compared against when the username doesn't exist, so an unknown username
// costs the same bcrypt work as a wrong password and the two can't be told
// apart by response time either.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-admin-password', 10);

async function loginAdmin({ username, password }) {
  const admin = await userRepository.findAdminByUsername(username);

  // One generic answer for an unknown username and a wrong password, so the
  // login form can't be used to discover which admin usernames exist.
  const isMatch = await bcrypt.compare(password, admin ? admin.password : DUMMY_PASSWORD_HASH);
  if (!admin || !isMatch) {
    throw new AppError('Invalid credentials', 401);
  }

  const token = jwt.sign(
    { id: admin._id, username: admin.username, role: 'admin', tokenVersion: admin.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return {
    token,
    admin: { id: admin._id, username: admin.username },
  };
}

module.exports = { loginAdmin };
