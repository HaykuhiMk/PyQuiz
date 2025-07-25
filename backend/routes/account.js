const express = require("express");
const router = express.Router();
const User = require("../models/user");
const QuizSession = require("../models/QuizSession"); 
const authenticate = require("../middleware/authenticateToken"); 
const QuizProgress = require('../models/quizProgress');

router.get("/account", authenticate, async (req, res) => {
    if (!req.user) {
        return res.json({ success: false, message: "Unauthorized" });
    }
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        const quizProgress = await QuizProgress.findOne({ userId: user._id });
        if (!quizProgress) {
            return res.json({ success: false, message: "Quiz progress not found" });
        }
        res.json({
            success: true,
            user: {
                username: user.username,
                email: user.email,
                rank: user.rank || "Beginner",
                answeredQuestions: quizProgress.answeredQuestions.length,  
                unansweredQuestions: totalQuestions - quizProgress.answeredQuestions.length,  
                badges: user.badges || []
            }
        });
    } catch (error) {
        console.error("Error fetching account details:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

router.post("/start-quiz", authenticate, async (req, res) => {
    try {
        if (!req.user || !req.user.email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }
        await QuizSession.create({
            email: req.user.email,
            startTime: new Date(),
            status: "in-progress"
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error starting quiz:", error);
        res.status(500).json({ success: false, message: "Failed to start quiz", error: error.message });
    }
});


router.post("/logout", (req, res) => {
    req.logout();
    res.json({ success: true });
});

router.post("/update-progress", authenticate, async (req, res) => {
    const { questionId } = req.body;

    if (!req.user) return res.json({ success: false, message: "Unauthorized" });
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.json({ success: false, message: "User not found" });
        if (!user.answeredQuestions.includes(questionId)) {
            user.answeredQuestions.push(questionId);
            await user.save();
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Error updating progress:", error);
        res.json({ success: false, message: "Failed to update progress" });
    }
});

router.get("/get-progress", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ answeredQuestions: user.answeredQuestions.length, totalQuestions: 146 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
