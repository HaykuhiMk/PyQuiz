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

// Avatars are stored as data URLs ("data:image/png;base64,..."). The stored
// string may be at most AVATAR_MAX_DATA_URL_LENGTH characters. Base64 turns
// every 3 bytes into 4 characters, so after the longest accepted prefix
// ("data:image/jpeg;base64," / "data:image/webp;base64,", 23 chars) the
// largest file that fits is floor((500000 - 23) / 4) * 3 = 374,982 bytes.
const AVATAR_MAX_DATA_URL_LENGTH = 500_000;
const AVATAR_LONGEST_PREFIX = 'data:image/jpeg;base64,';
const AVATAR_MAX_FILE_BYTES = Math.floor((AVATAR_MAX_DATA_URL_LENGTH - AVATAR_LONGEST_PREFIX.length) / 4) * 3;
const AVATAR_TOO_LARGE_MESSAGE = `Image is too large. The maximum is ${Math.floor(AVATAR_MAX_FILE_BYTES / 1024)} KB.`;

// Admin question form: the optional targeted feedback on a wrong option
// (Question.distractors, docs/CONCEPT_GRAPH.md Stage 2).
const DISTRACTOR_FEEDBACK_MAX_LENGTH = 300;

module.exports = {
  AVATAR_MAX_DATA_URL_LENGTH,
  AVATAR_MAX_FILE_BYTES,
  AVATAR_TOO_LARGE_MESSAGE,
  DISTRACTOR_FEEDBACK_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_REQUIREMENTS,
};
