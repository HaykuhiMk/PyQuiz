const request = require('supertest');
const app = require('../../app');

const DEFAULT_PASSWORD = 'Passw0rd!';

function extractCookies(res) {
  const setCookie = res.headers['set-cookie'] || [];
  const jar = {};
  for (const entry of setCookie) {
    const pair = entry.split(';')[0];
    const eqIndex = pair.indexOf('=');
    jar[pair.slice(0, eqIndex).trim()] = pair.slice(eqIndex + 1);
  }
  return jar;
}

async function registerAndLogin(email, { username = 'tester', password = DEFAULT_PASSWORD } = {}) {
  await request(app).post('/api/v1/auth/register').send({ username, email, password });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  const cookies = extractCookies(res);
  return {
    cookieHeader: `token=${cookies.token}; csrfToken=${cookies.csrfToken}`,
    csrfToken: cookies.csrfToken,
    tokenCookieValue: cookies.token,
  };
}

// Admin sessions ride their own httpOnly cookie plus an HMAC-bound CSRF
// token (docs/AUDIT.md Phase 4, item 11). Returns a headers object ready to
// pass to supertest's .set(...) from an /api/v1/admin/login response.
function adminSessionHeaders(loginRes) {
  const cookies = extractCookies(loginRes);
  return {
    Cookie: `adminToken=${cookies.adminToken}; adminCsrfToken=${cookies.adminCsrfToken}`,
    'X-CSRF-Token': cookies.adminCsrfToken,
  };
}

module.exports = { DEFAULT_PASSWORD, extractCookies, registerAndLogin, adminSessionHeaders };
