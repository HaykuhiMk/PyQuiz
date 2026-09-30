// Validation rules that the frontend must apply exactly as the server does.
// This file is the single definition: the Zod schemas and services read it,
// and GET /api/v1/validation-rules serves it so the frontend builds its
// client-side checks from the same values instead of keeping its own copy.

// Every place a password is set (registration, reset, change-password).
// `pattern` is a RegExp source string, so it can be sent as JSON and rebuilt
// with `new RegExp(pattern)` in the browser with identical behaviour.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&_]).+$';
const PASSWORD_REQUIREMENTS =
  'At least 8 characters, with a lowercase letter, an uppercase letter, a number and one of @ $ ! % * ? & _.';

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_REQUIREMENTS,
};
