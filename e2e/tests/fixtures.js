// @ts-check
// Shared by every spec: a `page` fixture that fails the test on any
// Content-Security-Policy violation or uncaught page error, plus helpers.
const { test: base, expect } = require('@playwright/test');

const API = 'http://localhost:7598';
const PASSWORD = 'Passw0rd!';

const test = base.extend({
  page: async ({ page }, use) => {
    const problems = [];
    page.on('console', (msg) => {
      if (/Content[- ]Security[- ]Policy|Refused to (load|execute|apply|connect)/i.test(msg.text())) {
        problems.push(`CSP: ${msg.text()}`);
      }
    });
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    await use(page);
    expect(problems, 'no CSP violations or uncaught page errors').toEqual([]);
  },
});

let counter = 0;
async function registerUser(request) {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`;
  const user = { username: `e2e${suffix}`, email: `e2e${suffix}@example.com`, password: PASSWORD };
  const res = await request.post(`${API}/api/v1/auth/register`, { data: user });
  expect(res.status()).toBe(201);
  return user;
}

async function logIn(page, { email, password }) {
  await page.goto('/login.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#login-form button[type="submit"]');
  await expect(page).toHaveURL(/\/account\.html$/);
}

module.exports = { test, expect, API, PASSWORD, registerUser, logIn };
