const { z } = require('zod');
const { QUIZ_MODES } = require('../config/quizConfig');

const difficultyEnum = z.enum(['easy', 'medium', 'hard']);

const createSessionSchema = z.object({
  mode: z.enum(QUIZ_MODES),
  topics: z.array(z.string().min(1)).max(150).optional().default([]),
  difficulty: difficultyEnum.optional(),
  practiceMode: z.boolean().optional().default(false),
});

const submitAnswerSchema = z.object({
  questionId: z.string().regex(/^[a-f\d]{24}$/i),
  selectedIndex: z.coerce.number().int().min(0).nullable().optional(),
});

module.exports = { createSessionSchema, submitAnswerSchema };
