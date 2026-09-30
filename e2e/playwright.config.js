// @ts-check
const { defineConfig } = require('@playwright/test');

const API_PORT = 7598;
const FRONTEND_PORT = 3998;

module.exports = defineConfig({
  testDir: './tests',
  // One worker: the tests share one seeded database and the per-IP auth
  // rate limits, and the suite is small enough that parallelism buys little.
  workers: 1,
  timeout: 30000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    // Uses the locally installed Google Chrome. To use Playwright's bundled
    // Chromium instead, run `npx playwright install chromium` and remove this.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node start-backend.js',
      url: `http://localhost:${API_PORT}/api/v1/questions/stats`,
      env: { E2E_API_PORT: String(API_PORT), E2E_FRONTEND_PORT: String(FRONTEND_PORT) },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'node app.js',
      cwd: '../frontend',
      url: `http://localhost:${FRONTEND_PORT}/index.html`,
      env: { PORT: String(FRONTEND_PORT), API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
