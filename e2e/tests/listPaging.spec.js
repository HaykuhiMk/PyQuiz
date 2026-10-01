// @ts-check
// Paged lists enable Next only when the server says another page exists
// (meta.hasNextPage). They used to treat a full page as "there's more", so a
// total that is a multiple of the page size (e.g. exactly 60 users) led to
// an empty last page.
const { test, expect, adminLogIn, registerUser, logIn } = require('./fixtures');

function fakeUsers(n) {
  return Array.from({ length: n }, (_, i) => ({
    _id: `6500000000000000000000${String(i).padStart(2, '0')}`,
    username: `paged${i}`,
    email: `paged${i}@example.com`,
    role: 'user',
    banned: false,
    stats: { totalPoints: 0, totalAnswered: 0 },
  }));
}

for (const hasNextPage of [false, true]) {
  test(`admin users: a full page with hasNextPage ${hasNextPage} ${hasNextPage ? 'enables' : 'disables'} Next`, async ({ page }) => {
    await adminLogIn(page);
    await page.route('**/api/v1/admin/users?*', (route) =>
      route.fulfill({
        json: { success: true, data: fakeUsers(20), error: null, meta: { total: hasNextPage ? 41 : 20, page: 1, limit: 20, hasNextPage } },
      })
    );
    await page.goto('/users.html');
    await expect(page.locator('#user-list-body tr')).toHaveCount(20);
    await expect(page.locator('#next-page-btn')).toBeEnabled({ enabled: hasNextPage });
    await expect(page.locator('#prev-page-btn')).toBeDisabled();
  });
}

test('admin questions: the last page disables Next', async ({ page }) => {
  await adminLogIn(page);
  await page.goto('/manage-questions.html');
  await expect(page.locator('#question-list-body tr').first()).toBeVisible();
  // The seed has 47 questions: pages 1-4 full, page 5 has 7.
  for (let p = 1; p < 5; p += 1) {
    await expect(page.locator('#next-page-btn')).toBeEnabled();
    await page.click('#next-page-btn');
    await expect(page.locator('#page-label')).toHaveText(`Page ${p + 1}`);
  }
  await expect(page.locator('#question-list-body tr')).toHaveCount(7);
  await expect(page.locator('#next-page-btn')).toBeDisabled();
});

test('Study: a full page with hasNextPage false disables Next', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  await page.route('**/api/v1/questions/study?*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.data = body.data.slice(0, 6);
    while (body.data.length < 6) body.data.push({ ...body.data[0], _id: `${body.data[0]._id.slice(0, 20)}${String(body.data.length).padStart(4, '0')}` });
    body.meta = { ...body.meta, hasNextPage: false };
    await route.fulfill({ response: res, json: body });
  });
  await page.goto('/study.html');
  await expect(page.locator('#study-cards article.study-card')).toHaveCount(6);
  await expect(page.locator('#study-next')).toBeDisabled();
});
