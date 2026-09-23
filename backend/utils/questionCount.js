const Question = require('../models/questionModel');

let cachedTotal = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

async function getTotalQuestionCount() {
  const now = Date.now();
  if (cachedTotal !== null && now - cachedAt < CACHE_MS) {
    return cachedTotal;
  }
  cachedTotal = await Question.countDocuments();
  cachedAt = now;
  return cachedTotal;
}

module.exports = { getTotalQuestionCount };
