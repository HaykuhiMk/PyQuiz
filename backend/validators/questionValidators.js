const { z } = require('zod');
const { TOPIC_IDS } = require('../config/topicTaxonomy');
const { MISCONCEPTION_IDS } = require('../config/conceptGraph');
const { DISTRACTOR_FEEDBACK_MAX_LENGTH } = require('../config/validationRules');
const { distractorProblem } = require('../utils/distractors');

const difficultyEnum = z.enum(['easy', 'medium', 'hard']);
// Stable topic ids (config/topicTaxonomy.js), never display names.
const topicEnum = z.enum(TOPIC_IDS);

// A tag on one wrong option (utils/distractors.js has the cross-field rules).
const distractorSchema = z
  .object({
    option: z.string().min(1),
    misconceptionId: z.enum(MISCONCEPTION_IDS).optional(),
    feedback: z.string().trim().min(1).max(DISTRACTOR_FEEDBACK_MAX_LENGTH).optional(),
  })
  .refine((data) => data.misconceptionId || data.feedback, {
    message: 'A distractor needs a misconceptionId or feedback',
    path: ['misconceptionId'],
  });

const distractorsSchema = z.array(distractorSchema).max(50);

// Option texts must be distinct: the answer and distractor tags are matched
// to an option by its exact text, which is ambiguous for a repeated option.
const optionsSchema = z
  .array(z.string().min(1))
  .min(2)
  .refine((options) => new Set(options).size === options.length, {
    message: 'Options must all be different',
  });

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
    options: optionsSchema,
    answer: z.string().min(1),
    difficulty: difficultyEnum,
    primaryTopic: topicEnum,
    secondaryTopics: z.array(topicEnum).optional().default([]),
    explanation: z.string().min(1),
    distractors: distractorsSchema.optional().default([]),
  })
  .refine((data) => data.options.includes(data.answer), {
    message: 'Answer must be one of the provided options',
    path: ['answer'],
  })
  .superRefine((data, ctx) => {
    const problem = distractorProblem(data);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ['distractors'] });
  })
  .refine((data) => !data.secondaryTopics.includes(data.primaryTopic), {
    message: 'A topic cannot be both the primary topic and a secondary topic',
    path: ['secondaryTopics'],
  });

const updateQuestionSchema = z
  .object({
    question: z.string().min(5).optional(),
    code: z.string().optional(),
    options: optionsSchema.optional(),
    answer: z.string().min(1).optional(),
    difficulty: difficultyEnum.optional(),
    primaryTopic: topicEnum.optional(),
    secondaryTopics: z.array(topicEnum).optional(),
    explanation: z.string().min(1).optional(),
    distractors: distractorsSchema.optional(),
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
