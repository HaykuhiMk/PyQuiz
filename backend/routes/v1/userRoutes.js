const express = require('express');
const userController = require('../../controllers/userController');
const authenticateToken = require('../../middleware/authenticateToken');
const verifyCsrf = require('../../middleware/csrf');
const validate = require('../../middleware/validate');
const {
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
} = require('../../validators/userValidators');

const router = express.Router();

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the current user's profile
 *     operationId: usersGetMe
 *     security:
 *       - userCookie: []
 *     responses:
 *       200:
 *         description: Profile.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/me', authenticateToken, userController.me);
// Scoring moved to the server-authoritative quiz session endpoints
// (POST /api/v1/quiz/sessions/:sessionId/answer) in Phase 1: a client can no
// longer report a mode/outcome directly here, since that was the exact gap
// that let quiz mode and points be forged. This GET (read-only) is unaffected.
/**
 * @openapi
 * /users/user-progress:
 *   get:
 *     tags: [Users]
 *     summary: Get the current user's quiz progress and stats
 *     operationId: usersGetProgress
 *     security:
 *       - userCookie: []
 *     responses:
 *       200:
 *         description: Progress.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/user-progress', authenticateToken, userController.getProgress);
// Public (guests can view it too), but a logged-in viewer's own row is
// marked via optionalAuthenticate populating req.user when a valid cookie
// is present.
/**
 * @openapi
 * /users/leaderboard:
 *   get:
 *     tags: [Users]
 *     summary: Global leaderboard
 *     description: >
 *       Public. When a valid session cookie is present, the viewer's own row has
 *       `isCurrentUser: true`. The `limit` query is not Zod-validated: non-numeric values fall
 *       back to 50 and the result is clamped to 1..100.
 *     operationId: usersGetLeaderboard
 *     security:
 *       - {}
 *       - userCookie: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *     responses:
 *       200:
 *         description: Leaderboard rows.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           rank: { type: integer }
 *                           username: { type: string }
 *                           totalPoints: { type: integer }
 *                           bestStreak: { type: integer }
 *                           totalCorrect: { type: integer }
 *                           isCurrentUser: { type: boolean }
 *                           achievements: { type: array, items: { type: string } }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/leaderboard', userController.getLeaderboard);
/**
 * @openapi
 * /users/topic-mastery:
 *   get:
 *     tags: [Users]
 *     summary: Get the current user's per-topic mastery
 *     operationId: usersGetTopicMastery
 *     security:
 *       - userCookie: []
 *     responses:
 *       200:
 *         description: Topic mastery.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/topic-mastery', authenticateToken, userController.getTopicMastery);
/**
 * @openapi
 * /users/settings/profile:
 *   patch:
 *     tags: [Users]
 *     summary: Update username and/or avatar
 *     operationId: usersUpdateProfile
 *     security:
 *       - userCookie: []
 *         csrfHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string, minLength: 2, maxLength: 50, description: Trimmed before validation. }
 *               avatar:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 500000
 *                 description: >
 *                   A `data:image/...` URL, or null / empty string to remove the avatar. Longer
 *                   than 500,000 characters (a file over 374,982 bytes) returns 400 "Image is too
 *                   large" (limits served by GET /validation-rules); this route accepts
 *                   request bodies up to 1 MB (413 beyond that).
 *     responses:
 *       200:
 *         description: Profile updated.
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
 *                         username: { type: string }
 *                         avatar: { type: string, nullable: true }
 *                         message: { type: string }
 *       400:
 *         description: Validation failed, invalid avatar, or the username already exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/CsrfForbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.patch(
  '/settings/profile',
  authenticateToken,
  verifyCsrf,
  validate(updateProfileSchema),
  userController.updateProfile
);
/**
 * @openapi
 * /users/settings/password:
 *   patch:
 *     tags: [Users]
 *     summary: Change the current user's password
 *     description: Invalidates every existing session, including the caller's own.
 *     operationId: usersChangePassword
 *     security:
 *       - userCookie: []
 *         csrfHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, minLength: 1 }
 *               newPassword:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Password'
 *                 description: Exactly the same rule as registration and password reset.
 *     responses:
 *       200:
 *         description: Password changed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       400:
 *         description: Validation failed, or the current password is incorrect.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/CsrfForbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.patch(
  '/settings/password',
  authenticateToken,
  verifyCsrf,
  validate(changePasswordSchema),
  userController.changePassword
);
/**
 * @openapi
 * /users/me:
 *   delete:
 *     tags: [Users]
 *     summary: Delete the current user's account
 *     description: Requires the account password. Admin accounts cannot be deleted here (403).
 *     operationId: usersDeleteMe
 *     security:
 *       - userCookie: []
 *         csrfHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, minLength: 1 }
 *     responses:
 *       200:
 *         description: Account deleted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       400:
 *         description: Validation failed, or the password is incorrect.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: Invalid or missing CSRF token, or the account is an admin account.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.delete(
  '/me',
  authenticateToken,
  verifyCsrf,
  validate(deleteAccountSchema),
  userController.deleteAccount
);

module.exports = router;
