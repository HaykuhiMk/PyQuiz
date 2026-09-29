const express = require('express');
const userController = require('../../controllers/userController');
const authenticateToken = require('../../middleware/authenticateToken');
const optionalAuthenticate = require('../../middleware/optionalAuth');
const verifyCsrf = require('../../middleware/csrf');
const validate = require('../../middleware/validate');
const {
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
} = require('../../validators/userValidators');

const router = express.Router();

router.get('/me', authenticateToken, userController.me);
// Scoring moved to the server-authoritative quiz session endpoints
// (POST /api/v1/quiz/sessions/:sessionId/answer) in Phase 1: a client can no
// longer report a mode/outcome directly here, since that was the exact gap
// that let quiz mode and points be forged. This GET (read-only) is unaffected.
router.get('/user-progress', authenticateToken, userController.getProgress);
// Public (guests can view it too), but a logged-in viewer's own row is
// marked via optionalAuthenticate populating req.user when a valid cookie
// is present.
router.get('/leaderboard', optionalAuthenticate, userController.getLeaderboard);
router.get('/topic-mastery', authenticateToken, userController.getTopicMastery);
router.patch(
  '/settings/profile',
  authenticateToken,
  verifyCsrf,
  validate(updateProfileSchema),
  userController.updateProfile
);
router.patch(
  '/settings/password',
  authenticateToken,
  verifyCsrf,
  validate(changePasswordSchema),
  userController.changePassword
);
router.delete(
  '/me',
  authenticateToken,
  verifyCsrf,
  validate(deleteAccountSchema),
  userController.deleteAccount
);

module.exports = router;
