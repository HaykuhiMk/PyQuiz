const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const questionsRoutes = require('./routes/questionsRoutes');
const authRoutes = require('./routes/authRoutes'); // Import auth routes

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/api/questions', questionsRoutes);
app.use('/api/auth', authRoutes); // Add auth routes

// Serve static files for frontend
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Catch-all route for serving the frontend index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
