const Redis = require('ioredis');
const logger = require('./logger');

let redisClient = null;

function getRedisClient() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  redisClient.on('error', (error) => {
    logger.error({ error }, 'Redis connection error');
  });

  return redisClient;
}

module.exports = {
  getRedisClient,
};
