const { verifyJwt, findValidSessionAccount } = require('./authenticateToken');
const { authCookieName } = require('../utils/authCookies');

// Admin auth rides its own httpOnly cookie, separate from the regular-user
// session cookie (docs/AUDIT.md Phase 4, item 11 — moved off a localStorage
// Bearer token, which any script running on the page could read). Only that
// cookie is accepted: no Authorization header, and never the regular-user
// cookie. Because a cookie is sent automatically, every state-changing admin
// route also runs verifyAdminCsrf (middleware/csrf.js).
//
// Status codes match regular-user auth: 401 whenever there is no valid
// session (no cookie, a malformed or expired token, a revoked tokenVersion,
// a banned or deleted account), so the frontend sends the admin back to the
// login page; 403 only when the session is valid but belongs to an account
// that isn't an admin (including an admin who has since been demoted).
module.exports = async function (req, res, next) {
    const token = req.cookies?.[authCookieName('admin')];

    if (!token) return res.status(401).json({ error: "Authentication required." });

    let decoded;
    try {
        decoded = verifyJwt(token);
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired session." });
    }

    let account;
    try {
        account = await findValidSessionAccount(decoded);
    } catch (error) {
        return next(error);
    }

    if (!account) {
        return res.status(401).json({ error: "Invalid or expired session." });
    }

    // The JWT's role claim is only what was true at login; the account is
    // re-checked too, so a demoted admin loses access immediately.
    if (decoded.role !== "admin" || account.role !== "admin") {
        return res.status(403).json({ error: "Admin access required." });
    }

    req.admin = decoded;
    next();
};
