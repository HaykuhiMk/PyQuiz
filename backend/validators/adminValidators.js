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

module.exports = { adminLoginSchema, paginationQuerySchema, setBannedSchema };
