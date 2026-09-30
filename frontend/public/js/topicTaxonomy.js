// Must match backend/config/topicTaxonomy.js exactly. Used by the admin
// question form's topic pickers, which need the full canonical list
// (including a topic with zero questions today, like Numbers & Arithmetic —
// an admin adding a question is exactly how that count grows) rather than
// GET /api/v1/questions/topics, which only returns topics that already have
// at least one question as their primary topic.
export const CANONICAL_TOPICS = [
  'Names, Mutability & Identity',
  'Loops & Control Flow',
  'Dictionaries',
  'Data Types & Conversion',
  'Strings',
  'Functions & Built-ins',
  'Sets',
  'Lists',
  'Indexing & Slicing',
  'Tuples',
  'Numbers & Arithmetic',
];
