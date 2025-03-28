const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const ResetPassword = require('../models/resetPassword');
const path = require('path');
const router = express.Router();


router.get('/reset_password/:resetKey', (req, res) => {
    const filePath = path.join(__dirname, '../public/reset_password.html');
    res.sendFile(filePath);
});

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/;

router.post('/reset_password/:resetKey', async (req, res) => {
    const { resetKey } = req.params;
    const { password } = req.body;

    if (!passwordRegex.test(password)) {
        return res.status(400).json({
            error: 'Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character (@, $, !, %, *, ?, &, _).'
        });
    }

    try {
        const resetEntry = await ResetPassword.findOne({ resetKey });
        if (!resetEntry) {
            return res.status(400).json({ error: 'Invalid or expired reset key.' });
        }

        const user = await User.findOne({ email: resetEntry.email });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();
        await ResetPassword.deleteOne({ resetKey });
        res.status(200).json({ message: 'Password successfully reset.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
