const express = require('express');
const userController = require('../../controllers/userController');
const authenticateToken = require('../../middleware/authenticateToken');
const verifyCsrf = require('../../middleware/csrf');
const validate = require('../../middleware/validate');
const {
  updateProgressSchema,
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
} = require('../../validators/userValidators');

const router = express.Router();

router.get('/me', authenticateToken, userController.me);
router.get('/user-progress', authenticateToken, userController.getProgress);
router.post(
  '/user-progress',
  authenticateToken,
  verifyCsrf,
  validate(updateProgressSchema),
  userController.updateProgress
);
router.get('/leaderboard', userController.getLeaderboard);
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
