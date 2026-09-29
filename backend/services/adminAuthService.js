const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../core/AppError');
const userRepository = require('../repositories/userRepository');

async function loginAdmin({ username, password }) {
  const admin = await userRepository.findAdminByUsername(username);
  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
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
