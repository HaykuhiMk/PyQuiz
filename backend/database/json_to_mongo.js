require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Question = require('../models/questionModel');

async function insertQuestions() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pyquiz';

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
    console.error('Error inserting questions:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

insertQuestions();
