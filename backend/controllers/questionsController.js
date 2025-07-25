const Question = require("../models/questionModel");

async function getAllTopics(req, res) {
    try {
        const topics = await Question.distinct("topics");
        res.json(topics.sort());
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch topics" });
    }
}

async function fetchQuestionsFromDB(selectedTopics = []) {
    try {
        const query = selectedTopics.length > 0 
            ? { topics: { $in: selectedTopics } }
            : {};
            
        return await Question.find(query);
    } catch (error) {
        return [];
    }
}

async function addQuestionToDB(questionData) {
    try {
        const newQuestion = new Question(questionData);
        await newQuestion.save();
        return { success: true, message: "Question added successfully!" };
    } catch (error) {
        return { success: false, message: "Failed to add question." };
    }
}

async function addQuestion(req, res) {
    const questionData = req.body;
    if (!questionData.question || !questionData.options || !questionData.answer) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    const result = await addQuestionToDB(questionData);
    if (result.success) {
        res.status(201).json({ message: result.message });
    } else {
        res.status(500).json({ error: result.message });
    }
}

async function getAllQuestions(req, res) {
    const selectedTopics = req.query.topics ? req.query.topics.split(',') : [];
    const questions = await fetchQuestionsFromDB(selectedTopics);
    res.json(questions);
}

async function getRandomQuestion(req, res) {
    const selectedTopics = req.query.topics ? req.query.topics.split(',') : [];
    const query = selectedTopics.length > 0 
        ? { topics: { $in: selectedTopics } }
        : {};
        
    try {
        const question = await Question.aggregate([
            { $match: query },
            { $sample: { size: 1 } }
        ]);
        
        if (!question.length) {
            return res.status(404).json({ error: "No questions found for selected topics" });
        }
        
        res.json(question[0]);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}

module.exports = { getAllQuestions, getRandomQuestion, addQuestion, getAllTopics };
