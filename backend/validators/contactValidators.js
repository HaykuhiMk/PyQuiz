const { z } = require('zod');

// Normalizes a missing/non-string field to '' first, so the .min(1, ...)
// message below applies uniformly whether the field was omitted, null, or
// an empty string, instead of a missing field short-circuiting into Zod's
// generic "expected string, received undefined" message.
const requiredString = (maxLength, maxMessage) =>
  z.preprocess(
    (val) => (typeof val === 'string' ? val : ''),
    z.string().trim().min(1, 'Please provide all required fields').max(maxLength, maxMessage)
  );

const contactSchema = z.object({
  name: requiredString(100, 'Name is too long'),
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val : ''),
    z
      .string()
      .trim()
      .min(1, 'Please provide all required fields')
      .max(200, 'Please provide a valid email address')
      .email('Please provide a valid email address')
  ),
  message: requiredString(5000, 'Message is too long'),
});

module.exports = { contactSchema };
