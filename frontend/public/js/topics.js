import { api } from './api.js';

// Topics are stored and passed everywhere by their stable id (e.g.
// "mutability"); display names live only in the backend's taxonomy config
// and are served by GET /api/v1/topics. This fetches that list once per page
// and turns ids into names for display. If it can't be loaded, ids are shown
// as-is rather than breaking the page.
let taxonomyPromise = null;

export function getTopicTaxonomy() {
  if (!taxonomyPromise) {
    taxonomyPromise = api.getTopicTaxonomy().catch(() => []);
  }
  return taxonomyPromise;
}

// Resolves to a function id -> display name.
export async function getTopicNamer() {
  const topics = await getTopicTaxonomy();
  const names = new Map(topics.map((topic) => [topic.id, topic.name]));
  return (id) => names.get(id) || id;
}
