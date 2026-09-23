require('dotenv').config();
const mongoose = require('mongoose');
const { spawn } = require('child_process');
const path = require('path');

async function isMongoReachable(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    await mongoose.disconnect();
    return true;
  } catch {
    return false;
  }
}

async function startMemoryMongo() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('pyquiz');
  console.log(`Using in-memory MongoDB at ${uri}`);
  return { uri, mongod };
}

function runSeed() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'database', 'json_to_mongo.js')], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Seed failed with code ${code}`))));
  });
}

async function main() {
  let memoryServer = null;
  const configuredUri = process.env.MONGO_URI;

  if (!(await isMongoReachable(configuredUri))) {
    console.warn(`MongoDB not reachable at ${configuredUri}`);
    const memory = await startMemoryMongo();
    process.env.MONGO_URI = memory.uri;
    memoryServer = memory.mongod;
  } else {
    console.log(`Connected to MongoDB at ${configuredUri}`);
  }

  try {
    await runSeed();
  } catch (error) {
    console.warn('Seed step warning:', error.message);
  }

  const app = require('../app');
  const logger = require('../config/logger');
  const PORT = process.env.PORT || 7498;

  const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      try {
        await mongoose.connection.close();
      } catch (error) {
        logger.error({ error }, 'Error while closing database connection');
      }
      if (memoryServer) {
        await memoryServer.stop();
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start dev server:', error);
  process.exit(1);
});
