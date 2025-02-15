require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const forgotPasswordRoutes = require('./routes/forgotPassword'); // Import forgotPassword route
console.log('ForgotPassword route loaded');  // Add this line

const resetPasswordRoutes = require('./routes/resetPassword');
const loginRoutes = require('./routes/login');

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/pyquiz')
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ Database connection error:', err));

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', forgotPasswordRoutes);  // Correct the path here
app.use('/api/auth', resetPasswordRoutes); // Ensure it's mounted correctly
app.use('/api/auth', loginRoutes);

// Other routes (your additional routes for questions, users, etc.)
const questionsRoutes = require('./routes/questionsRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/questions', questionsRoutes);
app.use('/api/users', userRoutes);
app.use('/api', dashboardRoutes);

// Default route
app.get('/', (req, res) => {
    res.send('🚀 Welcome to the PyQuiz backend!');
});

app.get('/password_reset_link_success.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'password_reset_link_success.html'));
});

// app.post('/api/auth/forgot_password', (req, res) => {
//     res.json({ message: 'Test POST route hit' });
// });

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🌍 Server running on http://localhost:${PORT}`);
});
