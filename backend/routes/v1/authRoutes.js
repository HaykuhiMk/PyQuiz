const express = require('express');
const authController = require('../../controllers/authController');
const validate = require('../../middleware/validate');
const authenticateToken = require('../../middleware/authenticateToken');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetKeyParamSchema,
} = require('../../validators/authValidators');

const router = express.Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     description: Public. Rate limited to 20 requests per 15 minutes per IP. Does not log the user in.
 *     operationId: authRegister
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string, minLength: 2, maxLength: 50 }
 *               email: { type: string, format: email }
 *               password: { $ref: '#/components/schemas/Password' }
 *     responses:
 *       201:
 *         description: User registered.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       400:
 *         description: Validation failed, or the email / username (case-insensitive) already exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/register', validate(registerSchema), authController.register);
/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in as a regular user
 *     description: >
 *       Public. Rate limited to 20 requests per 15 minutes per IP. On success sets the httpOnly
 *       session cookie (`token` / `__Host-token`) and the readable `csrfToken` cookie, and returns
 *       the CSRF token in the body for use as the `X-CSRF-Token` header.
 *     operationId: authLogin
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 1 }
 *     responses:
 *       200:
 *         description: Logged in; session cookies set.
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
 *                         user:
 *                           type: object
 *                           properties:
 *                             id: { type: string }
 *                             email: { type: string }
 *                             username: { type: string }
 *                         csrfToken: { type: string }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401:
 *         description: Invalid credentials.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       403:
 *         description: The account has been suspended (banned).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/login', validate(loginSchema), authController.login);
/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out (clear the regular-user session cookies)
 *     description: Public and idempotent; no authentication or CSRF token is checked.
 *     operationId: authLogout
 *     security: []
 *     responses:
 *       200:
 *         description: Cookies cleared.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/logout', authController.logout);
/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Confirm the current session and get a CSRF token
 *     operationId: authMe
 *     security:
 *       - userCookie: []
 *     responses:
 *       200:
 *         description: Session is valid.
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
 *                         user:
 *                           type: object
 *                           properties:
 *                             id: { type: string }
 *                             email: { type: string }
 *                             username: { type: string }
 *                         csrfToken: { type: string }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/me', authenticateToken, authController.me);
/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password-reset email
 *     description: >
 *       Public. Rate limited to 20 requests per 15 minutes per IP. Always returns the same generic
 *       message whether or not the email is registered.
 *     operationId: authForgotPassword
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Generic acknowledgement.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
/**
 * @openapi
 * /auth/reset-password/{resetKey}:
 *   post:
 *     tags: [Auth]
 *     summary: Set a new password using a reset key from the email link
 *     description: >
 *       Public. Rate limited to 20 requests per 15 minutes per IP. Invalidates every existing
 *       session of the account.
 *     operationId: authResetPassword
 *     security: []
 *     parameters:
 *       - name: resetKey
 *         in: path
 *         required: true
 *         schema: { type: string, minLength: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { $ref: '#/components/schemas/Password' }
 *     responses:
 *       200:
 *         description: Password reset.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       400:
 *         description: Validation failed, or the reset key is invalid or expired.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/reset-password/:resetKey',
  validate(resetKeyParamSchema, 'params'),
  validate(resetPasswordSchema),
  authController.resetPassword
);

module.exports = router;
