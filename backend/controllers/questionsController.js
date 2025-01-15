const { readQuestions } = require('../database/db');

exports.getRandomQuestion = (req, res) => {
    const questions = readQuestions();
    const randomIndex = Math.floor(Math.random() * questions.length);
    const randomQuestion = questions[randomIndex];
    res.json(randomQuestion);
};

