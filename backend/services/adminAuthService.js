const jwt = require('jsonwebtoken');
const AppError = require('../core/AppError');
const userRepository = require('../repositories/userRepository');
const { passwordMatchesAccount } = require('../utils/passwordCheck');

async function loginAdmin({ username, password }) {
  const admin = await userRepository.findAdminByUsername(username);

  // One generic answer for an unknown username and a wrong password, with the
  // same bcrypt work either way, so the login form can't be used to discover
  // which admin usernames exist.
  if (!(await passwordMatchesAccount(password, admin))) {
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
