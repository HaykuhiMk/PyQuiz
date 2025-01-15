const express = require('express');
const router = express.Router();
const { getRandomQuestion } = require('../controllers/questionsController');

router.get('/random', getRandomQuestion);

module.exports = router;
