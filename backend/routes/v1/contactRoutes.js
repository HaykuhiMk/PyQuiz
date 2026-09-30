const express = require('express');
const contactController = require('../../controllers/contactController');

const router = express.Router();

/**
 * @openapi
 * /contact:
 *   post:
 *     tags: [Contact]
 *     summary: Send a contact-form message
 *     description: >
 *       Public. Rate limited to 5 requests per 15 minutes per IP. Validated with
 *       `contactSchema` inside contactService (not by route middleware); the 400 message is the
 *       first Zod issue's message.
 *     operationId: contactSubmit
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, message]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 100, description: Trimmed. }
 *               email: { type: string, format: email, maxLength: 200, description: Trimmed. }
 *               message: { type: string, minLength: 1, maxLength: 5000, description: Trimmed. }
 *               website: { type: string, description: Honeypot field - leave empty or omit. }
 *     responses:
 *       201:
 *         description: Message accepted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/', contactController.submitContact);

module.exports = router;
