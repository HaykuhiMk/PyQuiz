const express = require('express');
const adminAuthController = require('../../controllers/adminAuthController');
const adminQuestionController = require('../../controllers/adminQuestionController');
const adminUserController = require('../../controllers/adminUserController');
const adminContactController = require('../../controllers/adminContactController');
const verifyAdmin = require('../../middleware/verifyAdmin');
const { verifyAdminCsrf } = require('../../middleware/csrf');
const validate = require('../../middleware/validate');
const {
  adminLoginSchema,
  paginationQuerySchema,
  setBannedSchema,
} = require('../../validators/adminValidators');
const { questionFilterSchema, updateQuestionSchema } = require('../../validators/questionValidators');

const router = express.Router();

/**
 * @openapi
 * /admin/login:
 *   post:
 *     tags: [Admin]
 *     summary: Log in as an admin
 *     description: >
 *       Public. Rate limited to 20 requests per 15 minutes per IP. On success sets the httpOnly
 *       admin session cookie (`adminToken` / `__Host-adminToken`) and the readable `adminCsrfToken`
 *       cookie, and returns the CSRF token in the body.
 *     operationId: adminLogin
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, minLength: 1 }
 *               password: { type: string, minLength: 1 }
 *     responses:
 *       200:
 *         description: Logged in; admin session cookies set.
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
 *                         message: { type: string, example: Login successful }
 *                         admin:
 *                           type: object
 *                           properties:
 *                             id: { type: string }
 *                             username: { type: string }
 *                         csrfToken: { type: string }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401:
 *         description: >
 *           "Invalid credentials" — the same response for an unknown username, a non-admin
 *           account, or a wrong password.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/login', validate(adminLoginSchema), adminAuthController.login);
/**
 * @openapi
 * /admin/logout:
 *   post:
 *     tags: [Admin]
 *     summary: Log out (clear the admin session cookies)
 *     description: Public and idempotent; no authentication or CSRF token is checked.
 *     operationId: adminLogout
 *     security: []
 *     responses:
 *       200:
 *         description: Cookies cleared.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/logout', adminAuthController.logout);
/**
 * @openapi
 * /admin/me:
 *   get:
 *     tags: [Admin]
 *     summary: Confirm the admin session and get a CSRF token
 *     operationId: adminMe
 *     security:
 *       - adminCookie: []
 *     responses:
 *       200:
 *         description: Admin session is valid.
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
 *                         admin:
 *                           type: object
 *                           properties:
 *                             id: { type: string }
 *                             username: { type: string }
 *                         csrfToken: { type: string }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminForbidden' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/me', verifyAdmin, adminAuthController.me);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users (paginated)
 *     operationId: adminListUsers
 *     security:
 *       - adminCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: A page of users.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedList' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminForbidden' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/users', verifyAdmin, validate(paginationQuerySchema, 'query'), adminUserController.list);
/**
 * @openapi
 * /admin/users/{id}/ban:
 *   patch:
 *     tags: [Admin]
 *     summary: Ban or unban a user
 *     description: Admin accounts cannot be banned (403).
 *     operationId: adminSetUserBanned
 *     security:
 *       - adminCookie: []
 *         csrfHeader: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [banned]
 *             properties:
 *               banned: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated user.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Validation failed, or the id is not a valid ObjectId.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403:
 *         description: Not an admin session, invalid/missing CSRF token, or the target is an admin account.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/MiddlewareError'
 *                 - $ref: '#/components/schemas/ApiError'
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.patch(
  '/users/:id/ban',
  verifyAdmin,
  verifyAdminCsrf,
  validate(setBannedSchema),
  adminUserController.setBanned
);

/**
 * @openapi
 * /admin/contacts:
 *   get:
 *     tags: [Admin]
 *     summary: List contact-form messages (paginated)
 *     operationId: adminListContacts
 *     security:
 *       - adminCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: A page of contact messages.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedList' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminForbidden' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get(
  '/contacts',
  verifyAdmin,
  validate(paginationQuerySchema, 'query'),
  adminContactController.list
);

/**
 * @openapi
 * /admin/questions:
 *   get:
 *     tags: [Admin]
 *     summary: List questions with answers (paginated)
 *     operationId: adminListQuestions
 *     security:
 *       - adminCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/DifficultyQuery'
 *       - $ref: '#/components/parameters/TopicsQuery'
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: A page of full question documents.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedList' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminForbidden' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get(
  '/questions',
  verifyAdmin,
  validate(questionFilterSchema, 'query'),
  adminQuestionController.list
);
/**
 * @openapi
 * /admin/questions/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get one full question document
 *     operationId: adminGetQuestion
 *     security:
 *       - adminCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     responses:
 *       200:
 *         description: The question.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminForbidden' }
 *       404:
 *         description: Question not found (also for a malformed id).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/questions/:id', verifyAdmin, adminQuestionController.getOne);
/**
 * @openapi
 * /admin/questions/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update a question
 *     operationId: adminUpdateQuestion
 *     security:
 *       - adminCookie: []
 *         csrfHeader: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/QuestionUpdate' }
 *     responses:
 *       200:
 *         description: The updated question.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminForbidden' }
 *       404:
 *         description: Question not found (also for a malformed id).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.patch(
  '/questions/:id',
  verifyAdmin,
  verifyAdminCsrf,
  validate(updateQuestionSchema),
  adminQuestionController.update
);
/**
 * @openapi
 * /admin/questions/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a question
 *     description: Also removes every user's answered-question record for it.
 *     operationId: adminDeleteQuestion
 *     security:
 *       - adminCookie: []
 *         csrfHeader: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     responses:
 *       200:
 *         description: Deleted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       401: { $ref: '#/components/responses/AdminUnauthorized' }
 *       403: { $ref: '#/components/responses/AdminForbidden' }
 *       404:
 *         description: Question not found (also for a malformed id).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.delete('/questions/:id', verifyAdmin, verifyAdminCsrf, adminQuestionController.remove);

module.exports = router;
