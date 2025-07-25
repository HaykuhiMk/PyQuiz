const express = require("express");
const router = express.Router();
const { getRandomQuestion, getAllQuestions, addQuestion, getAllTopics } = require("../controllers/questionsController");
const Question = require("../models/questionModel");

router.get("/debug", async (req, res) => {
    try {
        const count = await Question.countDocuments();
        const sample = await Question.findOne();
        res.json({
            count,
            sampleQuestion: sample,
            message: count === 0 ? "No questions found in database" : `Found ${count} questions`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/topics", getAllTopics);
router.get("/random", async (req, res) => {
    try {
        const query = {};
        if (req.query.topics) {
            const topics = req.query.topics.split(',');
            query.topics = { $in: topics };
        }
        if (req.query.excludeIds) {
            const excludeIds = req.query.excludeIds.split(',');
            query._id = { $nin: excludeIds };
        }
        const totalQuestions = await Question.countDocuments(query);
        const availableTopics = req.query.topics ? req.query.topics.split(',').join(', ') : 'all';
        if (totalQuestions === 0) {
            return res.status(200).json({ 
                noMoreQuestions: true,
                message: `No more questions available for topics: ${availableTopics}`,
                totalAnswered: req.query.excludeIds ? req.query.excludeIds.split(',').length : 0
            });
        }
        const randomSkip = Math.floor(Math.random() * totalQuestions);
        const question = await Question.findOne(query).skip(randomSkip);
        if (!question) {
            return res.status(200).json({ 
                noMoreQuestions: true,
                message: `No questions found for topics: ${availableTopics}`
            });
        }
        res.json(question);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/", getAllQuestions);
router.post("/add", addQuestion);

module.exports = router;
