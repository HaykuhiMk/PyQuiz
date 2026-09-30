const express = require('express');
const validationRulesController = require('../../controllers/validationRulesController');

const router = express.Router();

/**
 * @openapi
 * /validation-rules:
 *   get:
 *     tags: [Config]
 *     summary: Validation rules the frontend applies client-side
 *     description: >
 *       Public, takes no input. Served from backend/config/validationRules.js, the same constants
 *       the server validates with, so the frontend's checks can't drift from the server's.
 *       `password.pattern` is a RegExp source string for `new RegExp(pattern)`.
 *     operationId: getValidationRules
 *     security: []
 *     responses:
 *       200:
 *         description: Current rules.
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
 *                         password:
 *                           type: object
 *                           properties:
 *                             minLength: { type: integer }
 *                             pattern: { type: string }
 *                             requirements: { type: string }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/', validationRulesController.getValidationRules);

module.exports = router;
