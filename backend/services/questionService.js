const questionRepository = require('../repositories/questionRepository');
const userAnsweredQuestionRepository = require('../repositories/userAnsweredQuestionRepository');
const AppError = require('../core/AppError');
const mongoose = require('mongoose');

function sanitizeQuestion(question) {
  if (!question) return question;
  return {
    _id: question._id,
    question: question.question,
    code: question.code || '',
    options: question.options,
    difficulty: question.difficulty,
    primaryTopic: question.primaryTopic,
    secondaryTopics: question.secondaryTopics || [],
  };
}

// A topic filter matches a question via its primaryTopic OR any of its
// secondaryTopics (docs/AUDIT.md Phase 3 taxonomy revision) — mastery and
// weak-topic detection are the only things that use primaryTopic alone
// (topicMasteryService).
function buildQuestionQuery({ topics = [], difficulty, excludeIds = [] }) {
  const query = {};

  if (topics.length) {
    query.$or = [{ primaryTopic: { $in: topics } }, { secondaryTopics: { $in: topics } }];
  }

  if (difficulty) {
    query.difficulty = difficulty;
  }

  if (excludeIds.length) {
    query._id = {
      $nin: excludeIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  return query;
}

async function getTopics() {
  const topics = await questionRepository.findDistinctTopics();
  return topics.filter(Boolean).sort();
}

// Public aggregate counts for the About page (GET /api/v1/questions/stats):
// numbers only, no question content. topicCount uses the same visible-topic
// list the quiz filters show (topics with at least one question).
async function getPublicStats() {
  const [totalQuestions, topics] = await Promise.all([
    questionRepository.countQuestions({}),
    getTopics(),
  ]);
  return { totalQuestions, topicCount: topics.length };
}

async function findQuestionPage({ topics = [], difficulty, excludeIds = [], page = 1, limit = 20 }) {
  const query = buildQuestionQuery({ topics, difficulty, excludeIds });
  const total = await questionRepository.countQuestions(query);
  const questions = await questionRepository.findQuestionsPaginated(query, { page, limit });

  return {
    questions,
    meta: {
      total,
      page,
      limit,
      totalPages: total ? Math.ceil(total / limit) : 0,
      hasNextPage: page * limit < total,
    },
  };
}

// Public quiz listing: answers and explanations are stripped.
async function getQuestionsByFilters(filters) {
  const result = await findQuestionPage(filters);
  return { questions: result.questions.map(sanitizeQuestion), meta: result.meta };
}

// Study mode shows each question with its answer and explanation, so it
// gets the full documents; studyService picks the fields it returns.
async function getQuestionsForStudy(filters) {
  return findQuestionPage(filters);
}

async function getRandomQuestion({ topics = [], difficulty, excludeIds = [] }) {
  const query = buildQuestionQuery({ topics, difficulty, excludeIds });

  const totalQuestions = await questionRepository.countQuestions(query);
  if (!totalQuestions) {
    return {
      noMoreQuestions: true,
      message: 'No questions found for selected filters.',
      totalAnswered: excludeIds.length,
    };
  }

  const question = await questionRepository.findRandomQuestion(query);
  return sanitizeQuestion(question);
}

async function addQuestion(payload) {
  if (!payload.question || !payload.options || !payload.answer) {
    throw new AppError('Missing required fields', 400);
  }

  return questionRepository.createQuestion(payload);
}

async function getQuestionsForAdmin(filters) {
  return findQuestionPage(filters);
}

async function getQuestionByIdForAdmin(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Question not found', 404);
  }

  const question = await questionRepository.findQuestionById(id);
  if (!question) {
    throw new AppError('Question not found', 404);
  }

  return question;
}

async function updateQuestion(id, payload) {
  const existing = await getQuestionByIdForAdmin(id);

  const merged = {
    options: existing.options,
    answer: existing.answer,
    primaryTopic: existing.primaryTopic,
    secondaryTopics: existing.secondaryTopics || [],
    ...payload,
  };

  if (!merged.options.includes(merged.answer)) {
    throw new AppError('Answer must be one of the provided options', 400);
  }
  if (merged.secondaryTopics.includes(merged.primaryTopic)) {
    throw new AppError('A topic cannot be both the primary topic and a secondary topic', 400);
  }

  const updated = await questionRepository.updateQuestionById(id, payload);
  return updated;
}

async function deleteQuestion(id) {
  await getQuestionByIdForAdmin(id);
  await questionRepository.deleteQuestionById(id);
  // Cascades UserAnsweredQuestion so a deleted question can never keep
  // counting toward a user's "answered"/coverage totals (docs/AUDIT.md
  // item 7 / Phase 3 addendum). AnswerEvent is left alone — it's an
  // immutable attempt log, not a current-state record, and topic
  // accuracy/coverage are computed against the live Question collection
  // anyway, so a deleted question's events simply stop contributing.
  await userAnsweredQuestionRepository.deleteAllForQuestion(id);
}

async function checkAnswer(questionId, { selectedIndex, reveal = false } = {}) {
  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    throw new AppError('Question not found', 404);
  }

  const question = await questionRepository.findQuestionById(questionId);
  if (!question) {
    throw new AppError('Question not found', 404);
  }

  const correctIndex = question.options.indexOf(question.answer);
  const isCorrect =
    selectedIndex !== undefined && selectedIndex !== null && Number(selectedIndex) === correctIndex;

  const result = { isCorrect };
  if (isCorrect || reveal) {
    result.correctIndex = correctIndex;
    result.correctAnswer = question.answer;
    result.explanation = question.explanation;
  }

  return result;
}

module.exports = {
  getTopics,
  getPublicStats,
  getQuestionsByFilters,
  getQuestionsForStudy,
  getQuestionsForAdmin,
  getQuestionByIdForAdmin,
  updateQuestion,
  deleteQuestion,
  getRandomQuestion,
  addQuestion,
  checkAnswer,
};
