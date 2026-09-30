const { z } = require('zod');
const { TOPIC_IDS } = require('../config/topicTaxonomy');

const difficultyEnum = z.enum(['easy', 'medium', 'hard']);
// Stable topic ids (config/topicTaxonomy.js), never display names.
const topicEnum = z.enum(TOPIC_IDS);

function csvToArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const addQuestionSchema = z
  .object({
    question: z.string().min(5),
    code: z.string().optional().default(''),
    options: z.array(z.string().min(1)).min(2),
    answer: z.string().min(1),
    difficulty: difficultyEnum,
    primaryTopic: topicEnum,
    secondaryTopics: z.array(topicEnum).optional().default([]),
    explanation: z.string().min(1),
  })
  .refine((data) => data.options.includes(data.answer), {
    message: 'Answer must be one of the provided options',
    path: ['answer'],
  })
  .refine((data) => !data.secondaryTopics.includes(data.primaryTopic), {
    message: 'A topic cannot be both the primary topic and a secondary topic',
    path: ['secondaryTopics'],
  });

const updateQuestionSchema = z
  .object({
    question: z.string().min(5).optional(),
    code: z.string().optional(),
    options: z.array(z.string().min(1)).min(2).optional(),
    answer: z.string().min(1).optional(),
    difficulty: difficultyEnum.optional(),
    primaryTopic: topicEnum.optional(),
    secondaryTopics: z.array(topicEnum).optional(),
    explanation: z.string().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
  .refine(
    (data) =>
      !data.primaryTopic || !data.secondaryTopics || !data.secondaryTopics.includes(data.primaryTopic),
    { message: 'A topic cannot be both the primary topic and a secondary topic', path: ['secondaryTopics'] }
  );

const questionFilterSchema = z.object({
  difficulty: difficultyEnum.optional(),
  topics: z.preprocess(csvToArray, z.array(topicEnum).max(150)).default([]),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const randomQuestionFilterSchema = z.object({
  difficulty: difficultyEnum.optional(),
  topics: z.preprocess(csvToArray, z.array(topicEnum).max(150)).default([]),
  excludeIds: z.preprocess(csvToArray, z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(500)).default([]),
});

module.exports = {
  addQuestionSchema,
  updateQuestionSchema,
  questionFilterSchema,
  randomQuestionFilterSchema,
};
