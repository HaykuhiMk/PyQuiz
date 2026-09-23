const { verifyJwt } = require('./authenticateToken');

module.exports = function (req, res, next) {
    // Header-only, deliberately: admin auth never rides a cookie, so it
    // can't be picked up by a forged cross-site request the way a
    // cookie-authenticated route could (see middleware/csrf.js).
    const token = req.header("Authorization")?.split(" ")[1];

    if (!token) return res.status(403).json({ error: "Access denied. No token provided." });

    try {
        const decoded = verifyJwt(token);
        if (decoded.role !== "admin") return res.status(403).json({ error: "Unauthorized." });

        req.admin = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token." });
    }
};
