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

function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
}

module.exports = {
  setupSwagger,
};
