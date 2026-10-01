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
const { rateLimitsBypassed, warnAboutRateLimitBypass } = require('./config/rateLimitBypass');
const rateLimitHandler = require('./middleware/rateLimitHandler');
const { errorResponse } = require('./core/apiResponse');
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
const validationRulesV1Routes = require('./routes/v1/validationRulesRoutes');
const topicV1Routes = require('./routes/v1/topicRoutes');
const conceptGraphV1Routes = require('./routes/v1/conceptGraphRoutes');
const pythonVersionV1Routes = require('./routes/v1/pythonVersionRoutes');
const { allowedOrigins: corsAllowedOrigins } = require('./config/corsOrigins');

const app = express();

// Must be set before any middleware/route relies on req.ip (the rate
// limiters below do) — see backend/config/trustProxy.js and docs/AUDIT.md
// item 15.
configureTrustProxy(app);
warnAboutRateLimitBypass();

const allowedOrigins = corsAllowedOrigins();
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URI) {
  logger.warn('CLIENT_URI is not set: in production no browser origin may call the API.');
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  // No Authorization header: browser clients authenticate only through the
  // httpOnly session cookies (/metrics is scraped server-to-server).
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
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
// The profile route carries the avatar as a data URL of up to 500,000
// characters (services/userService.js), far above express.json()'s 100 kB
// default, which used to reject any real photo with a bare 413 before the
// service's "Image is too large" check could run. It gets its own 1 MB
// parser, mounted first so the global parser below skips it (body-parser
// won't re-parse a body); every other route keeps the 100 kB default.
// Bodies over 1 MB are still refused with 413.
app.use('/api/v1/users/settings/profile', express.json({ limit: '1mb' }));
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
  skip: rateLimitsBypassed,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.userId ? `user:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip)}`),
  handler: rateLimitHandler('Too many requests. Please try again later.'),
});

// A factory, not a single shared instance: each mount below gets its own
// independent counter, so hammering one auth endpoint from an IP doesn't
// also lock that IP out of unrelated auth endpoints.
function createAuthLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skip: rateLimitsBypassed,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler('Too many attempts. Please try again later.'),
  });
}

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: rateLimitsBypassed,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many messages sent. Please try again later.'),
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
app.use('/api/v1/validation-rules', validationRulesV1Routes);
app.use('/api/v1/topics', topicV1Routes);
app.use('/api/v1/concept-graph', conceptGraphV1Routes);
app.use('/api/v1/python-version', pythonVersionV1Routes);
app.use('/api/v1/quiz', quizV1Routes);

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
});

app.get('/readyz', (req, res) => {
  const isReady =
    process.env.SKIP_DB_CONNECT === 'true' ||
    mongoose.connection.readyState === 1;
  const dbState = mongoose.connection.readyState;
  if (!isReady) {
    return res.status(503).json(errorResponse('Service not ready.', { ready: false, dbState }));
  }
  return res.json({ ready: true, dbState });
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
