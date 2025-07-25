const mongoose = require('mongoose');

const quizProgressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    correctAnswers: { type: Number, default: 0 },
    answeredQuestions: { type: [String], default: [] },  
});

module.exports = mongoose.model('QuizProgress', quizProgressSchema);
