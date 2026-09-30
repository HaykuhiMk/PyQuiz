const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    // Kept in sync with `username` by the pre-validate hook below; the unique
    // index lives here (not on `username` itself) so uniqueness is
    // case-insensitive (docs/AUDIT.md item 9 / Phase 3 addendum) without
    // needing a collation-based index. `sparse` so the index doesn't choke
    // on documents from before this field existed — see
    // backend/scripts/backfillUsernameLower.js, which should run once
    // against any existing database before relying on the constraint.
    usernameLower: { type: String, required: true, unique: true, sparse: true },
    avatar: { type: String, default: null },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" },
    banned: { type: Boolean, default: false },
    // Embedded in every issued JWT (docs/AUDIT.md Phase 4) and compared on
    // every authenticated request; bumping this immediately invalidates
    // every token issued before the bump, regardless of its own expiry.
    // Incremented on ban, password change, and password reset.
    tokenVersion: { type: Number, default: 0 },
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
    }
});

userSchema.index({ "stats.totalPoints": -1, "stats.bestStreak": -1 });

// pre('validate'), not pre('save'): Mongoose runs required-field validation
// (usernameLower is required) before pre('save') hooks fire, so setting it
// there would always be one save too late.
userSchema.pre("validate", function (next) {
    if (this.isModified("username") || !this.usernameLower) {
        this.usernameLower = this.username.toLowerCase();
    }
    next();
});

userSchema.methods.isValidPassword = async function (password) {
    return bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
