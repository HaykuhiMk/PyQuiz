const { z } = require('zod');

// POST /api/v1/challenges/daily/submit
const submitDailySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedIndex: z.number().int().min(0),
      })
    )
    .min(1),
});

module.exports = { submitDailySchema };
