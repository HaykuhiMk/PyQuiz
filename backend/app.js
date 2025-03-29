require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');

const forgotPasswordRoutes = require('./routes/forgotPassword');
const resetPasswordRoutes = require('./routes/resetPassword');
const loginRoutes = require('./routes/login');
const accountRoutes = require('./routes/account');
const questionsRoutes = require('./routes/questionsRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(
  cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.MONGO_URI) {
  console.error('❌ Missing MONGO_URI in .env file');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

app.use('/api/auth', forgotPasswordRoutes);
app.use('/api/auth', resetPasswordRoutes);
app.use('/api/auth', loginRoutes);
app.use('/api', accountRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/users', userRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.send('🚀 Welcome to the PyQuiz backend!');
});

app.get('/password_reset_link_success.html', (req, res) => {
  res.sendFile(
    path.join(__dirname, 'public', 'password_reset_link_success.html')
  );
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌍 Server running on http://localhost:${PORT}`);
});
