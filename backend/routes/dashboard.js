const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken'); 

router.get('/dashboard', authenticateToken, (req, res) => {
    res.send('This is a protected dashboard page');
});

module.exports = router;
