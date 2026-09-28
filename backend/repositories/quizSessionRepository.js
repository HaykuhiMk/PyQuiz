const crypto = require('crypto');
const QuizSession = require('../models/quizSession');

async function create(payload) {
  return QuizSession.create({ ...payload, token: crypto.randomBytes(32).toString('hex') });
}

async function findByToken(token) {
  return QuizSession.findOne({ token });
}

async function save(session) {
  return session.save();
}

module.exports = { create, findByToken, save };
