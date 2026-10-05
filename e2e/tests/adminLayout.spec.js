// @ts-check
// The admin pages' layout: the shared app-shell sidebar, phone widths
// without sideways scrolling, the edit panel on Manage Questions, and form
// errors shown on the page instead of in alert() dialogs.
const { test, expect, adminLogIn } = require('./fixtures');

const ADMIN_PAGES = [
  { path: '/admin_dashboard.html', title: 'Add a question', link: 'Add a question' },
  { path: '/manage-questions.html', title: 'Questions', link: 'Questions' },
  { path: '/users.html', title: 'Users', link: 'Users' },
  { path: '/contacts.html', title: 'Messages', link: 'Messages' },
];

test('every admin page has the sidebar, marks the current page and shows its title', async ({ page }) => {
  await adminLogIn(page);
  for (const { path, title, link } of ADMIN_PAGES) {
    await page.goto(path);
    const nav = page.getByRole('navigation', { name: 'Admin' });
    await expect(nav.getByRole('link')).toHaveText(['Add a question', 'Questions', 'Users', 'Messages']);
    await expect(nav.getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.pq-sidelink[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page.locator('.pq-app-topbar__title')).toHaveText(title);
    await expect(page.locator('#logout-btn')).toBeVisible();
    // No link to a page that doesn't exist (there used to be "Analytics").
    await expect(page.locator('a[href*="analytics"]')).toHaveCount(0);
  }
});

test('on a phone no admin page scrolls sideways, and the menu opens as a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await adminLogIn(page);
  for (const { path } of ADMIN_PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(widths.page, `${path} is no wider than the screen`).toBeLessThanOrEqual(widths.viewport);
  }
  const sidebar = page.locator('#pq-sidebar');
  await expect(sidebar).toBeHidden();
  await page.click('#sidebar-toggle');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Users' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sidebar).toBeHidden();
});

test('Manage Questions edits in a side panel that Esc, Cancel and a click outside close', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/manage-questions.html');
  const panel = page.locator('#edit-question-section');
  const firstEdit = page.locator('#question-list-body .edit-btn').first();

  await firstEdit.click();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#edit-question-text')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(firstEdit).toBeFocused();

  await firstEdit.click();
  await page.click('#cancel-edit-btn');
  await expect(panel).toBeHidden();

  await firstEdit.click();
  await page.mouse.click(20, 400); // on the backdrop, left of the panel
  await expect(panel).toBeHidden();
  await expect(page.locator('#edit-backdrop')).toBeHidden();
});

test('form errors are shown on the page, not in a browser dialog', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    dialog.dismiss();
  });
  await adminLogIn(page);

  // Add form: an answer that isn't one of the options.
  await page.goto('/admin_dashboard.html');
  await page.fill('#question-text', 'What will be the output?');
  await page.fill('#options', 'a\nb');
  await page.fill('#answer', 'c');
  await page.fill('#explanation', 'Because.');
  await page.click('#question-form button[type="submit"]');
  await expect(page.locator('#question-success')).toHaveText('The correct answer must be one of the options.');
  await expect(page.locator('#question-success')).toHaveClass(/is-error/);

  // Edit panel: the same mistake.
  await page.goto('/manage-questions.html');
  await page.locator('#question-list-body .edit-btn').first().click();
  await page.fill('#edit-answer', 'definitely not an option');
  await page.click('#edit-question-form button[type="submit"]');
  await expect(page.locator('#edit-status')).toHaveText('The correct answer must be one of the options.');
  await expect(page.locator('#edit-status')).toHaveClass(/is-error/);

  expect(dialogs).toEqual([]);
});
