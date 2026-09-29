const mongoose = require('mongoose');

const resetPasswordSchema = new mongoose.Schema({
    email: { type: String, required: true },
    // SHA-256 hash of the reset key, not the key itself (docs/AUDIT.md
    // Phase 4, item 14) — a leaked copy of this collection (DB dump, backup)
    // is not directly usable to reset anyone's password. The plaintext key
    // exists only in the emailed link and the request that redeems it.
    resetKeyHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: '1h' },
});

const ResetPassword = mongoose.model('ResetPassword', resetPasswordSchema);
module.exports = ResetPassword;
