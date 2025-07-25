const express = require("express");
const router = express.Router();
const User = require("../models/user");
const bcrypt = require("bcryptjs");  
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        if (!user.password) {
            return res.status(500).json({ error: "User password not set" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            expires: new Date(Date.now() + 3600000),
        });

        res.cookie("auth_token", token, {
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            expires: new Date(Date.now() + 3600000),
        });

        res.cookie("guestMode", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            expires: new Date(0),
        });

        res.json({ 
            message: "Login successful", 
            token,
            user: {
                id: user._id,
                email: user.email,
                username: user.username
            }
        });

    } catch (error) {
        console.error("❌ Error during login:", error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});

module.exports = router;
