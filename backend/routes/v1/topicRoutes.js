const express = require('express');
const topicController = require('../../controllers/topicController');

const router = express.Router();

/**
 * @openapi
 * /topics:
 *   get:
 *     tags: [Config]
 *     summary: The canonical topic taxonomy (stable ids and display names)
 *     description: >
 *       Public, takes no input. Every topic in its defined order, including topics with no
 *       questions yet. Topics are stored and passed everywhere by `id`, which never changes;
 *       `name` is for display only and may change.
 *     operationId: getTopicTaxonomy
 *     security: []
 *     responses:
 *       200:
 *         description: All topics.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TopicEntry' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/', topicController.getTaxonomy);

module.exports = router;
