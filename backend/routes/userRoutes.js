const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/user');

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

module.exports = router;
