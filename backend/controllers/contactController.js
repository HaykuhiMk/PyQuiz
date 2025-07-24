const Contact = require('../models/contact');
const { sendContactEmail } = require('../utils/emailUtils');

const submitContact = async (req, res) => {
    try {
        const { name, email, message } = req.body;

        // Validate input
        if (!name || !email || !message) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        // Create new contact submission
        const contact = new Contact({
            name,
            email,
            message
        });

        // Save to database
        await contact.save();

        // Send emails
        try {
            await sendContactEmail(name, email, message);
        } catch (emailError) {
            console.error('Failed to send email:', emailError);
            // We still return success since we saved to DB, but log the email error
        }

        res.status(201).json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error in contact submission:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    submitContact
}; 