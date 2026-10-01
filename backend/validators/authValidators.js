const { z } = require('zod');
const { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN, PASSWORD_REQUIREMENTS } = require('../config/validationRules');

// Emails are case-insensitive identities: always trimmed and lowercased, so
// registration, login and password reset agree however the address is typed.
const emailRule = z.string().trim().toLowerCase().email();
// The single password rule for every place a password is set: registration,
// reset, and change-password (validators/userValidators.js imports it).
// Built from config/validationRules.js, which the frontend also reads (via
// GET /api/v1/validation-rules), so client and server can't drift apart.
const passwordRule = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS)
  .regex(new RegExp(PASSWORD_PATTERN), PASSWORD_REQUIREMENTS);

const registerSchema = z.object({
  username: z.string().min(2).max(50),
  email: emailRule,
  password: passwordRule,
});

const loginSchema = z.object({
  email: emailRule,
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: emailRule,
});

const resetPasswordSchema = z.object({
  password: passwordRule,
});

const resetKeyParamSchema = z.object({
  resetKey: z.string().min(1),
});

module.exports = {
  passwordRule,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetKeyParamSchema,
};
