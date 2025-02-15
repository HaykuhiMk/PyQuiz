const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/user');
const authenticateToken = require("../middleware/authenticateToken"); // Ensure correct path

router.post('/register', async (req, res) => {
    console.log('hello user:'); 

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
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
        });
        console.log('Saving user:', newUser); 

        await newUser.save();

        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        console.error('Error saving user:', error);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

router.get("/me", authenticateToken, async (req, res) => {
    try {
        // Fetch user data using req.user.id (set by authenticateToken middleware)
        const user = await User.findById(req.user.id).select("username answered unanswered");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Send response with user data
        res.json({
            username: user.username,
            answered: user.answered || 0,
            unanswered: user.unanswered || 0,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;