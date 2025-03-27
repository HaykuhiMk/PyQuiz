const express = require("express");
const router = express.Router();
const { registerAdmin, adminLogin } = require("../controllers/adminController"); 
const verifyAdmin = require("../middleware/verifyAdmin");
const Question = require("../models/questionModel");

router.post("/admin-login", adminLogin);
router.post("/register-admin", registerAdmin);

router.post("/add-question", verifyAdmin, async (req, res) => {
    try {
        const newQuestion = new Question(req.body);
        await newQuestion.save();
        res.status(201).json({ message: "Question added successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add question" });
    }
});

module.exports = router;
