const express = require('express');
const pythonVersionController = require('../../controllers/pythonVersionController');

const router = express.Router();

/**
 * @openapi
 * /python-version:
 *   get:
 *     tags: [Config]
 *     summary: The Python version question answers assume
 *     description: >
 *       Public, takes no input. Served from backend/config/pythonVersion.js: the minimum version,
 *       the versions every seed question is checked on (`npm run verify-questions`), the note shown
 *       to learners and the hint shown to question authors.
 *     operationId: getPythonVersion
 *     security: []
 *     responses:
 *       200:
 *         description: The reference version.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         minimum: { type: string, example: '3.9' }
 *                         checked: { type: array, items: { type: string }, example: ['3.9', '3.14'] }
 *                         learnerNote: { type: string }
 *                         authorHint: { type: string }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/', pythonVersionController.getPythonVersion);

module.exports = router;
