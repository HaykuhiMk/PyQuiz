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

questionSchema.index({ difficulty: 1 });
questionSchema.index({ topics: 1 });
questionSchema.index({ difficulty: 1, topics: 1 });

const Question = mongoose.model("Question", questionSchema);
module.exports = Question;
