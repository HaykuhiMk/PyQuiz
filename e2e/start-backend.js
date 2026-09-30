// Starts a throwaway backend for the Playwright smoke suite: a dedicated
// local database (pyquiz_e2e) is dropped, re-seeded from
// backend/database/questions.json, and served on E2E_API_PORT. Refuses to
// touch anything that isn't a local *_e2e database, so it can never reset
// development or production data.
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND = path.join(__dirname, '..', 'backend');
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));

const MONGODB_URI = process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27017/pyquiz_e2e';
const PORT = Number(process.env.E2E_API_PORT || 7598);
const FRONTEND_ORIGIN = `http://localhost:${process.env.E2E_FRONTEND_PORT || 3998}`;

function assertSafeTarget(uri) {
  const { hostname, pathname } = new URL(uri);
  if (!['127.0.0.1', 'localhost'].includes(hostname) || !pathname.slice(1).endsWith('_e2e')) {
    throw new Error(`Refusing to reset ${uri}: e2e only runs against a local *_e2e database.`);
  }
}

async function main() {
  assertSafeTarget(MONGODB_URI);

  await mongoose.connect(MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  const seed = spawnSync(process.execPath, ['database/json_to_mongo.js'], {
    cwd: BACKEND,
    env: { ...process.env, MONGODB_URI },
    stdio: 'inherit',
  });
  if (seed.status !== 0) throw new Error('Seeding the e2e database failed.');

  // One admin account for the admin-page tests (see tests/fixtures.js).
  const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcryptjs'));
  await mongoose.connect(MONGODB_URI);
  await mongoose.connection.collection('users').insertOne({
    username: 'e2eadmin',
    usernameLower: 'e2eadmin',
    email: 'e2eadmin@example.com',
    password: await bcrypt.hash('Passw0rd!', 10),
    role: 'admin',
    banned: false,
    tokenVersion: 0,
  });
  await mongoose.disconnect();

  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGODB_URI,
    JWT_SECRET: 'e2e-jwt-secret',
    DAILY_CHALLENGE_SEED_SECRET: 'e2e-daily-seed',
    CLIENT_URI: FRONTEND_ORIGIN,
    TRUST_PROXY: '',
    LOG_LEVEL: 'warn',
    // Never send real email from the e2e run, whatever backend/.env holds
    // (dotenv does not override variables that are already set).
    EMAIL_USER: '',
    EMAIL_PASS: '',
  });
  const app = require(path.join(BACKEND, 'app'));
  app.listen(PORT, () => console.log(`e2e backend listening on ${PORT}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
