// @ts-check
// Admin question forms: each wrong option can be tagged with a misconception
// from the concept graph and short feedback (docs/CONCEPT_GRAPH.md Stage 2).
// The add form saves the tags, and the edit form loads and changes them.
const { test, expect, adminLogIn } = require('./fixtures');

const QUESTION = `E2E distractor question ${Date.now()}`;

test('the add form saves misconception tags, and the edit form loads and changes them', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/admin_dashboard.html');

  await page.fill('#question-text', QUESTION);
  await page.fill('#code', 'a = [1, 2]\nb = a\nb.append(3)\nprint(a)');
  await page.fill('#options', '[1, 2]\n[1, 2, 3]\nError');
  await page.fill('#answer', '[1, 2, 3]');

  // One row per wrong option; none for the correct answer.
  const rows = page.locator('#distractor-fields .distractor-row');
  await expect(rows).toHaveCount(2);
  await expect(page.locator('#distractor-fields .distractor-row[data-option="[1, 2, 3]"]')).toHaveCount(0);

  const copyRow = page.locator('#distractor-fields .distractor-row[data-option="[1, 2]"]');
  await copyRow.locator('select').selectOption('mutability.assignment-copies');
  await copyRow.locator('input').fill('b = a does not copy the list.');

  await page.selectOption('#difficulty', 'easy');
  // Numbers & Arithmetic has no seed questions, so the edit list below shows only this one.
  await page.selectOption('#primary-topic', 'numbers');
  await page.fill('#explanation', 'b and a name the same list.');

  const addRequest = page.waitForResponse((res) => res.url().includes('/api/v1/questions/add'));
  await page.click('#question-form button[type="submit"]');
  const added = await addRequest;
  expect(added.status()).toBe(201);
  expect(added.request().postDataJSON().distractors).toEqual([
    { option: '[1, 2]', misconceptionId: 'mutability.assignment-copies', feedback: 'b = a does not copy the list.' },
  ]);
  await expect(page.locator('#question-success')).toContainText('added');
  await expect(page.locator('#distractor-fields .distractor-row')).toHaveCount(0);

  await page.goto('/manage-questions.html');
  await page.selectOption('#filter-topic', 'numbers');
  await page.click('#filter-btn');
  const row = page.locator('#question-list-body tr', { hasText: QUESTION });
  await row.locator('.edit-btn').click();

  const editCopyRow = page.locator('#edit-distractor-fields .distractor-row[data-option="[1, 2]"]');
  await expect(editCopyRow.locator('select')).toHaveValue('mutability.assignment-copies');
  await expect(editCopyRow.locator('input')).toHaveValue('b = a does not copy the list.');

  // Tag the other wrong option too, and clear the first one's misconception.
  await page
    .locator('#edit-distractor-fields .distractor-row[data-option="Error"] select')
    .selectOption('types.implicit-str-number-coercion');
  await editCopyRow.locator('select').selectOption('');

  const updateRequest = page.waitForResponse((res) => res.request().method() === 'PATCH');
  await page.click('#edit-question-form button[type="submit"]');
  expect((await updateRequest).status()).toBe(200);

  const stored = await page.evaluate(async (text) => {
    const { api } = await import('/js/api.js');
    const [question] = (await api.getAdminQuestions({ topics: ['numbers'], page: 1, limit: 100 })).filter(
      (q) => q.question === text
    );
    await api.deleteQuestion(question._id);
    return question.distractors;
  }, QUESTION);
  expect(stored).toEqual([
    { option: '[1, 2]', feedback: 'b = a does not copy the list.' },
    { option: 'Error', misconceptionId: 'types.implicit-str-number-coercion' },
  ]);
});
