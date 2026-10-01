// @ts-check
// The reference Python version note (GET /api/v1/python-version) appears on
// the learner pages, and the author hint in the admin question forms.
const { test, expect, adminLogIn } = require('./fixtures');

const NOTE = 'Answers assume Python 3.9 or newer, and are checked on Python 3.9 and 3.14.';

for (const path of ['/questions.html', '/about.html']) {
  test(`${path} shows the Python version note`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('[data-python-note]')).toHaveText(NOTE);
  });
}

test('the admin add and edit forms show the author hint by the code field', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/admin_dashboard.html');
  await expect(page.locator('#code-python-hint')).toContainText('Python 3.9 and every newer version');
  await expect(page.locator('#code')).toHaveAttribute('aria-describedby', 'code-python-hint');
  await page.goto('/manage-questions.html');
  await expect(page.locator('#edit-code-python-hint')).toHaveText(/Python 3\.9 and every newer version/);
});
