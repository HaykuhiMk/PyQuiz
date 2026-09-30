const { z } = require('zod');

const passwordSchema = z
  .string()
  .min(8)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/);

const updateProfileSchema = z.object({
  username: z.string().trim().min(2).max(50).optional(),
  // Length is enforced by userService.validateAvatar (500,000 chars, with
  // the user-facing "Image is too large" message) and bounded by the route's
  // 1 MB body limit (app.js).
  avatar: z.union([z.string(), z.null()]).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

module.exports = {
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
};
