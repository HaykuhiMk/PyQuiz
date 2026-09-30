const express = require('express');
const conceptGraphController = require('../../controllers/conceptGraphController');

const router = express.Router();

/**
 * @openapi
 * /concept-graph:
 *   get:
 *     tags: [Config]
 *     summary: The concept graph (topics, prerequisite edges, misconceptions)
 *     description: >
 *       Public, read-only, takes no input. Every topic node (including planned topics that have
 *       no questions yet), the prerequisite edges between them, and every misconception with its
 *       description. An edge means `from` must come first. Contains no question content or
 *       answers. Ids are stable; `name` is for display only and may change.
 *     operationId: getConceptGraph
 *     security: []
 *     responses:
 *       200:
 *         description: The whole graph.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ConceptGraph' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/', conceptGraphController.getGraph);

module.exports = router;
