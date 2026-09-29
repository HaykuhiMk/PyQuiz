const { verifyJwt, findValidSessionAccount } = require('./authenticateToken');
const { authCookieName } = require('../utils/authCookies');

// Admin auth rides its own httpOnly cookie, separate from the regular-user
// session cookie (docs/AUDIT.md Phase 4, item 11 — moved off a localStorage
// Bearer token, which any script running on the page could read). Only that
// cookie is accepted: no Authorization header, and never the regular-user
// cookie. Because a cookie is sent automatically, every state-changing admin
// route also runs verifyAdminCsrf (middleware/csrf.js).
module.exports = async function (req, res, next) {
    const token = req.cookies?.[authCookieName('admin')];

    if (!token) return res.status(403).json({ error: "Access denied. No token provided." });

    let decoded;
    try {
        decoded = verifyJwt(token);
    } catch (err) {
        return res.status(401).json({ error: "Invalid token." });
    }

    if (decoded.role !== "admin") return res.status(403).json({ error: "Unauthorized." });

    let account;
    try {
        account = await findValidSessionAccount(decoded);
    } catch (error) {
        return next(error);
    }

    // The JWT's role claim is only what was true at login; the account is
    // re-checked too, so a demoted admin loses access immediately.
    if (!account || account.role !== "admin") {
        return res.status(401).json({ error: "Invalid token." });
    }

    req.admin = decoded;
    next();
};
