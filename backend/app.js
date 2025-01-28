require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.static(path.join(__dirname, '../frontend/public')));

const questionsRoutes = require('./routes/questionsRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const resetPasswordRoutes = require('./routes/resetPassword'); // Add this line

app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/pyquiz')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Database connection error:', err));

app.use('/api/questions', questionsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/reset_password', resetPasswordRoutes); 

app.get('/', (req, res) => {
    res.send('Welcome to the PyQuiz backend!');
});

app.get('/password_reset_link_success.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'password_reset_link_success.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

