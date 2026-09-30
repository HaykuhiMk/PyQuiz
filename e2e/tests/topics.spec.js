// @ts-check
// Stable topic ids in the UI: pages send ids and show display names. This is
// the browser-level regression test for the comma bug: filtering by
// "Names, Mutability & Identity" used to fail with 400, because the name
// contains a comma and the API's ?topics= filter is split on commas.
const { test, expect, API, registerUser, logIn, adminLogIn } = require('./fixtures');

test('Study mode filters by "Names, Mutability & Identity" and shows display names', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  await page.goto('/study.html');

  // The page also loads unfiltered cards on arrival; wait for the filtered request.
  const studyRequest = page.waitForResponse(
    (res) => res.url().includes('/api/v1/questions/study') && new URL(res.url()).searchParams.has('topics')
  );
  await page.fill('#study-search', 'Names, Mutability');
  await expect(page.locator('#study-search-help')).toContainText('Names, Mutability & Identity');
  await page.click('#study-load-btn');

  const res = await studyRequest;
  expect(res.status()).toBe(200);
  expect(new URL(res.url()).searchParams.get('topics')).toBe('mutability');
  await expect(page.locator('#study-cards .study-card').first()).toBeVisible();
  await expect(page.locator('#study-feedback')).not.toContainText(/failed|error/i);
  await expect(page.locator('#study-cards')).toContainText('Names, Mutability & Identity');
});

test('the admin question list filters by "Names, Mutability & Identity"', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/manage-questions.html');

  await expect(page.locator('#filter-topic option[value="mutability"]')).toHaveText('Names, Mutability & Identity');
  await page.selectOption('#filter-topic', 'mutability');
  const listRequest = page.waitForResponse((res) => res.url().includes('/api/v1/admin/questions?'));
  await page.click('#filter-btn');

  const res = await listRequest;
  expect(res.status()).toBe(200);
  expect(new URL(res.url()).searchParams.get('topics')).toBe('mutability');
  await expect(page.locator('#question-list-body tr').first()).toContainText('Names, Mutability & Identity');
});

test('the quiz topic picker sends ids and labels them with names', async ({ page, request }) => {
  const topics = (await (await request.get(`${API}/api/v1/questions/topics`)).json()).data;
  await page.goto('/index.html');
  await page.click('#guest-btn');
  const mutability = page.locator('.topic-checkbox[value="mutability"]');
  await expect(mutability).toBeAttached();
  await expect(page.locator('label[for="topic-mutability"]')).toHaveText('Names, Mutability & Identity');
  expect(await page.locator('.topic-checkbox').count()).toBe(topics.length);
});
