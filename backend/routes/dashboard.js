const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken'); // Import the middleware

// Example of a protected route
router.get('/dashboard', authenticateToken, (req, res) => {
    res.send('This is a protected dashboard page');
});

module.exports = router;
