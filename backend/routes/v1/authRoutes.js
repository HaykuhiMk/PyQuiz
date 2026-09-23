const express = require('express');
const authController = require('../../controllers/authController');
const validate = require('../../middleware/validate');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetKeyParamSchema,
} = require('../../validators/authValidators');

const router = express.Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post(
  '/reset-password/:resetKey',
  validate(resetKeyParamSchema, 'params'),
  validate(resetPasswordSchema),
  authController.resetPassword
);

module.exports = router;
