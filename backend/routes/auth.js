const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/user'); 
const nodemailer = require('nodemailer');  
const router = express.Router();
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret'; 

router.post('/forgot_password', async (req, res) => {
    console.log('JWT_SECRET:', process.env.JWT_SECRET);

    const { email } = req.body;
    console.log('Email received for password reset:', email);

    try {
        const user = await User.findOne({ email });
        console.log('User found:', user); 

        if (!user) {
            console.log('User not found in the database'); 
            return res.status(404).json({ error: 'User not found.' });
        }

        const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        console.log('Reset token generated:', resetToken);
        const resetUrl = `http://127.0.0.1:5000/api/auth/reset_password/${resetToken}`;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,  
                pass: process.env.EMAIL_PASS  
            }
        });
        console.log('Email User:', process.env.EMAIL_USER);
        console.log('Email Pass:', process.env.EMAIL_PASS); 

        const mailOptions = {
            from: process.env.EMAIL_USER, 
            to: email,                    
            subject: 'Password Reset Request',
            text: `Click the link to reset your password: ${resetUrl}`
        };
        
        await transporter.sendMail(mailOptions);
        console.log('Password reset email sent successfully');
        res.status(200).json({ message: 'Password reset email sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error.' });
    }
});
router.post('/reset_password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Hash the new password and update the user
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        res.status(200).json({ message: 'Password successfully reset.' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(400).json({ error: 'Invalid or expired reset token.' });
    }
});


router.get('/reset_password/:token', (req, res) => {
    console.log('Request received for reset password page with token:', req.params.token);

    const filePath = path.join(__dirname, '../public/reset_password.html');
    console.log('Serving reset password page from:', filePath);
    
    res.sendFile(filePath);
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
module.exports = router;
