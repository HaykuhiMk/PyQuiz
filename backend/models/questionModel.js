const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
    question: { type: String, required: true },
    code: { type: String },
    options: { type: [String], required: true },
    answer: { type: String, required: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
    topics: { type: [String], required: true },
    explanation: { type: String, required: true }
});

const Question = mongoose.model("Question", questionSchema);
module.exports = Question;
