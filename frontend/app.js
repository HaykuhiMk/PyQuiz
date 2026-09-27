require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

// API used when the site is opened on this machine (localhost/127.0.0.1)
// and the one used everywhere else.
const API_URL = process.env.API_URL || process.env.API_URI || 'http://localhost:7498';
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api-pyquiz.picsartacademy.am';

app.get('/js/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`const runtimeOverride = window.__PYQUIZ_API_URL__;
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE_URL = runtimeOverride ||
    (isLocal ? ${JSON.stringify(API_URL)} : ${JSON.stringify(PRODUCTION_API_URL)});
export default API_BASE_URL;
`);
});

app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

app.use(express.static(path.join(__dirname, 'views')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
