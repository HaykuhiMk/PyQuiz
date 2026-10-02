// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const API_PORT = 7598;
const FRONTEND_PORT = 3998;
// The rate-limit tests' own pair (start-backend.js): real limits, same database.
const LIMITED_API_PORT = 7599;
const LIMITED_FRONTEND_PORT = 3999;
const RATE_LIMIT_TESTS = /errors\.spec\.js/;

// Locally: the installed Google Chrome. In CI (GitHub Actions sets CI=true;
// .github/workflows/ci.yml): Playwright's own Chromium, Firefox and WebKit,
// one per job (`--project <browser> --project <browser>-rate-limits`).
const browsers = process.env.CI
  ? [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ]
  : [{ name: 'chrome', use: { channel: 'chrome' } }];

module.exports = defineConfig({
  testDir: './tests',
  // One worker: the tests share one seeded database, and the suite is small
  // enough that parallelism buys little.
  workers: 1,
  timeout: 30000,
  // CI only: one retry. In CI run #8, two Firefox tests timed out on their
  // first page.goto although the page had fully loaded in ~200 ms: Playwright
  // never received Firefox's load event (the trace shows no navigation commit
  // at all; a longer timeout would not help). Both were the first navigation
  // of a new page, from about:blank to a page sent with
  // Cross-Origin-Opener-Policy: same-origin, where Firefox switches browsing
  // context (unconfirmed: Firefox can't run on the owner's machine). A test
  // that passes on its retry is reported as "flaky" in the HTML report, not
  // hidden; one that fails twice still fails the job. Locally: no retries.
  retries: process.env.CI ? 1 : 0,
  // In CI also an HTML report (e2e/playwright-report/), uploaded with the
  // traces and screenshots when a test fails (.github/workflows/ci.yml).
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Every test runs against the main servers, which have the rate limits
  // off, except the rate-limit tests: they exhaust real limits, on servers of
  // their own, so they can't make any other test fail with a 429.
  projects: browsers.flatMap(({ name, use }) => [
    { name, use, testIgnore: RATE_LIMIT_TESTS },
    {
      name: `${name}-rate-limits`,
      use: { ...use, baseURL: `http://localhost:${LIMITED_FRONTEND_PORT}` },
      testMatch: RATE_LIMIT_TESTS,
    },
  ]),
  webServer: [
    {
      command: 'node start-backend.js',
      url: `http://localhost:${API_PORT}/api/v1/questions/stats`,
      env: { E2E_API_PORT: String(API_PORT), E2E_FRONTEND_PORT: String(FRONTEND_PORT), E2E_RATE_LIMITS: 'off' },
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
    {
      command: 'node start-backend.js',
      url: `http://localhost:${LIMITED_API_PORT}/api/v1/questions/stats`,
      env: { E2E_API_PORT: String(LIMITED_API_PORT), E2E_FRONTEND_PORT: String(LIMITED_FRONTEND_PORT), E2E_RESET: 'false' },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'node app.js',
      cwd: '../frontend',
      url: `http://localhost:${LIMITED_FRONTEND_PORT}/index.html`,
      env: { PORT: String(LIMITED_FRONTEND_PORT), API_URL: `http://localhost:${LIMITED_API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
