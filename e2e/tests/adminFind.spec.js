// @ts-check
// Every production question has the same prompt ("What will be the output
// of the following code?"), so the admin list shows each question's id and
// the first line of its code, and "Find by id" opens a question for editing.
const { test, expect, API, ADMIN, PASSWORD, adminLogIn } = require('./fixtures');

test('the list shows ids and first code lines; find by id opens the edit form', async ({ page, playwright }) => {
  const admin = await playwright.request.newContext({ baseURL: API });
  await admin.post('/api/v1/admin/login', { data: { username: ADMIN.username, password: PASSWORD } });
  const [first] = (await (await admin.get('/api/v1/admin/questions?page=1&limit=10')).json()).data;
  const target = (await (await admin.get('/api/v1/admin/questions?page=3&limit=10')).json()).data[4];
  await admin.dispose();
  const firstLine = (code) => code.split('\n').find((l) => l.trim()).replace(/\t/g, '    ').trim();

  await adminLogIn(page);
  await page.goto('/manage-questions.html');
  const row = page.locator('#question-list-body tr').first();
  await expect(row.locator('td').nth(0)).toHaveText(first._id);
  await expect(row.locator('td').nth(2)).toHaveText(firstLine(first.code).slice(0, 80));

  // A question that isn't on the first page.
  await page.fill('#find-question-id', target._id);
  await page.click('#find-question-form button[type="submit"]');
  await expect(page.locator('#edit-question-section')).toBeVisible();
  await expect(page.locator('#edit-question-id')).toHaveText(`Editing question ${target._id}`);
  await expect(page.locator('#edit-code')).toHaveValue(target.code);
  await expect(page.locator('#edit-answer')).toHaveValue(target.answer);

  await page.fill('#find-question-id', 'not-an-id');
  await page.click('#find-question-form button[type="submit"]');
  await expect(page.locator('#find-question-status')).toHaveText('A question id is 24 characters, 0-9 and a-f.');

  await page.fill('#find-question-id', '0123456789abcdef01234567');
  await page.click('#find-question-form button[type="submit"]');
  await expect(page.locator('#find-question-status')).toHaveText('No question with id 0123456789abcdef01234567.');
});
