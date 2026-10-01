const { TOPICS } = require('../config/topicTaxonomy');

// The full canonical taxonomy, in its defined order, including topics with
// no questions yet (the admin forms need every topic). Ids are stable; names
// are display-only and come from config/topicTaxonomy.js.
function getTaxonomy() {
  return TOPICS.map(({ id, name }) => ({ id, name }));
}

module.exports = { getTaxonomy };
