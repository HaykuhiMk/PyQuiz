const Contact = require('../models/contact');
const { sendContactEmail } = require('../utils/emailUtils');

const submitContact = async (req, res) => {
    try {
        const { name, email, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }
        const contact = new Contact({
            name,
            email,
            message
        });
        await contact.save();
        try {
            await sendContactEmail(name, email, message);
        } catch (emailError) {
            console.error('Failed to send email:', emailError);
        }
        res.status(201).json({ message: 'Message sent successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    submitContact
}; 