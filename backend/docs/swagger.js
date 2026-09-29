const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PyQuiz API',
      version: '1.0.0',
      description: 'API documentation for PyQuiz backend services.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      schemas: {
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            error: { type: 'null', example: null },
            meta: { type: 'object' },
          },
        },
      },
    },
  },
  apis: [],
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
};
