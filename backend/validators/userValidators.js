const { z } = require('zod');

const passwordSchema = z
  .string()
  .min(8)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/);

const updateProgressSchema = z.object({
  questionId: z.string().min(1),
  selectedIndex: z.coerce.number().int().min(0).nullable().optional(),
  mode: z.enum(['classic', 'blitz', 'survival']).optional().default('classic'),
  timeSpentSec: z.coerce.number().min(0).max(3600).optional().default(0),
});

const updateProfileSchema = z.object({
  username: z.string().trim().min(2).max(50).optional(),
  avatar: z.union([z.string().max(500_000), z.null()]).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

module.exports = {
  updateProgressSchema,
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
};
