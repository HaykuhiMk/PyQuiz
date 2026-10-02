// @ts-check
// Admin session expiry mid-page: once the admin session is gone, the next
// admin API call gets 401 (not 403) and the page returns to the admin login.
const { test, expect, adminLogIn } = require('./fixtures');

test('an admin page redirects to the admin login when the session ends mid-page', async ({ page, context }) => {
  await adminLogIn(page);
  await page.goto('/users.html');
  await expect(page).toHaveURL(/\/users\.html$/);

  // The session ends while the page is open (cookie expired or cleared).
  await context.clearCookies({ name: 'adminToken' });

  // The next admin API call. The page navigates away as soon as it sees the
  // 401, so the result is read from the network, not returned by evaluate:
  // whether evaluate's return value arrives before that navigation tears the
  // page down is engine timing (Chromium delivered it; Firefox and WebKit
  // didn't).
  const response = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/v1/admin/users' && res.request().method() === 'GET');
  await page.evaluate(() => {
    import('/js/api.js').then(({ api }) => api.getAdminUsers().catch(() => {}));
  });

  expect((await response).status()).toBe(401);
  await expect(page).toHaveURL(/\/admin_login\.html$/);
});
