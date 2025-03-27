const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
    const token = req.header("Authorization")?.split(" ")[1]; 

    if (!token) return res.status(403).json({ error: "Access denied. No token provided." });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== "admin") return res.status(403).json({ error: "Unauthorized." });

        req.admin = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token." });
    }
};
