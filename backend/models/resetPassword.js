const mongoose = require('mongoose');

const resetPasswordSchema = new mongoose.Schema({
    email: { type: String, required: true },
    resetKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: '1h' }, 
});

const ResetPassword = mongoose.model('ResetPassword', resetPasswordSchema);
module.exports = ResetPassword;

