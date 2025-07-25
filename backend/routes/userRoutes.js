const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/user');
const authenticateToken = require("../middleware/authenticateToken"); 

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({
            error: 'Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character (@, $, !, %, *, ?, &, _).'
        });
    }
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            answeredQuestions: [],
        });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        console.error('Error saving user:', error);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});


router.get("/user-progress", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).select("answeredQuestions");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const totalQuestions = 146;
        const answeredCount = user.answeredQuestions.length;

        res.json({
            answered: answeredCount,
            unanswered: totalQuestions - answeredCount,
            answeredQuestions: user.answeredQuestions 
        });
    } catch (err) {
        console.error("Error fetching user progress:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/user-progress", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;  
        const { questionId } = req.body;

        if (!questionId) {
            return res.status(400).json({ error: "Question ID is required." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const answeredQuestions = new Set(user.answeredQuestions || []);
        if (!answeredQuestions.has(questionId)) {
            answeredQuestions.add(questionId);
            user.answeredQuestions = Array.from(answeredQuestions);
            await user.save();  
        }

        res.json({ message: "Progress updated successfully." });
    } catch (err) {
        console.error("Error updating user progress:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/me", authenticateToken, async (req, res) => {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: "Unauthorized. Invalid token." });
        }
        const user = await User.findById(req.user.userId).select("username email rank answeredQuestions");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const totalQuestions = 146;
        const answeredCount = Array.isArray(user.answeredQuestions) ? user.answeredQuestions.length : 0;

        res.json({
            username: user.username,
            email: user.email,  
            rank: user.rank || "Beginner",
            answered: answeredCount,
            unanswered: totalQuestions - answeredCount,
        });
    } catch (err) {
        console.error("Error fetching user data:", err);
        res.status(500).json({ error: "Server error" });
    }
});


module.exports = router;
