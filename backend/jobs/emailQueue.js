const { getQueue } = require('./queue');
const logger = require('../config/logger');

const EMAIL_QUEUE = 'email-jobs';

async function enqueuePasswordResetEmail(payload) {
  const queue = getQueue(EMAIL_QUEUE);
  if (!queue) {
    logger.warn('Email queue unavailable (Redis not configured).');
    return;
  }

  await queue.add('password-reset', payload, {
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

module.exports = {
  enqueuePasswordResetEmail,
  EMAIL_QUEUE,
};
