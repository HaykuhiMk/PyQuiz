// The canonical topic taxonomy (docs/AUDIT.md Phase 3 taxonomy revision,
// approved). Every question has exactly one required `primaryTopic` from
// this list (the concept a learner must understand to answer it correctly)
// and any number of optional `secondaryTopics` from the same list, used
// only for filtering/search — mastery and weak-topic detection use
// primaryTopic only (backend/services/topicMasteryService.js).
//
// Mirrored in frontend/public/js/topicTaxonomy.js for the admin question
// form's topic pickers — keep both lists in sync if this ever changes.
const CANONICAL_TOPICS = [
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

module.exports = { CANONICAL_TOPICS };
