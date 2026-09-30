require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const app = express();

// API used when the site is opened on this machine (localhost/127.0.0.1)
// and the one used everywhere else.
const API_URL = process.env.API_URL || process.env.API_URI || 'http://localhost:7498';
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api-pyquiz.picsartacademy.am';

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Content-Security-Policy for the frontend (docs/AUDIT.md Phase 4, "Review
// the Helmet configuration"). No 'unsafe-inline' for scripts: every page's
// scripts are external files (the theme bootstrap is /js/theme-init.js, the
// API config is served below as /js/config.js, and no inline on* handler
// attributes remain). Third-party script origins are only the two CDNs the
// pages actually load from: jsDelivr (Prism.js on the Study page) and cdnjs
// (Font Awesome on the admin contacts page). Styles do allow
// 'unsafe-inline': pages and rendered templates use style="" attributes,
// and Font Awesome's script injects a <style> element — a much lower risk
// than inline script. connect-src lists exactly the API origins this server
// hands to the client in /js/config.js; pointing the frontend at any other
// API origin needs that origin added here too.
const isProduction = process.env.NODE_ENV === 'production';
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", ...new Set([originOf(API_URL), originOf(PRODUCTION_API_URL)].filter(Boolean))],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        // Only upgrade in production: locally the API is plain http://localhost.
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    // HSTS only makes sense once served over HTTPS.
    strictTransportSecurity: isProduction,
  })
);

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
