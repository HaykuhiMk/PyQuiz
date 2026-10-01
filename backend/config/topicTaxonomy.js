// The canonical topic taxonomy (docs/AUDIT.md Phase 3 taxonomy revision,
// approved; stable ids per docs/CONCEPT_GRAPH.md §5). Every question has
// exactly one required `primaryTopic` from this list (the concept a learner
// must understand to answer it correctly) and any number of optional
// `secondaryTopics` from the same list, used only for filtering/search —
// mastery and weak-topic detection use primaryTopic only
// (backend/services/topicMasteryService.js).
//
// Topics are stored and passed everywhere (questions, quiz sessions, API
// parameters and responses, the frontend) by their stable `id`.
//   - An id NEVER changes once set: it is what the database stores.
//   - A display `name` can change freely: this file is the only place names
//     live. The frontend reads them from GET /api/v1/topics.
const TOPICS = [
  { id: 'mutability', name: 'Names, Mutability & Identity' },
  { id: 'loops', name: 'Loops & Control Flow' },
  { id: 'dicts', name: 'Dictionaries' },
  { id: 'types', name: 'Data Types & Conversion' },
  { id: 'strings', name: 'Strings' },
  { id: 'functions', name: 'Functions & Built-ins' },
  { id: 'sets', name: 'Sets' },
  { id: 'lists', name: 'Lists' },
  { id: 'slicing', name: 'Indexing & Slicing' },
  { id: 'tuples', name: 'Tuples' },
  { id: 'numbers', name: 'Numbers & Arithmetic' },
  // Approved with the production migration (docs/FIX_PLAN.md, M2): 67
  // production questions belong to these five.
  { id: 'classes', name: 'Classes & Objects' },
  { id: 'inheritance', name: 'Inheritance & MRO' },
  { id: 'scope', name: 'Scope & Namespaces' },
  { id: 'generators', name: 'Generators & Iterators' },
  { id: 'exceptions', name: 'Exceptions' },
];

// Topics that are nodes in the concept graph (config/conceptGraph.js) but not
// yet accepted on questions (not in TOPIC_IDS). Empty now: the five that were
// planned (classes, inheritance, scope, generators, exceptions) moved into
// TOPICS with the production migration.
const PLANNED_TOPICS = [];

const TOPIC_IDS = TOPICS.map((topic) => topic.id);

const NAME_BY_ID = new Map([...TOPICS, ...PLANNED_TOPICS].map((topic) => [topic.id, topic.name]));

function topicName(id) {
  return NAME_BY_ID.get(id) || id;
}

module.exports = { TOPICS, PLANNED_TOPICS, TOPIC_IDS, topicName };
