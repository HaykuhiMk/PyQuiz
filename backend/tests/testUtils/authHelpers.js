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

module.exports = { DEFAULT_PASSWORD, extractCookies, registerAndLogin };
