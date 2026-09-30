require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Question = require('../models/questionModel');
const { resolveMongoUri, redactMongoUri, MISSING_MONGO_URI_MESSAGE } = require('../config/mongoUri');

async function insertQuestions() {
  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error(`❌ ${MISSING_MONGO_URI_MESSAGE}`);
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    const questionsPath = path.join(__dirname, 'questions.json');
    const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));

    const existingCount = await Question.countDocuments();
    if (existingCount > 0) {
      console.log(`Database already has ${existingCount} questions — skipping seed.`);
      return;
    }

    const transformedQuestions = questionsData.map((q) => ({
      question: q.question,
      code: q.code || '',
      options: q.options,
      answer: q.answer,
      difficulty: q.difficulty || 'medium',
      primaryTopic: q.primaryTopic,
      secondaryTopics: q.secondaryTopics || [],
      explanation: q.explanation || 'No explanation provided.',
    }));

    await Question.insertMany(transformedQuestions);
    console.log(`Seeded ${transformedQuestions.length} questions.`);
  } catch (error) {
    console.error('Error inserting questions:', redactMongoUri(error.message));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

insertQuestions();
