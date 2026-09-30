const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { TOPIC_IDS } = require('../config/topicTaxonomy');
const { QUIZ_MODES } = require('../config/quizConfig');
const { MISCONCEPTION_IDS } = require('../config/conceptGraph');
const { DISTRACTOR_FEEDBACK_MAX_LENGTH } = require('../config/validationRules');

// The per-endpoint docs live as `@openapi` JSDoc blocks directly above each
// route in routes/v1/*.js, which swagger-jsdoc reads from disk at startup.
// Resolved from this file's own location so it works from any cwd.
//
// Production-bundle limitation: `npm run build` bundles the app with webpack
// into dist/server.js, where comments are stripped and __dirname is left as
// the real dist/ directory. The glob below then resolves to
// <dist>/../routes/v1/*.js, so the endpoint docs only appear if the source
// route files are deployed next to dist/ (as they are when the whole
// backend/ directory is shipped). If only dist/ is deployed, swagger-jsdoc
// finds no files and /api-docs shows just the operational endpoints defined
// inline below — no crash. Also note webpack's production mode inlines
// process.env.NODE_ENV as 'production' in the bundle, so there /api-docs is
// only served with ENABLE_API_DOCS=true, whatever NODE_ENV is at runtime.
const ROUTE_FILES_GLOB = path.join(__dirname, '..', 'routes', 'v1', '*.js');

const envelope = (dataSchema = { type: 'object' }) => ({
  type: 'object',
  required: ['success', 'data', 'error', 'meta'],
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
    error: { type: 'object', nullable: true, example: null },
    meta: { type: 'object' },
  },
});

const errorContent = {
  'application/json': { schema: { $ref: '#/components/schemas/ApiError' } },
};

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PyQuiz API',
      version: '1.0.0',
      description:
        'API documentation for PyQuiz backend services.\n\n' +
        'Responses use the envelope `{ success, data, error, meta }`. Every error response, including ' +
        'authentication failures and every rate limiter, goes through the central error handler and ' +
        'uses the same envelope with `success: false` and `error: { message, details }` (see the ' +
        '`ApiError` schema).\n\n' +
        'Regular-user sessions ride the httpOnly cookie `token` (`__Host-token` in production); admin ' +
        'sessions ride a separate httpOnly cookie `adminToken` (`__Host-adminToken` in production). ' +
        'State-changing authenticated routes also require the `X-CSRF-Token` header, an HMAC bound to ' +
        'the matching session cookie, returned as `csrfToken` by the login and `/me` endpoints.\n\n' +
        'Every `/api` route is subject to a general rate limit (15-minute window: 300 requests per ' +
        'authenticated user, 1000 per guest IP).',
    },
    servers: [{ url: '/api/v1' }],
    tags: [
      {
        name: 'Auth',
        description: 'Regular-user registration, login and password reset',
      },
      {
        name: 'Users',
        description: 'Profile, progress, leaderboard and account settings',
      },
      {
        name: 'Questions',
        description: 'Public question browsing, study mode and answer checking',
      },
      {
        name: 'Quiz',
        description: 'Server-authoritative quiz sessions (guests allowed)',
      },
      { name: 'Challenges', description: 'Daily Challenge' },
      { name: 'Contact', description: 'Contact form' },
      { name: 'Config', description: 'Rules shared with the frontend' },
      {
        name: 'Admin',
        description: 'Admin session, users, contacts and question management',
      },
      {
        name: 'Operations',
        description: 'Health, readiness and metrics (served outside /api/v1)',
      },
    ],
    components: {
      securitySchemes: {
        userCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description:
            'httpOnly regular-user session cookie (a 1h JWT) set by POST /auth/login. Named ' +
            '`__Host-token` in production. This cookie is the only way to authenticate as a user; an ' +
            '`Authorization` header is ignored.',
        },
        adminCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'adminToken',
          description:
            'httpOnly admin session cookie (a 1h JWT with role=admin) set by POST /admin/login. ' +
            'Named `__Host-adminToken` in production. No Authorization header is accepted, and the ' +
            'regular-user cookie never grants admin access.',
        },
        csrfHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description:
            'HMAC-SHA256 of the matching session cookie (user or admin), returned as `csrfToken` ' +
            'by the login and `/me` endpoints (and also set as the non-httpOnly `csrfToken` / ' +
            '`adminCsrfToken` cookie). Required on state-changing authenticated routes.',
        },
        metricsBearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Only enforced in production: `Authorization: Bearer <METRICS_TOKEN>`.',
        },
      },
      schemas: {
        ApiSuccess: envelope(),
        ApiError: {
          type: 'object',
          required: ['success', 'data', 'error', 'meta'],
          properties: {
            success: { type: 'boolean', example: false },
            data: { type: 'object', nullable: true, example: null },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Validation failed' },
                details: {
                  type: 'object',
                  nullable: true,
                  description:
                    'For validation failures: Zod `flatten()` output (`formErrors`, `fieldErrors`).',
                },
              },
            },
            meta: { type: 'object' },
          },
        },
        Message: envelope({
          type: 'object',
          properties: { message: { type: 'string' } },
        }),
        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
          },
        },
        PaginatedList: {
          allOf: [
            envelope({ type: 'array', items: { type: 'object' } }),
            {
              type: 'object',
              properties: { meta: { $ref: '#/components/schemas/PaginationMeta' } },
            },
          ],
        },
        Difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        Topic: {
          type: 'string',
          enum: TOPIC_IDS,
          description: 'Stable topic id (never changes). Display names come from GET /topics.',
        },
        TopicEntry: {
          type: 'object',
          properties: {
            id: { $ref: '#/components/schemas/Topic' },
            name: { type: 'string', description: 'Display name (may change).' },
          },
        },
        MisconceptionId: {
          type: 'string',
          enum: MISCONCEPTION_IDS,
          description: 'Stable misconception id, `<topic id>.<wrong belief>` (GET /concept-graph).',
        },
        ConceptGraph: {
          type: 'object',
          properties: {
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Stable topic id.' },
                  name: { type: 'string', description: 'Display name (may change).' },
                  description: { type: 'string' },
                  status: {
                    type: 'string',
                    enum: ['active', 'planned'],
                    description: '`planned`: in the graph, not yet accepted on questions.',
                  },
                },
              },
            },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                description: '`from` must come first (a prerequisite of `to`).',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  reason: { type: 'string' },
                },
              },
            },
            misconceptions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { $ref: '#/components/schemas/MisconceptionId' },
                  topic: { type: 'string', description: 'The topic whose correct model fixes it.' },
                  belief: { type: 'string', description: 'The wrong belief.' },
                  correctModel: { type: 'string' },
                },
              },
            },
          },
        },
        Distractor: {
          type: 'object',
          description:
            'Tags one WRONG option (matched by its exact text) with a misconception and/or short ' +
            'feedback. Admin-only: never returned to learners.',
          required: ['option'],
          properties: {
            option: { type: 'string', minLength: 1, description: 'Text of a wrong option.' },
            misconceptionId: { $ref: '#/components/schemas/MisconceptionId' },
            feedback: { type: 'string', minLength: 1, maxLength: DISTRACTOR_FEEDBACK_MAX_LENGTH },
          },
        },
        QuizMode: { type: 'string', enum: QUIZ_MODES },
        ObjectId: {
          type: 'string',
          pattern: '^[a-fA-F0-9]{24}$',
          example: '64b7f0c2a1b2c3d4e5f60718',
        },
        NewQuestion: {
          type: 'object',
          description:
            '`answer` must be one of `options`; `primaryTopic` must not also appear in `secondaryTopics`.',
          required: [
            'question',
            'options',
            'answer',
            'difficulty',
            'primaryTopic',
            'explanation',
          ],
          properties: {
            question: { type: 'string', minLength: 5 },
            code: { type: 'string', default: '' },
            options: {
              type: 'array',
              minItems: 2,
              items: { type: 'string', minLength: 1 },
            },
            answer: { type: 'string', minLength: 1 },
            difficulty: { $ref: '#/components/schemas/Difficulty' },
            primaryTopic: { $ref: '#/components/schemas/Topic' },
            secondaryTopics: {
              type: 'array',
              default: [],
              items: { $ref: '#/components/schemas/Topic' },
            },
            explanation: { type: 'string', minLength: 1 },
            distractors: {
              type: 'array',
              default: [],
              description: 'At most one entry per wrong option; each needs `misconceptionId` or `feedback`.',
              items: { $ref: '#/components/schemas/Distractor' },
            },
          },
        },
        QuestionUpdate: {
          type: 'object',
          minProperties: 1,
          description:
            'At least one field. After merging with the stored question, `answer` must be one of ' +
            '`options` and `primaryTopic` must not appear in `secondaryTopics`.',
          properties: {
            question: { type: 'string', minLength: 5 },
            code: { type: 'string' },
            options: {
              type: 'array',
              minItems: 2,
              items: { type: 'string', minLength: 1 },
            },
            answer: { type: 'string', minLength: 1 },
            difficulty: { $ref: '#/components/schemas/Difficulty' },
            primaryTopic: { $ref: '#/components/schemas/Topic' },
            secondaryTopics: {
              type: 'array',
              items: { $ref: '#/components/schemas/Topic' },
            },
            explanation: { type: 'string', minLength: 1 },
            distractors: {
              type: 'array',
              description:
                'Replaces all stored distractors. After merging, each must name a wrong option of the ' +
                'merged `options`/`answer`, so send it again when options or the answer change.',
              items: { $ref: '#/components/schemas/Distractor' },
            },
          },
        },
        Readiness: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            dbState: {
              type: 'integer',
              description: 'mongoose.connection.readyState (1 = connected).',
            },
          },
        },
        Password: {
          type: 'string',
          minLength: 8,
          description:
            'At least 8 characters with a lowercase letter, an uppercase letter, a digit and one of `@$!%*?&_`.',
        },
      },
      parameters: {
        PageQuery: {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        LimitQuery: {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        DifficultyQuery: {
          name: 'difficulty',
          in: 'query',
          required: false,
          schema: { $ref: '#/components/schemas/Difficulty' },
        },
        TopicsQuery: {
          name: 'topics',
          in: 'query',
          required: false,
          description:
            'Comma-separated canonical topics (at most 150). Matches a question by its primaryTopic or any secondaryTopic.',
          style: 'form',
          explode: false,
          schema: {
            type: 'array',
            maxItems: 150,
            items: { $ref: '#/components/schemas/Topic' },
          },
        },
        IdPath: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
          description: 'MongoDB ObjectId (24 hexadecimal characters); anything else is rejected with 400.',
        },
        SessionIdPath: {
          name: 'sessionId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description:
            'Quiz session token returned by POST /quiz/sessions (64 lowercase hex chars; anything else is a 404). ' +
            'A session started by a logged-in user can only be driven by that same user (404 otherwise).',
        },
      },
      responses: {
        ValidationError: {
          description: 'Validation failed (Zod) or a business-rule violation.',
          content: errorContent,
        },
        Unauthorized: {
          description: 'Missing, invalid or expired session.',
          content: errorContent,
        },
        CsrfForbidden: {
          description: 'Invalid or missing CSRF token.',
          content: errorContent,
        },
        AdminForbidden: {
          description:
            'A valid session that belongs to a non-admin account (including a demoted admin), or an ' +
            'invalid/missing CSRF token on state-changing routes.',
          content: errorContent,
        },
        AdminUnauthorized: {
          description:
            'No valid admin session: the admin cookie is missing, malformed or expired, or the session was ' +
            'revoked (tokenVersion) or the account is banned or deleted.',
          content: errorContent,
        },
        NotFound: { description: 'Resource not found.', content: errorContent },
        TooManyRequests: {
          description: 'Rate limit exceeded (every limiter answers with the standard error envelope).',
          content: errorContent,
        },
      },
    },
    // Routes defined in app.js / observability/metrics.js rather than in a
    // v1 router: documented here since they live outside /api/v1 and so need
    // a per-path server override. Not documented: GET / (plain-text welcome
    // banner) and GET /password_reset_link_success.html (legacy redirect to
    // the frontend).
    paths: {
      '/healthz': {
        servers: [{ url: '/' }],
        get: {
          tags: ['Operations'],
          summary: 'Liveness check',
          operationId: 'getHealthz',
          responses: {
            200: {
              description: 'Process is up.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      uptimeSeconds: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/readyz': {
        servers: [{ url: '/' }],
        get: {
          tags: ['Operations'],
          summary: 'Readiness check (MongoDB connection state)',
          operationId: 'getReadyz',
          responses: {
            200: {
              description: 'Ready.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Readiness' },
                },
              },
            },
            503: {
              description:
                'Not connected to MongoDB. Error envelope; `error.details` is `{ ready: false, dbState }`.',
              content: errorContent,
            },
          },
        },
      },
      '/metrics': {
        servers: [{ url: '/' }],
        get: {
          tags: ['Operations'],
          summary: 'Prometheus metrics',
          description:
            'Open outside production. In production requires `Authorization: Bearer <METRICS_TOKEN>`; ' +
            'if METRICS_TOKEN is not configured the endpoint fails closed with 404.',
          operationId: 'getMetrics',
          security: [{ metricsBearer: [] }],
          responses: {
            200: {
              description: 'Prometheus text exposition format.',
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
            401: {
              description: 'Production only: missing or wrong bearer token.',
              content: errorContent,
            },
            404: {
              description: 'Production only: METRICS_TOKEN is not configured.',
              content: errorContent,
            },
          },
        },
      },
    },
  },
  apis: [ROUTE_FILES_GLOB],
});

// Disabled in production unless explicitly re-enabled (docs/AUDIT.md Phase
// 4, item 15) — Swagger UI documents every endpoint's shape and is useful
// during development, but isn't something to leave publicly reachable by
// default once deployed.
function setupSwagger(app) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_API_DOCS !== 'true') {
    return;
  }
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
}

module.exports = {
  setupSwagger,
  spec,
};
