const express = require("express");
const router = express.Router();
const Question = require("../models/Question");
const User = require("../models/user"); 
const jwt = require("jsonwebtoken"); 
const { getAllTopics } = require("../controllers/questionsController");

const SECRET_KEY = process.env.JWT_SECRET;
async function isAdmin(req, res, next) {
    try {
        const token = req.headers.authorization?.split(" ")[1]; 
        if (!token) {
            return res.status(401).json({ error: "Unauthorized: No token provided" });
        }

        const decoded = jwt.verify(token, SECRET_KEY); 
        const user = await User.findById(decoded.userId); 

        if (!user || user.role !== "admin") {
            return res.status(403).json({ error: "Forbidden: Admins only" });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("❌ Authentication error:", error);
        res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
}

router.get("/topics", async (req, res) => {
    try {
        const topics = await getAllTopics();
        res.json(topics);
    } catch (err) {
        console.error("❌ Error fetching topics:", err);
        res.status(500).json({ error: "Failed to fetch topics" });
    }
});

router.get("/random", async (req, res) => {
    try {
        const query = {};
        if (req.query.topics) {
            const topics = req.query.topics.split(',');
            query.topics = { $in: topics };
        }
        
        const question = await Question.aggregate([
            { $match: query },
            { $sample: { size: 1 } }
        ]);
        
        if (!question.length) {
            return res.status(404).json({ error: "No questions found for selected topics" });
        }
        
        res.json(question[0]); 
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/add", isAdmin, async (req, res) => {
    try {
        const { question, code, options, answer, difficulty, topics, explanation } = req.body;

        if (!question || !options || !answer) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const newQuestion = new Question({
            question,
            code: code || "",
            options,
            answer,
            difficulty: difficulty || "medium",
            topics: topics || [],
            explanation: explanation || "",
        });

        await newQuestion.save();
        res.status(201).json({ message: "Question added successfully!" });
    } catch (err) {
        console.error("❌ Error adding question:", err);
        res.status(500).json({ error: "Failed to add question" });
    }
});

module.exports = router;
