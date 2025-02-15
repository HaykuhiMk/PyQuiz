const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/user');
const ResetPassword = require('../models/resetPassword');
const path = require('path');
const router = express.Router();


router.get('/reset_password/:resetKey', (req, res) => {
    const filePath = path.join(__dirname, '../public/reset_password.html');
    res.sendFile(filePath);
});


// Reset Password Route using resetKey
router.post('/reset_password/:resetKey', async (req, res) => {
    const { resetKey } = req.params;
    const { password } = req.body;

    try {
        const resetEntry = await ResetPassword.findOne({ resetKey });
        if (!resetEntry) {
            return res.status(400).json({ error: 'Invalid or expired reset key.' });
        }

        const user = await User.findOne({ email: resetEntry.email });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Hash new password and update user
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        // Remove the resetKey entry after successful reset
        await ResetPassword.deleteOne({ resetKey });

        res.status(200).json({ message: 'Password successfully reset.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
