const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/user');
const ResetPassword = require('../models/resetPassword');
const nodemailer = require('nodemailer');

router.post('/forgot_password', async (req, res) => {
    console.log('Received request at /api/auth/forgot_password');

    const { email } = req.body;
    
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const resetKey = crypto.randomBytes(20).toString('hex');
        await ResetPassword.findOneAndUpdate(
            { email },
            { resetKey, createdAt: Date.now() },
            { upsert: true, new: true }
        );

        const resetUrl = `http://127.0.0.1:5500/frontend/public/reset_password.html?resetKey=${resetKey}`;
        
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, 
            auth: {
                user: process.env.EMAIL_USER, 
                pass: process.env.EMAIL_PASS  
            }
        });

        const mailOptions = {
            from: `"Support Team" <${process.env.EMAIL_USER}>`,  
            to: email, 
            subject: 'Password Reset Request',
            text: `Hello,\n\nPlease click the link below to reset your password:\n\n${resetUrl}\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nSupport Team`,
            html: `<p>Hello,</p>
                   <p>Please click the link below to reset your password:</p>
                   <a href="${resetUrl}">Reset Password</a>
                   <p>If you did not request this password reset, please ignore this email.</p>
                   <p>Best regards,</p>
                   <p>Support Team</p>`,
            replyTo: process.env.EMAIL_USER 
        };

        transporter.sendMail(mailOptions, (error, info) => { 
            if (error) {
                console.error('Error sending email:', error);
                return res.status(500).json({ error: 'Error sending email' });
            }
            return res.status(200).json({ message: 'Password reset email sent.' });
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
