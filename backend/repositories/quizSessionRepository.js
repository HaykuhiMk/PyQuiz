const QuizSession = require('../models/quizSession');

async function create(payload) {
  return QuizSession.create(payload);
}

async function findById(id) {
  return QuizSession.findById(id);
}

async function save(session) {
  return session.save();
}

module.exports = { create, findById, save };
