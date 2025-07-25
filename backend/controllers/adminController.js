const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); 
const jwt = require("jsonwebtoken");
const User = require("../models/user");

exports.adminLogin = async (req, res) => {
    try {
        const { username, password } = req.body; 

        const admin = await User.findOne({ username, role: "admin" });
        if (!admin) {
            return res.status(404).json({ error: "Admin not found" });
        }
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const token = jwt.sign(
            { id: admin._id, role: "admin" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.registerAdmin = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existingAdmin = await User.findOne({ email, role: "admin" });
        if (existingAdmin) {
            return res.status(400).json({ error: "Admin already exists" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newAdmin = new User({
            username,
            email,
            password: hashedPassword,
            role: "admin"
        });

        await newAdmin.save();
        res.status(201).json({ message: "Admin registered successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to register admin" });
    }
};
