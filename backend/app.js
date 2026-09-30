require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const logger = require('./config/logger');
const { configureTrustProxy } = require('./config/trustProxy');
const { resolveMongoUri, redactMongoUri, MISSING_MONGO_URI_MESSAGE } = require('./config/mongoUri');
const optionalAuthenticate = require('./middleware/optionalAuth');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { setupSwagger } = require('./docs/swagger');
const { setupMetrics } = require('./observability/metrics');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authV1Routes = require('./routes/v1/authRoutes');
const userV1Routes = require('./routes/v1/userRoutes');
const questionV1Routes = require('./routes/v1/questionRoutes');
const challengeV1Routes = require('./routes/v1/challengeRoutes');
const adminV1Routes = require('./routes/v1/adminRoutes');
const contactV1Routes = require('./routes/v1/contactRoutes');
const quizV1Routes = require('./routes/v1/quizRoutes');

const app = express();

// Must be set before any middleware/route relies on req.ip (the rate
// limiters below do) — see backend/config/trustProxy.js and docs/AUDIT.md
// item 15.
configureTrustProxy(app);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.CLIENT_URI,
  process.env.API_URI
].filter(Boolean); 

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// Explicit CSP rather than helmet's bare default (docs/AUDIT.md Phase 4,
// "Review the Helmet configuration"). This backend serves almost no HTML —
// JSON everywhere except Swagger UI at /api-docs (off in production unless
// ENABLE_API_DOCS=true, see docs/swagger.js). Swagger UI loads all of its
// scripts as external files, so scripts are 'self' only; its page does ship
// inline <style> blocks, hence 'unsafe-inline' for styles alone. The actual
// frontend is a separate Express app (frontend/app.js) with its own CSP.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req: (req) => ({ ...req, url: logger.redactUrl(req.url) }),
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

// Keyed by user ID for authenticated requests and by IP for guests (not
// just for session creation — see docs/AUDIT.md Phase 3 follow-up): a
// shared IP is the normal case for guests specifically (a classroom or
// office behind one NAT/proxy address), so it gets a much higher budget
// than any one legitimate authenticated user should need. Requires
// optionalAuthenticate to run first so req.user is populated when the key
// is computed.
const GENERAL_LIMIT_PER_USER = 300;
const GENERAL_LIMIT_PER_GUEST_IP = 1000;
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => (req.user?.userId ? GENERAL_LIMIT_PER_USER : GENERAL_LIMIT_PER_GUEST_IP),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.userId ? `user:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip)}`),
});

// A factory, not a single shared instance: each mount below gets its own
// independent counter, so hammering one auth endpoint from an IP doesn't
// also lock that IP out of unrelated auth endpoints.
function createAuthLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  });
}

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent. Please try again later.' },
});

app.use('/api', optionalAuthenticate);
app.use('/api', generalLimiter);
app.use('/api/v1/admin/login', createAuthLimiter());
app.use('/api/v1/auth/login', createAuthLimiter());
app.use('/api/v1/auth/register', createAuthLimiter());
app.use('/api/v1/auth/forgot-password', createAuthLimiter());
app.use('/api/v1/auth/reset-password', createAuthLimiter());
app.use('/api/v1/contact', contactLimiter);

const mongoUri = process.env.SKIP_DB_CONNECT === 'true' ? undefined : resolveMongoUri();
if (!mongoUri && process.env.SKIP_DB_CONNECT !== 'true') {
  console.error(`❌ ${MISSING_MONGO_URI_MESSAGE}`);
  process.exit(1);
}

if (!process.env.JWT_SECRET && process.env.SKIP_DB_CONNECT !== 'true') {
  console.error('❌ Missing JWT_SECRET in .env file');
  process.exit(1);
}

// Not a hard failure like the checks above: only the Daily Challenge
// feature needs this secret (see docs/AUDIT.md Phase 2 addendum for why),
// and it must never silently fall back to a predictable default. The
// Daily Challenge endpoints themselves return a 503 while it is missing
// and a new day's question set needs to be generated.
if (!process.env.DAILY_CHALLENGE_SEED_SECRET) {
  logger.warn(
    "⚠️  DAILY_CHALLENGE_SEED_SECRET is not set — the Daily Challenge will be unavailable " +
      "once a new day's question set needs to be generated. See backend/env.example."
  );
}

if (process.env.SKIP_DB_CONNECT !== 'true') {
  mongoose
    .connect(mongoUri)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) =>
      console.error('❌ MongoDB connection error:', redactMongoUri(err.message))
    );
}

setupSwagger(app);
setupMetrics(app);

// Versioned API with layered architecture and standardized responses.
app.use('/api/v1/auth', authV1Routes);
app.use('/api/v1/users', userV1Routes);
app.use('/api/v1/questions', questionV1Routes);
app.use('/api/v1/challenges', challengeV1Routes);
app.use('/api/v1/admin', adminV1Routes);
app.use('/api/v1/contact', contactV1Routes);
app.use('/api/v1/quiz', quizV1Routes);

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
});

app.get('/readyz', (req, res) => {
  const isReady =
    process.env.SKIP_DB_CONNECT === 'true' ||
    mongoose.connection.readyState === 1;
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    dbState: mongoose.connection.readyState,
  });
});

app.get('/', (req, res) => {
  res.send('🚀 Welcome to the PyQuiz backend!');
});

app.get('/password_reset_link_success.html', (req, res) => {
  const clientUri = process.env.CLIENT_URI || 'http://localhost:3000';
  res.redirect(`${clientUri}/password_reset_link_success.html`);
});

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      try {
        if (process.env.SKIP_DB_CONNECT !== 'true') {
          await mongoose.connection.close();
        }
      } catch (error) {
        logger.error({ error }, 'Error while closing database connection');
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
