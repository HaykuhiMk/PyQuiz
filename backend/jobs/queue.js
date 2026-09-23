const { Queue, Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

function getQueue(name) {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  return new Queue(name, { connection: client });
}

function createWorker(name, processor) {
  const client = getRedisClient();
  if (!client) {
    logger.warn('Redis is not configured. Worker will not start.');
    return null;
  }

  return new Worker(name, processor, { connection: client });
}

module.exports = {
  getQueue,
  createWorker,
};
