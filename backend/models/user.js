const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    avatar: { type: String, default: null },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" },
    banned: { type: Boolean, default: false },
    stats: {
        currentStreak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        totalPoints: { type: Number, default: 0 },
        totalCorrect: { type: Number, default: 0 },
        totalAnswered: { type: Number, default: 0 },
        lastAnsweredAt: { type: Date, default: null },
        timedModes: {
            blitzBestScore: { type: Number, default: 0 },
            survivalBestStreak: { type: Number, default: 0 }
        }
    },
    achievements: {
        type: [{
            key: { type: String, required: true },
            unlockedAt: { type: Date, required: true }
        }],
        default: []
    },
    dailyChallenge: {
        date: { type: String, default: null },
        score: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        completedAt: { type: Date, default: null }
    },
    topicStats: {
        type: [{
            topic: { type: String, required: true },
            correct: { type: Number, default: 0 },
            attempted: { type: Number, default: 0 }
        }],
        default: []
    }
});

userSchema.index({ "stats.totalPoints": -1, "stats.bestStreak": -1 });

userSchema.methods.isValidPassword = async function (password) {
    return bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
