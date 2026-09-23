const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[match]));
}

const sendContactEmail = async (name, email, message) => {
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message);

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, // Send to yourself (admin)
        subject: `New Contact Form Submission from ${safeName}`,
        html: `
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${safeName}</p>
            <p><strong>Email:</strong> ${safeEmail}</p>
            <p><strong>Message:</strong></p>
            <p>${safeMessage}</p>
        `
    };

    // Send auto-reply to the user
    const autoReplyOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Thank you for contacting PyQuiz',
        html: `
            <h2>Thank you for contacting PyQuiz!</h2>
            <p>Dear ${safeName},</p>
            <p>We have received your message and will get back to you as soon as possible.</p>
            <p>Here's a copy of your message:</p>
            <p><em>${safeMessage}</em></p>
            <br>
            <p>Best regards,</p>
            <p>The PyQuiz Team</p>
        `
    };

    try {
        // Send email to admin
        await transporter.sendMail(mailOptions);
        
        // Send auto-reply to user
        await transporter.sendMail(autoReplyOptions);
        
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

const sendPasswordResetEmail = async (email, resetUrl) => {
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
        replyTo: process.env.EMAIL_USER,
    };

    await transporter.sendMail(mailOptions);
};

module.exports = {
    sendContactEmail,
    sendPasswordResetEmail
};