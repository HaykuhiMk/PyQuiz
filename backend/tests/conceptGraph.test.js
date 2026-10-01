// The concept graph config (config/conceptGraph.js, docs/CONCEPT_GRAPH.md
// Stage 2) and its public read-only endpoint GET /api/v1/concept-graph.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const { NODES, EDGES, MISCONCEPTIONS, MISCONCEPTION_IDS } = require('../config/conceptGraph');
const { TOPICS, PLANNED_TOPICS, TOPIC_IDS, topicName } = require('../config/topicTaxonomy');

const NODE_IDS = NODES.map((node) => node.id);

// Kahn's algorithm: the nodes in prerequisite order. Nodes on a cycle never
// reach indegree 0, so a cyclic graph returns fewer nodes than it has.
function topologicalOrder(nodeIds, edges) {
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  for (const { to } of edges) indegree.set(to, indegree.get(to) + 1);
  const ready = nodeIds.filter((id) => indegree.get(id) === 0);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const edge of edges.filter((e) => e.from === id)) {
      indegree.set(edge.to, indegree.get(edge.to) - 1);
      if (indegree.get(edge.to) === 0) ready.push(edge.to);
    }
  }
  return order;
}

describe('config/conceptGraph.js', () => {
  it('has one node per taxonomy topic, active and planned, each with a description and a name', () => {
    expect(new Set(NODE_IDS).size).toBe(NODE_IDS.length);
    expect([...NODE_IDS].sort()).toEqual([...TOPICS, ...PLANNED_TOPICS].map((t) => t.id).sort());
    for (const node of NODES) {
      expect(node.description.length).toBeGreaterThan(0);
      expect(topicName(node.id)).not.toBe(node.id);
    }
    // Planned topics are graph nodes but not accepted on questions yet.
    for (const { id } of PLANNED_TOPICS) expect(TOPIC_IDS).not.toContain(id);
  });

  it('every edge refers to existing topics, with no self-loops or duplicates', () => {
    const seen = new Set();
    for (const { from, to, reason } of EDGES) {
      expect(NODE_IDS).toContain(from);
      expect(NODE_IDS).toContain(to);
      expect(from).not.toBe(to);
      expect(seen.has(`${from}>${to}`)).toBe(false);
      seen.add(`${from}>${to}`);
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it('is acyclic (every node can be placed in a topological order)', () => {
    expect(topologicalOrder(NODE_IDS, EDGES)).toHaveLength(NODE_IDS.length);
  });

  it('the acyclicity check does catch a cycle', () => {
    // Guards the test above: a cycle leaves nodes unplaced.
    const edges = [...EDGES, { from: 'inheritance', to: 'functions' }];
    expect(topologicalOrder(NODE_IDS, edges).length).toBeLessThan(NODE_IDS.length);
  });

  it('every misconception id is unique and belongs to an existing topic, named <topic>.<belief>', () => {
    expect(new Set(MISCONCEPTION_IDS).size).toBe(MISCONCEPTION_IDS.length);
    for (const { id, topic, belief, correctModel } of MISCONCEPTIONS) {
      expect(NODE_IDS).toContain(topic);
      expect(id).toMatch(new RegExp(`^${topic}\\.[a-z][a-z-]*$`));
      expect(belief.length).toBeGreaterThan(0);
      expect(correctModel.length).toBeGreaterThan(0);
    }
  });

  it('uses the renamed ids (renamed before any was stored), not the old ones', () => {
    for (const id of [
      'mutability.identity-equality-confusion',
      'strings.strip-removeprefix-confusion',
      'lists.in-place-method-returns-list',
    ]) {
      expect(MISCONCEPTION_IDS).toContain(id);
    }
    for (const id of ['mutability.is-means-equal', 'strings.strip-removes-substring', 'lists.sort-returns-list']) {
      expect(MISCONCEPTION_IDS).not.toContain(id);
    }
  });

  it('a "-confusion" misconception describes both directions', () => {
    const confusions = MISCONCEPTIONS.filter((m) => m.id.endsWith('-confusion'));
    expect(confusions.map((m) => m.id).sort()).toEqual([
      'mutability.identity-equality-confusion',
      'strings.strip-removeprefix-confusion',
    ]);
    for (const { belief } of confusions) expect(belief).toMatch(/^Confusion, both directions: /);
  });

  it('matches the approved design: 16 topics, 14 edges, 59 misconceptions, at least 2 per topic', () => {
    expect(NODES).toHaveLength(16);
    expect(EDGES).toHaveLength(14);
    expect(MISCONCEPTIONS).toHaveLength(59);
    for (const id of NODE_IDS) {
      expect(MISCONCEPTIONS.filter((m) => m.topic === id).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('GET /api/v1/concept-graph', () => {
  it('is public and returns nodes, edges and misconceptions', async () => {
    const res = await request(app).get('/api/v1/concept-graph');
    expect(res.statusCode).toBe(200);
    const { nodes, edges, misconceptions } = res.body.data;

    expect(nodes).toHaveLength(NODES.length);
    expect(nodes.find((n) => n.id === 'mutability')).toEqual({
      id: 'mutability',
      name: 'Names, Mutability & Identity',
      description: expect.any(String),
      status: 'active',
    });
    expect(nodes.find((n) => n.id === 'classes')).toMatchObject({ name: 'Classes & Objects', status: 'planned' });
    expect(edges).toContainEqual({ from: 'classes', to: 'inheritance', reason: expect.any(String) });
    expect(misconceptions.map((m) => m.id)).toEqual(MISCONCEPTION_IDS);
    expect(Object.keys(misconceptions[0]).sort()).toEqual(['belief', 'correctModel', 'id', 'topic']);
  });

  it('contains no question content or answers', async () => {
    const res = await request(app).get('/api/v1/concept-graph');
    const body = JSON.stringify(res.body.data);
    for (const field of ['"question"', '"options"', '"answer"', '"explanation"', '"distractors"', '"feedback"']) {
      expect(body).not.toContain(field);
    }
  });
});
