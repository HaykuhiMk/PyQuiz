require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const logger = require('./config/logger');
const { setupSwagger } = require('./docs/swagger');
const { setupMetrics } = require('./observability/metrics');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const dashboardRoutes = require('./routes/dashboard');
const authV1Routes = require('./routes/v1/authRoutes');
const userV1Routes = require('./routes/v1/userRoutes');
const questionV1Routes = require('./routes/v1/questionRoutes');
const challengeV1Routes = require('./routes/v1/challengeRoutes');
const adminV1Routes = require('./routes/v1/adminRoutes');
const contactV1Routes = require('./routes/v1/contactRoutes');

const app = express();

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

app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(express.static(path.join(__dirname, 'public')));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
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

app.use('/api', generalLimiter);
app.use('/api/v1/admin/login', createAuthLimiter());
app.use('/api/v1/auth/login', createAuthLimiter());
app.use('/api/v1/auth/register', createAuthLimiter());
app.use('/api/v1/auth/forgot-password', createAuthLimiter());
app.use('/api/v1/auth/reset-password', createAuthLimiter());
app.use('/api/v1/contact', contactLimiter);

if (!process.env.MONGO_URI && process.env.SKIP_DB_CONNECT !== 'true') {
  console.error('❌ Missing MONGO_URI in .env file');
  process.exit(1);
}

if (!process.env.JWT_SECRET && process.env.SKIP_DB_CONNECT !== 'true') {
  console.error('❌ Missing JWT_SECRET in .env file');
  process.exit(1);
}

if (process.env.SKIP_DB_CONNECT !== 'true') {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));
}

setupSwagger(app);
setupMetrics(app);

app.use('/api', dashboardRoutes);

// Versioned API with layered architecture and standardized responses.
app.use('/api/v1/auth', authV1Routes);
app.use('/api/v1/users', userV1Routes);
app.use('/api/v1/questions', questionV1Routes);
app.use('/api/v1/challenges', challengeV1Routes);
app.use('/api/v1/admin', adminV1Routes);
app.use('/api/v1/contact', contactV1Routes);

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
