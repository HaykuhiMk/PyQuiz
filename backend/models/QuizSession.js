const mongoose = require("mongoose");

const QuizSessionSchema = new mongoose.Schema({
    email: { type: String, required: true },
    startTime: { type: Date, default: Date.now },
    status: { type: String, enum: ["in-progress", "completed"], default: "in-progress" },
});

module.exports = mongoose.model("QuizSession", QuizSessionSchema);
