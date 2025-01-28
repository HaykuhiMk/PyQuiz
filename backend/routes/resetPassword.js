const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/user'); 
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

router.post('/reset_password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        res.status(200).json({ message: 'Password successfully reset.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Invalid or expired reset token.' });
    }
});

module.exports = router;
