// routes/forgotPassword.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/user');
const ResetPassword = require('../models/resetPassword');
const nodemailer = require('nodemailer');

// Forgot Password Route
router.post('/forgot_password', async (req, res) => {
    console.log('Received request at /api/auth/forgot_password');

    const { email } = req.body;
    
    try {
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Generate a unique reset key
        const resetKey = crypto.randomBytes(20).toString('hex');

        // Store or update resetKey in DB
        await ResetPassword.findOneAndUpdate(
            { email },
            { resetKey, createdAt: Date.now() },
            { upsert: true, new: true }
        );
        
        // Construct password reset URL
        const resetUrl = `http://127.0.0.1:5000/reset_password.html?resetKey=${resetKey}`;
        console.log('🔑 Reset URL:', resetUrl);

        // Setup email transport
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request',
            text: `Click the link below to reset your password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`
        };

        // Send email
        transporter.sendMail(mailOptions, (error) => {
            if (error) {
                return res.status(500).json({ error: 'Error sending email' });
            }
            // Send JSON response with a success message
            return res.status(200).json({ message: 'Password reset email sent.' });
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        // Send JSON response with a server error message
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
