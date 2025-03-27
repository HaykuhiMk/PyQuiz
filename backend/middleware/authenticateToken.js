const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
    console.log("Inside authenticate middleware");  

    const token =
        (req.cookies && req.cookies.token) ||
        (req.headers.authorization && req.headers.authorization.split(" ")[1]);
    console.log("Token from cookies or header:", token);

    if (!token) {
        return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Decoded Token:", decoded); 
        req.user = decoded;
        next(); 
    } catch (error) {
        console.error("JWT Verification Error:", error.message);
        return res.status(401).json({ error: "Unauthorized. Invalid token." });
    }
};

module.exports = authenticate;
