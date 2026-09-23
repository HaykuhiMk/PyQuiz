const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

function cacheMiddleware(cacheKey, ttlSeconds = 60) {
  return async (req, res, next) => {
    const client = getRedisClient();
    if (!client) {
      return next();
    }

    try {
      if (client.status !== 'ready') {
        await client.connect();
      }

      const cached = await client.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const originalJson = res.json.bind(res);
      res.json = async (payload) => {
        try {
          await client.set(cacheKey, JSON.stringify(payload), 'EX', ttlSeconds);
        } catch (error) {
          logger.warn({ error }, 'Cache write failed');
        }
        return originalJson(payload);
      };

      return next();
    } catch (error) {
      logger.warn({ error }, 'Cache middleware bypassed due to Redis issue');
      return next();
    }
  };
}

module.exports = cacheMiddleware;
