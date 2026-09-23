const AppError = require('../core/AppError');
const userRepository = require('../repositories/userRepository');

async function listUsers({ page = 1, limit = 20 } = {}) {
  const [users, total] = await Promise.all([
    userRepository.findAllUsers({ page, limit }),
    userRepository.countUsers(),
  ]);

  return {
    users,
    meta: {
      total,
      page,
      limit,
      totalPages: total ? Math.ceil(total / limit) : 0,
      hasNextPage: page * limit < total,
    },
  };
}

async function setUserBanned(userId, banned) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Admin accounts always have role: 'admin', so this also covers an admin
  // trying to ban their own account.
  if (user.role === 'admin') {
    throw new AppError('Admin accounts cannot be banned', 403);
  }

  const updated = await userRepository.setBanned(userId, banned);
  return updated;
}

module.exports = { listUsers, setUserBanned };
