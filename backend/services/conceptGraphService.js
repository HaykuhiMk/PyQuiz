const { NODES, EDGES, MISCONCEPTIONS } = require('../config/conceptGraph');
const { TOPIC_IDS, topicName } = require('../config/topicTaxonomy');

// The concept graph for GET /api/v1/concept-graph: topics, prerequisite edges
// and misconception descriptions only. It never includes question content,
// answers or which options carry which misconception.
// A node's status is 'active' when questions may use the topic, or 'planned'
// when it is in the graph but not yet in the question taxonomy (none are
// planned at the moment).
function getGraph() {
  return {
    nodes: NODES.map(({ id, description }) => ({
      id,
      name: topicName(id),
      description,
      status: TOPIC_IDS.includes(id) ? 'active' : 'planned',
    })),
    edges: EDGES.map(({ from, to, reason }) => ({ from, to, reason })),
    misconceptions: MISCONCEPTIONS.map(({ id, topic, belief, correctModel }) => ({ id, topic, belief, correctModel })),
  };
}

module.exports = { getGraph };
