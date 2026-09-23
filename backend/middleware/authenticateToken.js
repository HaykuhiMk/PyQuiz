const jwt = require('jsonwebtoken');

// Shared by authenticateToken and verifyAdmin so both middlewares decode a
// JWT the same way instead of maintaining two independent implementations.
function extractToken(req) {
    const authHeader = req.headers.authorization || "";
    const headerToken = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    return (req.cookies && req.cookies.token) || headerToken;
}

function verifyJwt(token) {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

const authenticate = (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    try {
        req.user = verifyJwt(token);
        next();
    } catch (error) {
        return res.status(401).json({ error: "Unauthorized. Invalid token." });
    }
};

module.exports = authenticate;
module.exports.extractToken = extractToken;
module.exports.verifyJwt = verifyJwt;
