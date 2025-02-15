// const express = require('express');
// const jwt = require('jsonwebtoken');
// const bcrypt = require('bcrypt');
// const crypto = require('crypto');
// const User = require('../models/user');
// const ResetPassword = require('../models/resetPassword');
// const nodemailer = require('nodemailer');
// const path = require('path');
// const router = express.Router();

// const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// // Forgot Password Route
// router.post('/forgot_password', async (req, res) => {
//     const { email } = req.body;
//     console.log('Received password reset request for email:', email);

//     try {
//         const user = await User.findOne({ email });
//         if (!user) {
//             console.log('User not found:', email);
//             return res.status(404).json({ error: 'User not found.' });
//         }

//         // Generate reset key
//         const resetKey = crypto.randomBytes(20).toString('hex');
//         console.log('Generated reset key:', resetKey);

//         // Save to DB
//         await ResetPassword.findOneAndUpdate(
//             { email },
//             { resetKey, createdAt: Date.now() },
//             { upsert: true, new: true }
//         );

//         const resetUrl = `http://127.0.0.1:5000/reset_password.html?resetKey=${resetKey}`;
//         console.log('Reset URL:', resetUrl);

//         // Send email
//         const transporter = nodemailer.createTransport({
//             service: 'gmail',
//             auth: {
//                 user: process.env.EMAIL_USER,
//                 pass: process.env.EMAIL_PASS
//             }
//         });

//         const mailOptions = {
//             from: process.env.EMAIL_USER,
//             to: email,
//             subject: 'Password Reset Request',
//             text: `Click the link below to reset your password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`
//         };

//         transporter.sendMail(mailOptions, (error, info) => {
//             if (error) {
//                 console.error('Error sending email:', error);
//                 return res.status(500).json({ error: 'Error sending email' });
//             }
//             console.log('Email sent:', info.response);
//             res.status(200).json({ message: 'Password reset email sent.' });
//         });

//     } catch (error) {
//         console.error('Forgot password error:', error);
//         res.status(500).json({ error: 'Server error.' });
//     }
// });

// // Reset Password Route
// router.post('/reset_password/:resetKey', async (req, res) => {
//     const { resetKey } = req.params;
//     const { password } = req.body;

//     try {
//         const resetEntry = await ResetPassword.findOne({ resetKey });
//         if (!resetEntry) {
//             return res.status(400).json({ error: 'Invalid or expired reset token.' });
//         }

//         const user = await User.findOne({ email: resetEntry.email });
//         if (!user) {
//             return res.status(404).json({ error: 'User not found.' });
//         }

//         const hashedPassword = await bcrypt.hash(password, 10);
//         user.password = hashedPassword;
//         await user.save();

//         await ResetPassword.deleteOne({ resetKey });

//         res.status(200).json({ message: 'Password successfully reset.' });

//     } catch (error) {
//         console.error('Reset password error:', error);
//         res.status(500).json({ error: 'Server error.' });
//     }
// });

// // Serve Reset Password Page
// router.get('/reset_password/:resetKey', (req, res) => {
//     const filePath = path.join(__dirname, '../public/reset_password.html');
//     res.sendFile(filePath);
// });

// module.exports = router;
