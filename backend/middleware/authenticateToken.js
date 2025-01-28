// Create a directory 'middleware' (if not already created) and then create the 'authenticateToken.js' file inside it.
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    // Check for the token in the 'Authorization' header (Bearer token format)
    const token = req.header('Authorization') && req.header('Authorization').split(' ')[1];
    
    // If no token, deny access
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    // Verify the token
    jwt.verify(token, 'your_jwt_secret', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token.' });

        // Attach the decoded user to the request object
        req.user = user;
        
        // Continue to the next middleware or route handler
        next();
    });
}

module.exports = authenticateToken;
