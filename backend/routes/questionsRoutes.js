const express = require("express");
const router = express.Router();
const { getRandomQuestion, getAllQuestions, addQuestion } = require("../controllers/questionsController");

router.get("/random", getRandomQuestion);
router.get("/", getAllQuestions);
router.post("/add", addQuestion);

module.exports = router;
