// @ts-check
// The admin panel's helpers: pick the correct answer by clicking an option,
// secondary topics as checkboxes (kept in sync with the hidden select the
// form reads), filters that apply as soon as they change, list counts, and
// the admin sign-in's busy state.
const { test, expect, API, ADMIN, adminLogIn } = require('./fixtures');

test('add form: clicking an option makes it the correct answer, and says when a typed answer matches none', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/admin_dashboard.html');
  await page.fill('#options', 'a\nb\nc');
  const chips = page.locator('#answer-picker .answer-chip');
  await expect(chips).toHaveText(['a', 'b', 'c']);

  await chips.nth(1).click();
  await expect(page.locator('#answer')).toHaveValue('b');
  await expect(page.locator('#answer-picker .answer-chip[aria-pressed="true"]')).toHaveText('✓b');
  // The wrong-option tags follow the picked answer: a and c.
  await expect(page.locator('#distractor-fields .distractor-row')).toHaveCount(2);

  await page.fill('#answer', 'd');
  await expect(page.locator('#answer-picker .answer-picker__note')).toHaveText("This answer isn't one of the options yet.");
  await page.fill('#options', 'a\na');
  await expect(page.locator('#answer-picker .answer-picker__note')).toHaveText('Two options are the same: every option must be different.');
});

test('add form: secondary topics are checkboxes, the primary topic is disabled, and they are saved', async ({ page, request }) => {
  await adminLogIn(page);
  await page.goto('/admin_dashboard.html');
  await page.selectOption('#primary-topic', 'lists');
  const chips = page.locator('#secondary-topic-chips');
  await expect(chips.locator('input[value="lists"]')).toBeDisabled();
  await chips.locator('label', { hasText: 'Strings' }).click();
  await chips.locator('label', { hasText: 'Dictionaries' }).click();
  await expect(page.locator('#secondary-topics')).toBeHidden();

  // Picking a ticked topic as primary unticks it.
  await page.selectOption('#primary-topic', 'dicts');
  await expect(chips.locator('input[value="dicts"]')).not.toBeChecked();
  await expect(chips.locator('input[value="dicts"]')).toBeDisabled();

  const QUESTION = `Topic checkboxes ${Date.now()}?`;
  await page.fill('#question-text', QUESTION);
  await page.fill('#options', 'x\ny');
  await page.locator('#answer-picker .answer-chip', { hasText: 'x' }).click();
  await page.fill('#explanation', 'Because.');
  await page.click('#question-form button[type="submit"]');
  await expect(page.locator('#question-success')).toContainText('added');
  // The form is cleared for the next question, checkboxes included.
  await expect(chips.locator('input:checked')).toHaveCount(0);

  // Read it back through the admin API with the page's session.
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await request.get(`${API}/api/v1/admin/questions?limit=100`, { headers: { Cookie: cookieHeader } });
  const saved = (await res.json()).data.find((q) => q.question === QUESTION);
  expect(saved.primaryTopic).toBe('dicts');
  expect(saved.secondaryTopics).toEqual(['strings']);

  // Delete it again: other tests count the seed's 47 questions.
  const me = await request.get(`${API}/api/v1/admin/me`, { headers: { Cookie: cookieHeader } });
  const { csrfToken } = (await me.json()).data;
  const del = await request.delete(`${API}/api/v1/admin/questions/${saved._id}`, {
    headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrfToken },
  });
  expect(del.ok()).toBe(true);
});

test('edit panel: the answer picker and topic checkboxes show the loaded question', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/manage-questions.html');
  await page.locator('#question-list-body .edit-btn').first().click();
  const answer = await page.locator('#edit-answer').inputValue();
  await expect(page.locator('#edit-answer-picker .answer-chip[aria-pressed="true"]')).toHaveText(`✓${answer}`);
  const selected = await page.$eval('#edit-secondary-topics', (s) => Array.from(s.selectedOptions).map((o) => o.value));
  const checked = await page.$$eval('#edit-secondary-topic-chips input:checked', (boxes) => boxes.map((b) => b.value));
  expect(checked.sort()).toEqual(selected.sort());
});

test('questions list: filters apply when changed, the count follows them, and Clear filters resets', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/manage-questions.html');
  const count = page.locator('#list-count');
  await expect(count).toHaveText(/^\d+ questions?$/);
  await expect(page.locator('#clear-filters-btn')).toBeHidden();

  await page.selectOption('#filter-difficulty', 'hard');
  await expect(count).toHaveText(/^\d+ questions? match(es)?$/);
  await expect(page.locator('#question-list-body .admin-diff').first()).toHaveText('hard');
  await expect(page.locator('#clear-filters-btn')).toBeVisible();

  await page.click('#clear-filters-btn');
  await expect(page.locator('#filter-difficulty')).toHaveValue('');
  await expect(count).toHaveText(/^\d+ questions?$/);
});

test('users and messages show their totals', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/users.html');
  await expect(page.locator('#list-count')).toHaveText(/^\d+ accounts?$/);
  await page.goto('/contacts.html');
  await expect(page.locator('#list-count')).toHaveText(/^\d+ messages?$/);
});

test('admin sign-in: the button says it is signing in, and comes back after a wrong password', async ({ page }) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/v1/admin/login', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/admin_login.html');
  await expect(page.locator('#admin-username')).toBeFocused();
  await page.fill('#admin-username', ADMIN.username);
  await page.fill('#admin-password', 'not the password');
  const button = page.locator('#admin-login-form button[type="submit"]');
  await button.click();
  await expect(button).toHaveText('Signing in…');
  await expect(button).toBeDisabled();
  release();
  await expect(page.locator('#login-error')).not.toBeEmpty();
  await expect(button).toHaveText('Sign in');
  await expect(button).toBeEnabled();
});
