const express = require("express");
const router = express.Router();
const Question = require("../models/Question");
const User = require("../models/user"); 
const jwt = require("jsonwebtoken"); 

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

router.get("/random", async (req, res) => {
    try {
        const question = await Question.aggregate([{ $sample: { size: 1 } }]);
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
