const { z } = require('zod');

const adminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const setBannedSchema = z.object({
  banned: z.boolean(),
});

// Path parameter for the admin routes addressing one user or question.
const objectIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Must be a 24-character hexadecimal id'),
});

module.exports = { adminLoginSchema, paginationQuerySchema, setBannedSchema, objectIdParamSchema };
