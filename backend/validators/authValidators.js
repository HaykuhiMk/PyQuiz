const { z } = require('zod');

const emailRule = z.string().email();
const passwordRule = z
  .string()
  .min(8)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_]).+$/);

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
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetKeyParamSchema,
};
