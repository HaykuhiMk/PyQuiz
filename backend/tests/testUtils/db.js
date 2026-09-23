const mongoose = require('mongoose');

const FALLBACK_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/pyquiz_test';

let mongod;

async function connect() {
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  } catch (error) {
    // mongodb-memory-server's bundled binary doesn't run in every environment
    // (e.g. it can SIGABRT on some local setups). Fall back to a real local
    // MongoDB using a dedicated, isolated test database so tests still run.
    console.warn(`mongodb-memory-server unavailable (${error.message}), using ${FALLBACK_URI}`);
    mongod = null;
    await mongoose.connect(FALLBACK_URI);
  }
}

async function clearDatabase() {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

async function closeDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) {
    await mongod.stop();
  }
}

module.exports = { connect, clearDatabase, closeDatabase };
