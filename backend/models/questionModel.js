const mongoose = require("mongoose");
const { TOPIC_IDS } = require("../config/topicTaxonomy");

const questionSchema = new mongoose.Schema({
    question: { type: String, required: true },
    code: { type: String },
    options: { type: [String], required: true },
    answer: { type: String, required: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
    // The concept a learner must understand to answer correctly (docs/
    // AUDIT.md Phase 3 taxonomy revision) — not the data type in the code.
    // Mastery/weak-topic detection use this field only.
    primaryTopic: { type: String, enum: TOPIC_IDS, required: true },
    // Optional, used only for filtering/search (a quiz/study topic filter
    // matches a question via primaryTopic OR secondaryTopics).
    secondaryTopics: { type: [{ type: String, enum: TOPIC_IDS }], default: [] },
    explanation: { type: String, required: true }
});

questionSchema.index({ difficulty: 1 });
questionSchema.index({ primaryTopic: 1 });
questionSchema.index({ secondaryTopics: 1 });
questionSchema.index({ difficulty: 1, primaryTopic: 1 });

const Question = mongoose.model("Question", questionSchema);
module.exports = Question;
