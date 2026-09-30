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

  const status = await page.evaluate(async () => {
    const { api } = await import('/js/api.js');
    try {
      await api.getAdminUsers();
      return 'no error';
    } catch (error) {
      return error.status;
    }
  });

  expect(status).toBe(401);
  await expect(page).toHaveURL(/\/admin_login\.html$/);
});
