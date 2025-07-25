const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
    const token =
        (req.cookies && req.cookies.token) ||
        (req.headers.authorization && req.headers.authorization.split(" ")[1]);

    if (!token) {
        return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next(); 
    } catch (error) {
        return res.status(401).json({ error: "Unauthorized. Invalid token." });
    }
};

module.exports = authenticate;
